var env = require('../env');
var request = require('bluebird').promisifyAll(require('request'),{multiArgs:true});

module.exports = function(msg) {
  return request.postAsync({
    url: env.get('messageEndpoint'),
    body: { text: String(msg) },
    json: true
  })
  .spread((res, body) => { if (res.statusCode !== 200) throw body; })
  .catch(err => {
    // response sometimes doesnt include a content range header that node <3s
    var error = err && err.stack || err;
    if (String(error).indexOf('Range Not Satisfiable'))
      return;
    console.log(error);
  });
};
