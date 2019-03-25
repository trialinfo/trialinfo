#! /bin/sh

set -e

for repo in rpm srpm; do
    createrepo -q --update "$repo"
    rsync -rlt --perms --delete -v "$repo/" "trialinfo.at:/var/www/html/$repo"
done
