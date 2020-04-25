#! /bin/sh

set -e

CREATEREPO=createrepo
if type createrepo_c > /dev/null; then
    CREATEREPO=createrepo_c
fi

for repo in rpm srpm; do
    $CREATEREPO -q --update "$repo"
    rsync -rlt --perms --delete -v "$repo/" "trialinfo.at:/var/www/htdocs/$repo"
done
