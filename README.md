# ember-cli-deploy-ssh #

[![](https://ember-cli-deploy.github.io/ember-cli-deploy-version-badges/plugins/ember-cli-deploy-ssh.svg)](http://ember-cli-deploy.github.io/ember-cli-deploy-version-badges/)

You should already have ember-cli-deploy installed but if you dont:

```
$ npm install --save-dev ember-cli-deploy
```

**Install**

```
$ npm install --save-dev ember-cli-deploy-ssh
```

In your `deploy.js `configuration, set `type` to `ssh` . Here's an example:

```js
// An example of deploy.js.

var developmentEnvironment = {
    // Omitted, see stagingEnvironment below.
};

var stagingEnvironment = {
  store: {
    type: 'ssh', // the default store is 'redis', use 'ssh' for this addon.
    remoteDir: process.env['APP_STAGING_REMOTE_DIR_PATH'],
    host: process.env['APP_STAGING_REMOTE_HOST_IP'],
    port: process.env['APP_STAGING_REMOTE_SSH_PORT'],
    username: process.env['APP_STAGING_REMOTE_USERNAME'],
    privateKeyFile: process.env['APP_STAGING_REMOTE_PRIVATE_KEY']
  },
  assets: {
    /* Handle your assets here. I recommmend using 'ember-cli-deploy-s3' */
  }
};

var productionEnvironment = {
    // Omitted, see stagingEnvironment above.
};

module.exports = {
  development: developmentEnvironment,
  staging: stagingEnvironment,
  production: productionEnvironment
};

```

**SSH Configuration**

The following parameters are available to setup correctly ssh:

* **host** - Hostname or IP address of the server (**required**)
* **username** - Username for authentication (**required**)
* **port** - Port of the server (**optional**)
* **privateKeyFile** - String that contains a private key for either key-based or hostbased user authentication (**optional**)
* **passphrase** - Passphrase used to decrypt private key, if needed (**optional**)
* **agent** - Path to ssh-agent's UNIX socket for ssh-agent-based user authentication (**optional**)


## Directory Structure ##

The following directory structure is created on your server. The basic gist is that your revisions will be stored inside of their own directory along with meta data about the revision (date of commit, commit message, author of the commit, and commit hash). Information about your revisions is viewable via the following command `ember deploy:list -e <your environment>`.

**List revisions**

```sh
$ ember deploy:list -e staging
```

```sh

The following revisions were found:

   Revision:  516d6e2
   Commit:    516d6e26bcb7e75c2620eae87eeb37ce1e481f8f
   Author:    Eddie Flores <eddflrs@gmail.com>
   Date:      Mon May 11 23:23:53 2015 -0400
   Message:   Hello-added
   Filepath:  /home/eddie/html/516d6e2/meta.json


   Revision:  d821149
   Commit:    d8211495be55c3e8b839ab963d9fec1910a44b05
   Author:    Eddie Flores <eddflrs@gmail.com>
   Date:      Fri May 1 08:17:40 2015 -0400
   Message:   Update-comments-in-Brocfile-for-better-documentation
   Filepath:  /home/eddie/html/d821149/meta.json

```

**Deploy revision**

```sh
$ ember deploy -e staging
```

```
# In your server's file directory...

abc123/
    index.html           # The index file
    meta.json            # Meta data about this revision

def456/
    ...

index.html --> abc123/index.html  # Active symlink

```

**Activate revision**

```sh
$ ember deploy:activate -e staging -r <revisionId>
```


> This project is based on this repo: https://github.com/treyhunner/ember-deploy-ssh-index. Though, it's been heavily modified to serve a different purpose -credit where credit is due.
