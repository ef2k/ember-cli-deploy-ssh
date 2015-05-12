/* jshint node: true */
'use strict';
var CoreObject = require('core-object');
var Promise = require('ember-cli/lib/ext/promise');
var SilentError = require('ember-cli/lib/errors/silent');
var ssh2 = require('ssh2');

var noop = function () {};

/**
 * Connects to the given ssh2.Client instance.
 */
var connect = function (conn, config, cb) {

  conn.on('ready', function () {
    cb();
  });

  conn.on('error', function (error) {
    cb(error);
  });

  conn.connect({
    host: config.host,
    username: config.username,
    privateKey: require('fs').readFileSync(config.privateKeyFile),
  });
};

/**
 * Initialize, set the ssh2 client and config.
 */
var initialize = function () {
  CoreObject.prototype.init.apply(this, arguments);
  if (!this.config) {
    return Promise.reject(new SilentError('You must supply a config'));
  }
  this.conn = new ssh2.Client();
};

/**
 * Activate the target revision.
 */
var activate = function (revisionId) {
  var _this = this,
      conn = _this.conn,
      config = _this.config,
      revisionIndexFile = config.remoteDir + revisionId + '/index.html',
      indexFile = config.remoteDir + 'index.html';

  console.log('revisionIndexFile is ', revisionIndexFile);
  console.log('indexFile is ', indexFile);

  return new Promise(function (resolve, reject) {
    connect(conn, config, function (err) {

      if (err) {
        reject(err);
        return;
      }

      conn.sftp(function (err, sftp) {
        sftp.unlink(indexFile, function (err) {

          if (err) {
            reject(err);
            return;
          }

          sftp.symlink(revisionIndexFile, indexFile, function (err) {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });

        }); // unlink
      }); // conn.sftp
    }); //connect
  });
};

var excludeIndexFile = function (list) {
  return list.filter(function (item) {
    return item.filename !== 'index.html';
  });
};

var findRevisions = function (sftp, remoteDir) {
  return new Promise(function (resolve, reject) {
    sftp.readdir(remoteDir, function(err, list) {
      if (err) {
        reject(err);
      } else {
        resolve(excludeIndexFile(list));
      }
    });
  });
};

/**
 * Reads a remote file. Returns a promise.
 */
var readFile = function (metaPath, revisionId, sftp, options) {
  return new Promise(function (resolve, reject) {
    sftp.readFile(metaPath, options, function (error, data) {
      if (error) {
        reject(error);
      } else {
        resolve({filename: metaPath, data: data, revisionId: revisionId});
      }
    });
  });
};

var gatherRevisionData = function (fileList, remoteDir, sftp) {
  var filePromises = [];
  return new Promise(function (resolve, reject) {

    fileList.forEach(function (file) {
      var revisionId = file.filename,
          metaPath = remoteDir + revisionId + "/meta.json";
      filePromises.push(readFile(metaPath, revisionId, sftp));
    });

    Promise.all(filePromises).then(resolve, reject);

  });
};

var printRevisionData = function (revisionData) {
    console.log('+- Found ' + revisionData.length + ' revisions.\n');
  revisionData.forEach(function (info) {
    var data = JSON.parse(info.data)[0];
    console.log('\n');
    console.log('\t Revision: \t' + info.revisionId);
    console.log('\t Commit:   \t' + data.commit);
    console.log('\t Author:   \t' + data.author);
    console.log('\t Date:     \t' + data.date);
    console.log('\t Message:  \t' + data.message);
    console.log('\t Filepath: \t' + info.filename);
    console.log('\n');
  });
};

/**
 * List all found revisions.
 */
var list = function () {
  var _this = this,
      remoteDir = _this.config.remoteDir;

  return new Promise(function (resolve, reject) {
    connect(_this.conn, _this.config, function (error) {
      if (error) { return reject(error); }

      _this.conn.sftp(function (error, sftp) {

        if (error) { return reject(error); }

        var finding = findRevisions(sftp, remoteDir);
        finding.then(function (fileList) {
          var gathering = gatherRevisionData(fileList, remoteDir, sftp);
          gathering.then(function (revisionData) {
            printRevisionData(revisionData);
            resolve(); // Done listing.
          }, reject);
        }, reject);
        console.log('+- Connected.');

      }); // sftp

    }); // connect
  });
};

