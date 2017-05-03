var env = require('./env');
var sendMessage = require('./lib/send-message');
var sendStatus = require('./lib/send-status');
var getArtifacts = require('./lib/get-artifacts');
var runTest = require('./lib/run-test');
var testSync = {};

module.exports = (req, res) => {
  var key, branchname, releaseBranch, logdir, logfiles, targetUrl, rev, server, keepAliveInterval, dockerTag, extraTests;
  return Promise.resolve().then(() => {
    releaseBranch = env.get('RELEASE_BRANCH') || 'release';
    branchname = (req.query.branchname || releaseBranch).replace(/([^\w\d\s-])/,''); 
    server = req.query.server && decodeURIComponent(req.query.server);
    var servers = env.get(req.query.username+'/'+req.query.reponame+':servers');
    if (req.query.prod && branchname === releaseBranch)
      server = server || servers.prod[0];
    else if (branchname === releaseBranch)
      server = server || servers.stg[0]; 
    else
      server = server || branchname + servers.dev[0];
    extraTests = env.get(req.query.username+'/'+req.query.reponame+':extraTests:'+server);
    key = [req.query.username,req.query.reponame,branchname,server].join('/');
    logdir = require('path').join('/home/ubuntu/logs/testify/', key);
    logfiles = env.get('LOG_FILES') || ['test.log','x11vnc.log','novnc.log','selenium.log'];
    targetUrl = 'https://'+env.get('hostname')+'/logs/'+key+'/'+logfiles[0];
    res.write('<html><head>');
    res.write('<body>');
    res.write('<script>document.title="Testifying - '+key+'";</script>');
    if (testSync[key])
      throw 'TEST_ALREADY_RUNNING';
    testSync[key] = true;
    ['username','reponame'].forEach(d => {
      if (!req.query[d])
        throw 'Missing query parameter: ' + d;
    }); 
    if (req.query.quick)
      res.end('OK');
  })
  .then(() => getArtifacts({
    username: req.query.username,
    reponame: req.query.reponame,
    branchname: branchname
  }))
  .then(artifacts => {
    var artifact = artifacts[0];
    rev = artifact.sha;
    dockerTag = req.query.username+'/'+req.query.reponame+'-selenium:'+branchname+'-'+rev;
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
      artifacts: artifact.url,
      rev: artifact.sha,
      dockerTag: dockerTag,
      server: server,
      NODE_ENV: (branchname === releaseBranch) ? 'production' : 'development',
      req: req,
      res: res,
      logdir: logdir,
      logfiles: logfiles,
      targetUrl: targetUrl,
      extraTests: extraTests
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
    err = String(err && err.stack || err);
    var reasons = [
      'INTEGRITY_CHECK_FAILED',
      'REV_CHECK_FAILED',
      'TEST_ALREADY_RUNNING',
      'Failed to find successful build',
      'ENOSPC: no space left on device',
      'UnexpectedAlertOpen'
    ];
    var reason = reasons.reduce((o,d) => err.indexOf(d) > -1 && d || o, '');
    console.log(err);
    if (err !== 'TEST_ALREADY_RUNNING')
      delete testSync[key];
    res.write('<script>document.title=String.fromCharCode("10008")+" '+key+'";</script>');
    res.end(String(err));
    return Promise.all([
      sendMessage('Testify FAILED ' + targetUrl + ' ' + reason),
      sendStatus({
        username: req.query.username,
        reponame: req.query.reponame,
        rev: rev,
        state: 'failure',
        description: 'Testify FAILED: ' + targetUrl + ' ' + reason,
        target_url: targetUrl
      })
    ]);
  });
};
