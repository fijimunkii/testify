var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var mkdirp = Promise.promisify(require('mkdirp'));
var request = Promise.promisifyAll(require('request'));
var del = require('rimraf');
var env = require('../env');
var sendMessage = require('./send-message');

module.exports = (options) => {
  var tmpdir;
  var progressInterval;
  return Promise.resolve().then(() => {
      tmpdir = path.join(require('os').tmpdir(),options.project+(+new Date()));
    })
    .then(() => fs.readFileAsync(path.join(__dirname,'../cert/'+options.project+'/'+options.NODE_ENV+'.p12'))
      .then(p12 => request.getAsync({
        uri: 'https://' + options.server + '/auth/rev',
        pfx: p12,
        passphrase: env.get(options.req.query.username+'/'+options.req.query.reponame+':certPassword:'+options.NODE_ENV)
      }).spread((res, body) => {
        if (String(body).indexOf('The SSL certificate error') !== -1) throw 'The SSL certificate error';
        if (String(body).indexOf(options.rev) === -1) throw 'REV_CHECK_FAILED';
        options.res.write('&#x2713; Rev checked out<br><br>Getting ready to testify..<br><br>');
      })))
    .then(() => mkdirp(tmpdir))
    .then(() => mkdirp(options.logdir))
    .then(() => new Promise((resolve, reject) => {
      var len = String(options.artifacts.replace(/circle-token*/,'').split('-').pop()||'').split('.')[0]||0;
      var dl = 0;
      progressInterval = setInterval(() => {
        var val = (0.10*dl/len).toFixed(0);
        if (val > 100) val = 100;
        options.res.write(val+'% ');
        if (val === 100) {
          options.res.write('<br>Just a few more moments.. ');
          clearInterval(progressInterval);
        }
      },5000);
      require('https').get(options.artifacts, res => {
        res
          .on('data', chunk => { dl += chunk.length; })
          .pipe(require('fs').createWriteStream(path.join(tmpdir,'selenium.tar.gz')))
          .on('log', console.log)
          .on('error', reject)
          .on('finish', resolve)});
    }))
    .then(() => progressInterval && clearInterval(progressInterval))
    .catch(err => { progressInterval && clearInterval(progressInterval); throw err; })
    .then(() => Promise.all(options.logfiles.map(log =>
      Promise.promisify(require('touch'))(options.logdir+'/'+log))))
    .then(() => { console.log('downloaded - '+tmpdir); options.res.write('Here we go!<br><br>'); })
    .then(() => sendMessage('Testifying '+options.targetUrl))
    .then(() => new Promise((resolve, reject) => {
      var cmd = 'docker load < '+tmpdir+'/selenium.tar.gz' +
        ' && docker run'+
        ' -v '+options.logdir+':/usr/src/app/logs'+
        ' -v '+path.join('/home/ubuntu/cert/',options.project)+':/usr/src/app/cert'+
        ' -v '+path.join('/home/ubuntu/firefox-profiles/',options.project)+':/usr/src/app/firefox-profiles'+
        ' -e TEST_ROOT=https://'+options.server+
        (options.extraTests && ' -e EXTRA_TESTS='+options.extraTests || '')+
        ' '+options.dockerTag+
        '; docker rm -fv '+options.dockerTag;
      var test = require('child_process').exec(cmd, { cwd: tmpdir, maxBuffer: 1024 * 500 });
      var output = '';
      test.stdout.on('data', data => {
        output += String(data);
        options.res.write(String(data)
          .replace(require('ansi-regex')(),'')
          .replace(/\n/g,'<br>')
          .replace(/✓/g, '&#x2713;'));
      });
      var testTimeout = setTimeout(() => {
        test.kill();
        var killCmd = 'docker stop '+options.dockertag+'; docker rm -fv '+options.dockerTag;
        require('child_process').exec(killCmd, { cwd: tmpdir, maxBuffer: 1024 * 500 });
        reject('Test failed: timed out');
      }, env.get('TEST_TIMEOUT')||1000*60*60);
      test.on('close', () => {
        clearTimeout(testTimeout);
        if (!output || output.indexOf('Test failed') !== -1)
          return reject('Test failed: ' + output);
        resolve();
      });
    }))
    .then(d => {
      del(tmpdir, function(){});
      return d;
    })
    .catch(err => {
      del(tmpdir, function(){});
      throw err;
    });
};