var createDirectory = function (conn, revisionDir) {
  return new Promise(function (resolve, reject) {
    conn.exec('mkdir ' + revisionDir, function (error, mkdirStream) {
      if (error) {
        reject(error);
        return;
      }
      mkdirStream.on('error', reject);
      mkdirStream.on('close', resolve);
    });
  });
};

var uploadIndex = function (sftp, indexPath, indexBuffer) {
  return new Promise(function (resolve, reject){
    var stream = sftp.createWriteStream(indexPath);
    stream.on('error', reject);
    stream.on('end', reject);
    stream.on('close', resolve);

    stream.write(indexBuffer);
    stream.end();
  });
};
var uploadMeta = function (sftp, metaPath, metaBuffer) {
  return new Promise(function (resolve, reject){
    var stream = sftp.createWriteStream(metaPath);
    stream.on('error', reject);
    stream.on('end', reject);
    stream.on('close', resolve);

    stream.write(metaBuffer);
    stream.end();
  });
};

var uploadRevisionFiles = function (conn, revisionId, indexContents, metaContents) {
  var _this = this,
      revisionDir = _this.config.remoteDir + revisionId,
      indexPath = revisionDir + '/index.html',
      metaPath = revisionDir + '/meta.json';

  return new Promise(function (resolve, reject) {
    conn.sftp(function (err, sftp) {

      if (err) {
        reject(err);
        return;
      }

      Promise.all([
        uploadIndex(sftp, indexPath, indexContents),
        uploadMeta(sftp,  metaPath, metaContents)
      ]).then(resolve, reject);

    });
  });

};

/**
 * Upload the latest revision.
 */
var upload = function (indexBuffer) {

  var _this = this;
  return new Promise(function (resolve, reject) {

    var syncExec = _this.syncExec || require('sync-exec'),
        commandResult = syncExec("git log -n 1 --pretty=format:'{%n  \"commit\": \"%H\",%n  \"author\": \"%an <%ae>\",%n  \"date\": \"%ad\",%n  \"message\": \"%f\"%n},'     $@ |     perl -pe 'BEGIN{print \"[\"}; END{print \"]\n\"}' |     perl -pe 's/},]/}]/'").stdout,
        commandResultJSON = JSON.parse(commandResult),
        shortCommitId = commandResultJSON[0].commit.slice(0, 7),
        commitMessage = commandResultJSON[0].message,
        conn = _this.conn,
        config = _this.config,
        revisionDir = config.remoteDir + shortCommitId,
        host = config.host,
        username = config.username;


    conn.on('ready', function () {
      console.log('+- Connected.');
      var creatingDir = createDirectory(conn, revisionDir);
      creatingDir.then(function () {

        console.log('+- Created directory at ' + revisionDir + '.');

        var uploadingFiles = uploadRevisionFiles.call(_this, conn, shortCommitId, indexBuffer, commandResult);

        uploadingFiles.then(function (){
          console.log('+- Uploaded revision ' + shortCommitId + ': "' + commitMessage.replace(/-/g, ' ') + '".\n');
          resolve();
        }, function(err) {
          console.log('x- Uploaded nothing - error: ', err + '\n');
          reject(err);
        });

      }, reject);
    });

    conn.on('error', reject);

    conn.connect({
      host: host,
      username: username,
      privateKey: require('fs').readFileSync(config.privateKeyFile)
    });

  });
};

/**
 * Export.
 */
module.exports = CoreObject.extend({
  init:      initialize,
  activate:  activate,
  list:      list,
  upload:    upload
});




















// module.exports = CoreObject.extend({
//   init: function() {
//     CoreObject.prototype.init.apply(this, arguments);
//     if (!this.config) {
//       return Promise.reject(new SilentError('You must supply a config'));
//     }

//     this.client = new ssh2.Client();
//   },

//   activate: function(revision) {
//     return this._getFileList()
//     .then(this._excludeCurrentRevisionFile.bind(this))
//     .then(this._getRevisions.bind(this))
//     .then(this._activateRevision.bind(this, revision))
//     .then(this._printSuccessMessage.bind(this, 'Revision activated: ' + revision));
//   },

//   list: function() {
//     var _this = this;
//     return new Promise(findRevisions);
//   },

//   upload: function(buffer) {

