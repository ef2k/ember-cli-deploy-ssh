/* jshint node: true */
'use strict';
var CoreObject = require('core-object');
var Promise = require('ember-cli/lib/ext/promise');
var SilentError = require('ember-cli/lib/errors/silent');
var ssh2 = require('ssh2');

module.exports = CoreObject.extend({
  init: function() {
    CoreObject.prototype.init.apply(this, arguments);
    if (!this.config) {
      return Promise.reject(new SilentError('You must supply a config'));
    }

    this.client = new ssh2.Client();
  },

  activate: function(revision) {
    return this._getFileList()
    .then(this._excludeCurrentRevisionFile.bind(this))
    .then(this._getRevisions.bind(this))
    .then(this._activateRevision.bind(this, revision))
    .then(this._printSuccessMessage.bind(this, 'Revision activated: ' + revision));
  },

  list: function() {
    return this._list()
    .then(this._printRevisions.bind(this));
  },

  upload: function(buffer) {

    var syncExec = this.syncExec || require('sync-exec');
    var commandResult = syncExec("git log -n 1 --pretty=format:'{%n  \"commit\": \"%H\",%n  \"author\": \"%an <%ae>\",%n  \"date\": \"%ad\",%n  \"message\": \"%f\"%n},'     $@ |     perl -pe 'BEGIN{print \"[\"}; END{print \"]\n\"}' |     perl -pe 's/},]/}]/'").stdout;
    var commandResultJSON = JSON.parse(commandResult);

    var shortCommitId = commandResultJSON[0].commit.slice(0, 7);
    var commitMessage = commandResultJSON[0].message;
    var commitDate = new Date(commandResultJSON[0].date);

    var yr = commitDate.getFullYear() + "",
        da = commitDate.getDate() + "",
        mo = commitDate.getMonth() + "";

    if (da.length === 1) { da = ("0" + da); }
    if (mo.length === 1) { mo = ("0" + mo); }

    if (commitMessage.length > 64) {
      commitMessage = commitMessage.substr(0, 64);
    }

    var key = shortCommitId;
    return this._uploadIfMissing(buffer, commandResult, key);
  },

  _list: function() {
    return this._getFileList()
    .then(this._sortFileList.bind(this))
    .then(this._excludeCurrentRevisionFile.bind(this))
    .then(this._getRevisions.bind(this));
  },

  _getFileList: function() {
    var conn = this.client;
    var config = this.config;
    return new Promise(function (resolve, reject) {
      conn.on('ready', function () {
        conn.sftp(function(err, sftp) {
          if (err) {
            throw err;
          }
          sftp.readdir(config.remoteDir, function(err, list) {
            if (err) {
              reject(err);
            } else {
              conn.end();
              resolve(list);
            }
          });
        });
      }).on('error', function (error) {
        reject(error);
      }).connect({
        host: config.host,
        username: config.username,
        privateKey: require('fs').readFileSync(config.privateKeyFile),
      });
    });
  },

  _sortFileList: function(fileList) {
    return fileList.sort(function(a, b) {
      return b.attrs.mtime - a.attrs.mtime;
    });
  },

  _getRevisions: function(files) {
    return files.map(function(file) {
      return file.filename.substring(0, (file.filename.length - 5));
    });
  },

  _excludeCurrentRevisionFile: function(data) {
    return data.filter(function (file) {
      return file.filename !== 'index.html';
    });
  },

  _activateRevision: function (targetRevision, revisions) {
    if (revisions.indexOf(targetRevision) > -1) {
      var conn = this.client;
      var config = this.config;
      var revisionFile = config.remoteDir + targetRevision + '.html';
      var indexFile = config.remoteDir + 'index.html';
      return new Promise(function (resolve, reject) {
        conn.on('ready', function () {
          conn.sftp(function(err, sftp) {
            if (err) {
              throw err;
            }
            sftp.unlink(indexFile, function (err) {
              if (err) {
                throw err;
              }
              sftp.symlink(revisionFile, indexFile, function(err) {
                if (err) {
                  reject(err);
                } else {
                  conn.end();
                  resolve();
                }
              });
            });
          });
        }).on('error', function (error) {
          reject(error);
        }).connect({
          host: config.host,
          username: config.username,
          privateKey: require('fs').readFileSync(config.privateKeyFile),
        });
      });
    } else {
      return this._printErrorMessage("Revision doesn't exist");
    }
  },

  /**
   * Upload the revision if not already present on the server.
   * Buffer contains the contents of the index.html and revisionId represents
   * the generated identifier for this revision.
   */
  _uploadIfMissing: function(indexFileBufferContent, jsonFileContent, revisionId) {
    var conn = this.client,
        config = this.config,
        host = config.host,
        username = config.username,
        revisionDir = config.remoteDir + revisionId,
        indexPath = revisionDir + '/index.html',
        metaPath = revisionDir + '/meta.json',
        _this = this;

    var createDirectory = function (cb) {
      conn.exec('mkdir ' + revisionDir, function (error, mkdirStream) {
        if (error) {
          cb(error);
        }
        mkdirStream.on('error', function (error) {
          cb(error);
        });
        mkdirStream.on('close', function () {
          cb();
        });
      });
    };

    var uploadIndex = function (sftp, resolve, reject) {
      var stream = sftp.createWriteStream(indexPath);

      stream.on('error', function (error) {
        reject(error);
      });
      stream.on('end', function () {
        reject();
      });
      stream.on('close', function () {
        resolve();
      });
      stream.write(indexFileBufferContent);
      stream.end();
    };

    var uploadMeta = function (sftp, resolve, reject) {
      var stream = sftp.createWriteStream(metaPath);

      stream.on('error', function (error) {
        reject(error);
      });
      stream.on('end', function () {
        reject();
      });
      stream.on('close', function () {
        resolve();
      });
      stream.write(jsonFileContent);
      stream.end();
    };

    var uploadRevisionFiles = function (resolve, reject) {

      conn.sftp(function (err, sftp) {
        if (err) return reject(err);

        var indexPromise = new Promise(function (resolveIndex, rejectIndex) {
          uploadIndex(sftp, resolveIndex, rejectIndex);
        });

        var metaPromise = new Promise(function (resolve, reject) {
          uploadMeta(sftp, resolve, reject);
        });

        Promise.all([
          indexPromise,
          metaPromise
        ]).then(function () {
          resolve();
        }, function (error) {
          reject(error);
        });

      });
    };

    var startUpload = function(resolve, reject) {

      conn.on('ready', function () {
        createDirectory(function (error) {
          if (error) return reject(error);
          uploadRevisionFiles(resolve, reject);
        });
      });

      conn.connect({
        host: host,
        username: username,
        privateKey: require('fs').readFileSync(config.privateKeyFile),
      });

    };

    return new Promise(startUpload);
  },

  _printRevisions: function(list) {
    var header = 'Found the following revisions:';
    var revisionsList = list.join('\n');
    return this._printSuccessMessage('\n' + header + '\n\n' + revisionsList + '\n');
  },

  _printSuccessMessage: function (message) {
    return this.ui.writeLine(message);
  },

  _printErrorMessage: function (message) {
    return Promise.reject(new SilentError(message));
  },

});
