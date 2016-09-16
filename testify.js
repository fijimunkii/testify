var env = require('./env');
var sendMessage = require('./lib/send-message');
var sendStatus = require('./lib/send-status');
var getArtifacts = require('./lib/get-artifacts');
var runTest = require('./lib/run-test');
var testSync = {};

module.exports = (req, res) => {
  var key, logdir, logfiles, targetUrl, rev, server, keepAliveInterval;
  return Promise.resolve().then(() => {
    key = ['username','reponame','branchname'].map(d => req.query[d]).filter(d => d).join('/');
    if (req.query.prod) key += '/prod';
    logdir = require('path').join(__dirname, 'logs', key);
    logfiles = env.get('LOG_FILES')||['docker.log'];
    targetUrl = 'https://'+env.get('hostname')+'/logs/'+key+'/'+logfiles[0];
    res.write('<html><head>');
    res.write('<body>');
    res.write('<script>document.title="Testifying - '+key+'";</script>');
  }).then(() => {
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
      description: 'Testifying ' + targetUrl,
      target_url: targetUrl
    })
    .then(() => runTest({
      project: req.query.username + '-' + req.query.reponame,
      certPassword: certPassword,
      artifacts: artifact.url,
      rev: artifact.sha,
      server: server,
      NODE_ENV: NODE_ENV,
      res: res,
      logdir: logdir,
      logfiles: logfiles,
      targetUrl: targetUrl
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
    target_url: targetUrl
  }))
  .then(() => sendMessage('Testified ' + server))
  .then(() => { delete testSync[key]; })
  .catch(err => {
    console.log(err && err.stack || err);
    if (err !== 'TEST_ALREADY_RUNNING')
      delete testSync[key];
    res.write('<script>document.title=String.fromCharCode("10008")+" '+key+'";</script>');
    res.end(err);
    return Promise.all([
      sendMessage('Testify FAILED ' + targetUrl),
      sendStatus({
        username: req.query.username,
        reponame: req.query.reponame,
        rev: rev,
        state: 'failure',
        description: 'Testify FAILED: ' + targetUrl,
        target_url: targetUrl
      })
    ]);
  });
};