//     var syncExec = this.syncExec || require('sync-exec');
//     var commandResult = syncExec("git log -n 1 --pretty=format:'{%n  \"commit\": \"%H\",%n  \"author\": \"%an <%ae>\",%n  \"date\": \"%ad\",%n  \"message\": \"%f\"%n},'     $@ |     perl -pe 'BEGIN{print \"[\"}; END{print \"]\n\"}' |     perl -pe 's/},]/}]/'").stdout;
//     var commandResultJSON = JSON.parse(commandResult);

//     var shortCommitId = commandResultJSON[0].commit.slice(0, 7);
//     var commitMessage = commandResultJSON[0].message;
//     var commitDate = new Date(commandResultJSON[0].date);

//     var yr = commitDate.getFullYear() + "",
//         da = commitDate.getDate() + "",
//         mo = commitDate.getMonth() + "";

//     if (da.length === 1) { da = ("0" + da); }
//     if (mo.length === 1) { mo = ("0" + mo); }

//     if (commitMessage.length > 64) {
//       commitMessage = commitMessage.substr(0, 64);
//     }

//     var key = shortCommitId;
//     return this._uploadIfMissing(buffer, commandResult, key);
//   },

//   _list: function() {
//     return this._getFileList()
//     .then(this._sortFileList.bind(this))
//     .then(this._excludeCurrentRevisionFile.bind(this))
//     .then(this._getRevisions.bind(this));
//   },

//   _getFileList: function() {

//     var conn = this.client,
//         config = this.config;

//     var findRevisions = function (cb) {
//       conn.sftp(function (err, sftp) {

//         if (err) {
//           return cb(err);
//         }

//         sftp.readdir(config.remoteDir, function(err, list) {

//           if (err) {
//             reject(err);
//           } else {
//             conn.end();
//             cb(null, list);
//           }
//         });
//       });

//     };

//     var startFind = function (resolve, reject) {

//       conn.on('ready', function () {
//         findRevisions(function (error, list) {
//           if (error) {
//             return reject(error);
//           }
//           resolve(list);
//           conn.end();
//         });
//       });

//       conn.on('error', function (error) {
//         reject(error);
//       });

//       conn.connect({
//         host: config.host,
//         username: config.username,
//         privateKey: require('fs').readFileSync(config.privateKeyFile),
//       });
//     };

//     return new Promise(startFind);
//   },

//   _sortFileList: function(fileList) {
//     return fileList.sort(function(a, b) {
//       return b.attrs.mtime - a.attrs.mtime;
//     });
//   },

//   _getRevisions: function(files) {
//     return files.map(function(file) {
//       // return file.filename.substring(0, (file.filename.length - 5));
//       return file.filename;
//     });
//   },

//   _excludeCurrentRevisionFile: function (data) {
//     return data.filter(function (file) {
//       return file.filename !== 'index.html';
//     });
//   },

//   _activateRevision: function (targetRevision, revisions) {
//     if (revisions.indexOf(targetRevision) > -1) {
//       var conn = this.client;
//       var config = this.config;
//       var revisionFile = config.remoteDir + targetRevision + '.html';
//       var indexFile = config.remoteDir + 'index.html';
//       return new Promise(function (resolve, reject) {
//         conn.on('ready', function () {
//           conn.sftp(function(err, sftp) {
//             if (err) {
//               throw err;
//             }
//             sftp.unlink(indexFile, function (err) {
//               if (err) {
//                 throw err;
//               }
//               sftp.symlink(revisionFile, indexFile, function(err) {
//                 if (err) {
//                   reject(err);
//                 } else {
//                   conn.end();
//                   resolve();
//                 }
//               });
//             });
//           });
//         }).on('error', function (error) {
//           reject(error);
//         }).connect({
//           host: config.host,
//           username: config.username,
//           privateKey: require('fs').readFileSync(config.privateKeyFile),
//         });
//       });
//     } else {
//       return this._printErrorMessage("Revision doesn't exist");
//     }
//   },

//   /**
//    * Upload the revision if not already present on the server.
//    * Buffer contains the contents of the index.html and revisionId represents
//    * the generated identifier for this revision.
//    */
//   _uploadIfMissing: function(indexFileBufferContent, jsonFileContent, revisionId) {
//     var conn = this.client,
//         config = this.config,
//         host = config.host,
//         username = config.username,
//         revisionDir = config.remoteDir + revisionId,
//         indexPath = revisionDir + '/index.html',
//         metaPath = revisionDir + '/meta.json',
//         _this = this;

