/* jshint node: true */
'use strict';
var fs = require('fs');
var CoreObject = require('core-object');
var path = require('path');
var Promise = require('ember-cli/lib/ext/promise');
var SilentError = require('silent-error');
var ssh2 = require('ssh2');

/**
 * Connects to the given ssh2.Client instance.
 */
var connect = function (conn, config, cb) {

  var ssh_config = {
    host: config.host,
    username: config.username,
    port: config.port || '22',
    agent: config.agent,
    passphrase: config.passphrase
  };

  if (typeof config.privateKeyFile !== 'undefined') {
    ssh_config['privateKey'] = require('fs').readFileSync(config.privateKeyFile);
  }

  conn.on('ready', function () {
    cb();
  });

  conn.on('error', function (error) {
    cb(error);
  });

  conn.connect(ssh_config);
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
      revisionIndexFile = path.join(config.remoteDir, revisionId, 'index.html'),
      indexFile = path.join(config.remoteDir, 'index.html');

  console.log('revisionIndexFile is ', revisionIndexFile);
  console.log('indexFile is ', indexFile);

  return new Promise(function (resolve, reject) {
    connect(conn, config, function (err) {

      if (err) {
        reject(err);
        return;
      }

      conn.sftp(function (err, sftp) {
        sftp.unlink(indexFile, function () {

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

/**
 * Excludes files from the given list. An item looks like this:
 * { filename: 'test.txt',
 *  longname: '-rw-r--r--    1 frylock   frylock         12 Nov 18 11:05 test.txt',
 *  attrs:
 *   { size: 12,
 *     uid: 1000,
 *     gid: 1000,
 *     mode: 33188,
 *     atime: 1353254750,
 *     mtime: 1353254744
 *   }
 * }
 */
var excludeFilesKeepDirs = function (remoteDir, list) {
  return list.filter(function (item) {
    var filePath = path.join(remoteDir, item.filename);
    var stat = fs.statSync(filePath);
    return stat.isDir();
  });
};

var findRevisions = function (sftp, remoteDir) {
  return new Promise(function (resolve, reject) {
    sftp.readdir(remoteDir, function(err, list) {
      if (err) {
        reject(err);
      } else {
        resolve(excludeFilesKeepDirs(remoteDir, list));
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
          metaPath = path.join(remoteDir, revisionId, "meta.json");
      var stats = fs.statSync(metaPath);

      if (stats.isFile()) {
        filePromises.push(readFile(metaPath, revisionId, sftp));
      }
    });

    Promise.all(filePromises).then(resolve, reject);

  });
};

var printRevisionData = function (revisionData) {
  console.log('+- Found ' + revisionData.length + ' revisions.\n');

  // Sort the array by date.
  revisionData.sort(function (a, b) {
    a = new Date(JSON.parse(a.info)[0].date);
    b = new Date(JSON.parse(b.info)[0].date);
    return b - a;
  });

  // Print out the info for each revision.
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
    conn.exec('mkdir -p ' + revisionDir, function (error, mkdirStream) {
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
      revisionDir = path.join(_this.config.remoteDir, revisionId),
      indexPath = path.join(revisionDir, 'index.html'),
      metaPath = path.join(revisionDir, 'meta.json');

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
        revisionDir = path.join(config.remoteDir, shortCommitId),
        ssh_config = {
          host: _this.config.host,
          username: _this.config.username,
          port: _this.config.port || '22',
          agent: _this.config.agent,
          passphrase: _this.config.passphrase
        };

    if (typeof _this.config.privateKeyFile !== 'undefined') {
      ssh_config['privateKey'] = require('fs').readFileSync(_this.config.privateKeyFile);
    }

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

    conn.connect(ssh_config);

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
