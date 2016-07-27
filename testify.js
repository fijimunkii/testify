var env = require('./env');
var sendMessage = require('./lib/send-message');
var sendStatus = require('./lib/send-status');
var getArtifacts = require('./lib/get-artifacts');
var runTest = require('./lib/run-test');
var testSync = {};

module.exports = (req, res) => {
  var key = ['username','reponame','branchname','prod'].map(d => req.query[d]).filter(d => d).join('/');
  res.write('<html><head>');
  res.write('<body>');
  res.write('<script>document.title="Testifying - '+key+'";</script>');
  var rev;
  var server;
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
    rev = artifact.sha;
    var releaseBranch = env.get('release-branch') || 'release';
    var branchname = (req.query.branchname || releaseBranch).replace(/([^\w\d\s-])/,''); 
    var NODE_ENV = (branchname === releaseBranch) ? 'production' : 'development';
    server = req.query.server && decodeURIComponent(req.query.server);
    var servers = env.get(req.query.username+'/'+req.query.reponame+':servers');
    var certPassword = env.get(req.query.username+'/'+req.query.reponame+':certPassword:'+NODE_ENV);
    if (req.query.prod && branchname === releaseBranch)
      server = server || servers.prod[0];
    else if (branchname === releaseBranch)
      server = server || servers.stg[0]; 
    else
      server = server || branchname + servers.dev[0];
    return sendStatus({
      username: req.query.username,
      reponame: req.query.reponame,
      rev: rev,
      state: 'pending',
      description: 'Testifying '+server,
      target_url: 'TODO'
    })
    .then(() => runTest({
      project: req.query.username + '-' + req.query.reponame,
      certPassword: certPassword,
      artifacts: artifact.url,
      rev: artifact.sha,
      server: server,
      NODE_ENV: NODE_ENV,
      res: res
    }));
  })
  .then(() => {
    res.write('<script>document.title=String.fromCharCode("9989")+" '+key+'";</script>');
    res.end('OK');
  })
  .then(() => sendStatus({
    username: req.query.username,
    reponame: req.query.reponame,
    rev: rev,
    state: 'success',
    description: 'Testified '+server,
    target_url: 'TODO'
  }))
  .then(() => sendMessage('Testified ' + server))
  .then(() => { delete testSync[key]; })
  .catch(err => {
    console.log(err && err.stack || err);
    if (err !== 'TEST_ALREADY_RUNNING')
      delete testSync[key];
    res.write('<script>document.title=String.fromCharCode("10008")+" '+key+'";</script>');
    res.end(err);
    // TODO: include url with message
    return Promise.all([
      sendMessage('Testify FAILED for ' + server + ' : ' + err),
      sendStatus({
        username: req.query.username,
        reponame: req.query.reponame,
        rev: rev,
        state: 'failure',
        description: 'Testify FAILED for '+server,
        target_url: 'TODO'
      })
    ]);
  });
};
