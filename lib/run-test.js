var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var mkdirp = Promise.promisify(require('mkdirp'));
var exec = require('child_process').exec;
var request = Promise.promisifyAll(require('request'));
var zlib = require('zlib');
var tar = require('tar');

module.exports = (options) => {
  var pfx;
  var tmpdir;
  return Promise.resolve().then(() => {
      tmpdir = path.join(require('os').tmpdir(),options.project+(+new Date()));
      console.log(tmpdir);
    })
    .then(() => fs.readFileAsync(path.join(__dirname,'../cert/'+options.project+'/'+options.NODE_ENV+'.p12'))
      .then(p12 => { pfx = p12; }))
    .then(() => request.getAsync({
        uri: 'https://' + options.server + '/auth/rev',
        pfx: pfx,
        passphrase: options.certPassword
      }).spread((res, body) => {
        if (String(body).indexOf(options.rev) === -1) throw 'REV_CHECK_FAILED';
        options.res.write('Rev checked out<br><br>Getting ready to testify..<br><br>');
      }))
    .then(() => mkdirp(tmpdir))
    .then(() => new Promise((resolve, reject) => {
      request(options.artifacts)
        .pipe(zlib.Gunzip())
        .pipe(tar.Extract({path:tmpdir}))
        .on('log', console.log)
        .on('error', reject)
        .on('finish', resolve);
    }))
    .then(() => { console.log('gunzipped'); options.res.write('Here we go!<br><br>'); })
    .then(() => Promise.all(['cert','firefox-profiles'].map(d =>
      fs.symlinkAsync(path.join(__dirname,'../'+d+'/'+options.project),tmpdir+'/selenium/'+d))))
    .then(() => new Promise((resolve, reject) => {
      var test = exec('TEST_ROOT=https://'+options.server+' npm run testify', {
        cwd: tmpdir,
        maxBuffer: 1024 * 500
      });
      test.stdout.on('data', data => {
        options.res.write(String(data)
          .replace(/\n/g,'<br>')
          .replace(/âœ“/g, '&#x2713;')
          .replace(/\x1B\[([0-9]{1,2}(;[0-9]{1,2})?)?[m|K]/,''));
      });
      test.on('close', code => { if (!code) resolve(); else reject() });
    }));
};
