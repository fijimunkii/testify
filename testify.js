var env = require('./env');
var sendMessage = require('./lib/send-message');
var sendStatus = require('./lib/send-status');
var getArtifacts = require('./lib/get-artifacts');
var runTest = require('./lib/run-test');
var testSync = {};

module.exports = (req, res) => {
  var key, branchname, releaseBranch, logdir, logfiles, targetUrl, rev, server, keepAliveInterval;
  return Promise.resolve().then(() => {
    releaseBranch = env.get('RELEASE_BRANCH') || 'release';
    branchname = (req.query.branchname || releaseBranch).replace(/([^\w\d\s-])/,''); 
    server = req.query.server && decodeURIComponent(req.query.server);
    var NODE_ENV = (branchname === releaseBranch) ? 'production' : 'development';
    var servers = env.get(req.query.username+'/'+req.query.reponame+':servers');
    var certPassword = env.get(req.query.username+'/'+req.query.reponame+':certPassword:'+NODE_ENV);
    if (req.query.prod && branchname === releaseBranch)
      server = server || servers.prod[0];
    else if (branchname === releaseBranch)
      server = server || servers.stg[0]; 
    else
      server = server || branchname + servers.dev[0];
    key = [req.query.username,req.query.reponame,branchname,server].join('/');
    logdir = require('path').join(__dirname, 'logs', key);
    logfiles = env.get('LOG_FILES') || ['docker.log'];
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
    var reason = '';
    var reasons = ['REV_CHECK_FAILED','TEST_ALREADY_RUNNING','Failed to find successful build'];
    if (reasons.indexOf(err) > -1)
      reason = err; 
    console.log(err && err.stack || err);
    if (err !== 'TEST_ALREADY_RUNNING')
      delete testSync[key];
    res.write('<script>document.title=String.fromCharCode("10008")+" '+key+'";</script>');
    res.end(err);
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
