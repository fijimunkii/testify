process.setMaxListeners(0);
var env = require('./env');
var express = require('express');
var bodyParser = require('body-parser');

var app = express();

var rollbar = require('./lib/rollbar');
if (rollbar.useRollbar) app.use(rollbar.rollbar.errorHandler());

app.use(require('body-parser').json());

app.use(require('hpp')());

app.use('/testify', require('./testify'));

app.use('/logs', require('./logs'));

var port = env.get('PORT')||5555;
app.listen(port, () => console.log('http://localhost:'+port));
