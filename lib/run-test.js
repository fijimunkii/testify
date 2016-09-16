var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var mkdirp = Promise.promisify(require('mkdirp'));
var request = Promise.promisifyAll(require('request'));
var del = require('rimraf');
var env = require('../env');
var sendMessage = require('./send-message');

module.exports = (options) => {
  var pfx;
  var tmpdir;
  var progressInterval;
  return Promise.resolve().then(() => {
      tmpdir = path.join(require('os').tmpdir(),options.project+(+new Date()));
    })
    .then(() => fs.readFileAsync(path.join(__dirname,'../cert/'+options.project+'/'+options.NODE_ENV+'.p12'))
      .then(p12 => { pfx = p12; }))
    .then(() => request.getAsync({
        uri: 'https://' + options.server + '/auth/rev',
        pfx: pfx,
        passphrase: options.certPassword
      }).spread((res, body) => {
        if (String(body).indexOf(options.rev) === -1) throw 'REV_CHECK_FAILED';
        options.res.write('&#x2713; Rev checked out<br><br>Getting ready to testify..<br><br>');
      }))
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
          .pipe(require('zlib').Gunzip())
          .pipe(require('tar').Extract({path:tmpdir}))
          .on('log', console.log)
          .on('error', reject)
          .on('finish', resolve)});
    }))
    .then(() => progressInterval && clearInterval(progressInterval))
    .catch(err => { progressInterval && clearInterval(progressInterval); throw err; })
    .then(() => { console.log('gunzipped - '+tmpdir); options.res.write('Here we go!<br><br>'); })
    .then(() => Promise.all(['cert','firefox-profiles'].map(d =>
      fs.symlinkAsync(path.join(__dirname,'../'+d+'/'+options.project),tmpdir+'/selenium/'+d))))
    .then(() => mkdirp(tmpdir+'/selenium/logs'))
    .then(() => Promise.all(options.logfiles.map(log =>
      Promise.promisify(require('touch'))(options.logdir+'/'+log))))
    .then(() => Promise.all(options.logfiles.map(log =>
      fs.symlinkAsync(options.logdir+'/'+log,tmpdir+'/selenium/logs/'+log))))
    .then(() => sendMessage('Testifying '+options.targetUrl))
    .then(() => new Promise((resolve, reject) => {
      var cmd = 'TEST_ROOT=https://'+options.server+' npm run testify';
      var test = require('child_process').exec(cmd, { cwd: tmpdir, maxBuffer: 1024 * 500 });
      var output = '';
      test.stdout.on('data', data => {
        output += String(data);
        options.res.write(String(data)
          .replace(require('ansi-regex')(),'')
          .replace(/\n/g,'<br>')
          .replace(/✓/g, '&#x2713;'));
      });
      var testTimeout = setTimeout(() => test.kill(), env.get('TEST_TIMEOUT')||1000*60*60);
      test.on('close', code => {
        clearTimeout(testTimeout);
        if (!code) resolve();
        else reject('Test failed: ' + output);
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
