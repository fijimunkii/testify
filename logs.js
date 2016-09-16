module.exports = (req, res, next) => {
  if (/\./.test(req.originalUrl))
    return require('express').static('logs')(req, res, next);
  require('serve-index')('logs')(req, res, next);
};
