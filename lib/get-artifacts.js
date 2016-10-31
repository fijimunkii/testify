var env = require('../env');
var CircleCI = require('circleci');
var Promise = require('bluebird');

module.exports = (options) => {
  var ci;
  return Promise.all(['username','reponame','branchname'].map(d => options[d] ||
    Promise.reject('Missing parameter in getArtifacts: ' + d)))
  .then(() => env.get(options.username+'/'+options.reponame+':ciToken'))
  .then(ciToken => {
    if (!ciToken) throw 'Missing env in getArtifacts: '+options.username+'/'+options.reponame+':ciToken';
    ci = new CircleCI({'auth':ciToken});
    return ci.getBuilds({
      'username': options.username,
      'project': options.reponame
    });
  })
  .then(builds => {
    if (builds.message === 'Project not found') throw 'ciToken invalid';
    var build = builds.filter && builds.filter(function(d) {
      return d.branch === options.branchname && d.outcome === 'success';
    }).shift();
    if (!build) throw 'Failed to find successful build';
    return build;
  })
  .then(build => ci.getBuildArtifacts({
      'username': options.username,
      'project': options.reponame,
      'build_num': build.build_num
    }).then(artifacts => [artifacts, build]))
  .spread((artifacts, build) => {
    if (!artifacts || !artifacts.length) throw 'Failed to find artifacts';
    return artifacts
      .filter(artifact => artifact.path.indexOf(options.reponame) !== -1)
      .filter(artifact => artifact.pretty_path.indexOf('tar.gz') !== -1)
      .filter(artifact => artifact.path.indexOf('selenium') !== -1)
      .map(artifact => {
        artifact.url = artifact.url + '?circle-token=' +
          env.get(options.username+'/'+options.reponame+':ciToken');
        artifact.sha = build.vcs_revision;
        artifact.buildNumber = build.build_num;
        return artifact;
      });
  });
};
