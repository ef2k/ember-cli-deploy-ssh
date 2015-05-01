# ember-cli-deploy-ssh #

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


> This project is based on this great repo: https://github.com/treyhunner/ember-deploy-ssh-index. Though, it's been modified to be serve a different purpose, lets give credit to where credit is due. On a related note, bug fixes and improvements will be pulled from upstream whenever possible.

## Directory Structure ##

```
# In your server's file directory...

/revision:abc123/
    index.html           # The index file
    revision.json        # Meta data about this revision

/revision:def456/
    ...

index.html --> /revision:abc123/index.html  # Active symlink

```