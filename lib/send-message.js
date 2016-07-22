var env = require('../env');
var request = require('bluebird').promisifyAll(require('request'),{multiArgs:true});

module.exports = function(msg) {
  return request.postAsync({
    url: env.get('messageEndpoint'),
    body: { text: String(msg) },
    json: true
  })
  .spread((res, body) => { if (res.statusCode !== 200) throw body; })
  .catch(err => console.log(err && err.stack || err));
};