//     var createDirectory = function (cb) {
//       conn.exec('mkdir ' + revisionDir, function (error, mkdirStream) {
//         if (error) {
//           cb(error);
//         }
//         mkdirStream.on('error', function (error) {
//           cb(error);
//         });
//         mkdirStream.on('close', function () {
//           cb();
//         });
//       });
//     };

//     var uploadIndex = function (sftp, resolve, reject) {
//       var stream = sftp.createWriteStream(indexPath);

//       stream.on('error', function (error) {
//         reject(error);
//       });
//       stream.on('end', function () {
//         reject();
//       });
//       stream.on('close', function () {
//         resolve();
//       });
//       stream.write(indexFileBufferContent);
//       stream.end();
//     };

//     var uploadMeta = function (sftp, resolve, reject) {
//       var stream = sftp.createWriteStream(metaPath);

//       stream.on('error', function (error) {
//         reject(error);
//       });
//       stream.on('end', function () {
//         reject();
//       });
//       stream.on('close', function () {
//         resolve();
//       });
//       stream.write(jsonFileContent);
//       stream.end();
//     };

//     var uploadRevisionFiles = function (resolve, reject) {

//       conn.sftp(function (err, sftp) {
//         if (err) return reject(err);

//         var indexPromise = new Promise(function (resolveIndex, rejectIndex) {
//           uploadIndex(sftp, resolveIndex, rejectIndex);
//         });

//         var metaPromise = new Promise(function (resolve, reject) {
//           uploadMeta(sftp, resolve, reject);
//         });

//         Promise.all([
//           indexPromise,
//           metaPromise
//         ]).then(function () {
//           resolve();
//         }, function (error) {
//           reject(error);
//         });

//       });
//     };

//     var startUpload = function(resolve, reject) {

//       conn.on('ready', function () {
//         createDirectory(function (error) {
//           if (error) return reject(error);
//           uploadRevisionFiles(resolve, reject);
//         });
//       });

//       conn.on('error', function (error) {
//         reject(error);
//       });

//       conn.connect({
//         host: host,
//         username: username,
//         privateKey: require('fs').readFileSync(config.privateKeyFile),
//       });

//     };

//     return new Promise(startUpload);
//   },





















//   _printRevisions: function(list) {
//     var header = 'Found the following revisions:';
//     var remoteDir = this.config.remoteDir;
//     var _this = this;
//     var config = this.config;
//     var conn = this.client;
//     var filePromises = [];

//     var revisionsList = list.join('\n');
//     // TODO: Print the details for each revisions (found in meta).
//     // return this._printSuccessMessage('\n' + header + '\n\n' + revisionsList + '\n');
//     return new Promise(function (resolve, reject) {

//       /**
//        * Reads a remote file. Returns a promise.
//        */
//       var readFile = function (metaPath, sftp, options) {

//         var promiseHandler = function (fileResolve, fileReject) {
//           sftp.readFile(metaPath, options, function (error, data) {
//             if (error) {
//               fileReject(error);
//               return;
//             }
//             console.log('Got this data ', data);
//             fileResolve({filename: metaPath, data: data});
//           });
//         };
//         return new Promise(promiseHandler);
//       };

//       conn.on('ready', function () {

//         conn.sftp(function (error, sftp) {

//           list.forEach(function (revisionId) {
//             var metaPath = remoteDir + revisionId + '/meta.json';
//             filePromises.push(readFile(metaPath, sftp));
//           });

//           Promise.all(filePromises).then(function (data) {
//             console.log('Got those files')
//             resolve(data);
//           }, function (error) {
//             console.error('Got an error with those files ', error);
//             reject(error);
//           });

//         }); // conn.sftp
//       });

//       conn.on('error', function (error) {
//         console.error('A connection error');
//         reject(error);
//       });

//       conn.connect({
//         host: config.host,
//         username: config.username,
//         privateKey: require('fs').readFileSync(config.privateKeyFile),
//       });

//     });
//   },
























//   _printSuccessMessage: function (message) {
//     return this.ui.writeLine(message);
//   },

//   _printErrorMessage: function (message) {
//     return Promise.reject(new SilentError(message));
//   },

// });
