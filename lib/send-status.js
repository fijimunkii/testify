var env = require('../env');
var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'),{multiArgs:true});

module.exports = function(options) {
  var tokenpath = options.username + '/' + options.reponame + ':statusToken';
  return Promise.resolve().then(() => {
      ['username','reponame','rev','state','target_url','description']
        .map(d => { if (!options[d]) throw 'Missing option in sendStatus: '+d; });
    })
    .then(() => { if (!env.get('statusEndpoint')) throw 'Missing env in sendStatus: statusEndpoint'; })
    .then(() => env.get(tokenpath))
    .then(d => { if (!d) throw 'Missing env in sendStatus:'+tokenpath; return d; })
    .then(oauthToken => request.postAsync({
      url: env.get('statusEndpoint') + '/repos/' +
        options.username + '/' + options.reponame + '/statuses/' + options.rev,
      headers: {
        Authorization: 'token ' + oauthToken,
        'User-Agent': 'testify'
      },
      body: {
        state: options.state,
        target_url: options.target_url,
        description: options.description,
        context: 'testify'
      },
      json: true
    }))
  .spread((res, body) => { if (res.statusCode !== 201) throw body; });
};
