# ember-cli-deploy-ssh #

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