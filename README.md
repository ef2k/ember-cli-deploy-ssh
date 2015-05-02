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

The following directory structure is created on your server. The basic gist is that your revisions will be stored inside of their own directory along with meta data about the revision (date of commit, commit message, author of the commit, and commit hash). Information about your revisions is viewable via the following command `ember deploy:list -e <your environment>`. Output will look like this:

```sh

The following revisions were found:

    Revision: f6b1807
    Date: Fri May 1 02:16:12 2015 -0400
    Commit: f6b180782c123bbf3ee8e8b0e935301b674e5f10
        Update comments in Brocfile for better documentation.
    Author: Eddie Flores <eddflrs@gmail.com>
    Activate: ember deploy:activate -r f6b1807 -e <environment>
    Preview: http://www.domain.com/rev/f6b1807

    Revision: d188a58
    Date: Fri May 1 02:16:12 2015 -0400
    Commit: d188a589013e2d72efad05ec078d6a546106c887
        A whole new readme.
    Author: Eddie Flores <eddflrs@gmail.com>
    Activate: ember deploy:activate -r f6b1807 -e <environment>
    Preview: http://www.domain.com/rev/f6b1807

```

```
# In your server's file directory...

/revision:abc123/
    index.html           # The index file
    revision.json        # Meta data about this revision

/revision:def456/
    ...

index.html --> /revision:abc123/index.html  # Active symlink

```