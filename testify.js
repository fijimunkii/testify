var env = require('./env');
var sendMessage = require('./lib/send-message');
var getArtifacts = require('./lib/get-artifacts');
var runTest = require('./lib/run-test');
var testSync = {};

module.exports = (req, res) => {
  var key = ['username','reponame','branchname','prod'].map(d => req.query[d]).filter(d => d).join('/');
  res.write('<html><head>');
  res.write('<body>');
  res.write('<script>document.title="Testifying - '+key+'";</script>');
  var destination;
  var keepAliveInterval;
  return Promise.resolve().then(() => {
    if (testSync[key])
      throw 'TEST_ALREADY_RUNNING';
    testSync[key] = true;
  }).then(() => {
    ['username','reponame'].forEach(d => {
      if (!req.query[d])
        throw 'Missing query parameter: ' + d;
    }); 
  })
  .then(() => { if (req.query.quick) res.end('OK') })
  .then(() => getArtifacts({
    username: req.query.username,
    reponame: req.query.reponame,
    branchname: req.query.branchname
  }))
  .then(artifacts => {
    var artifact = artifacts[0];
    var releaseBranch = env.get('release-branch') || 'release';
    var branchname = (req.query.branchname || releaseBranch).replace(/([^\w\d\s-])/,''); 
    var NODE_ENV = (branchname === releaseBranch) ? 'production' : 'development';
    var server = req.query.server && decodeURIComponent(req.query.server);
    var servers = env.get(req.query.username+'/'+req.query.reponame+':servers');
    var certPassword = env.get(req.query.username+'/'+req.query.reponame+':certPassword:'+NODE_ENV);
    if (req.query.prod && branchname === releaseBranch)
      server = server || servers.prod[0];
    else if (branchname === releaseBranch)
      server = server || servers.stg[0]; 
    else
      server = server || branchname + servers.dev[0];
    return runTest({
      project: req.query.username + '-' + req.query.reponame,
      certPassword: certPassword,
      artifacts: artifact.url,
      rev: artifact.sha,
      server: server,
      NODE_ENV: NODE_ENV,
      res: res
    });
  })
  .then(() => {
    delete testSync[key];
    res.write('<script>document.title="✓ - '+key+'";</script>');
    res.end('OK');
    return sendMessage(server + ' has testified.');
  })
  .catch(err => {
    console.log(err && err.stack || err);
    if (err !== 'TEST_ALREADY_RUNNING')
      delete testSync[key];
    res.write('<script>document.title="✗ - '+key+'";</script>');
    res.end(err);
    return sendMessage('Testify FAILED for ' + server + ' : ' + err);
  });
};
