#! /bin/sh

set -e

GPG_NAME=3BB03F34
REPO=debs

cd "$REPO"

dpkg-scanpackages -m . > Packages
gzip -kf -9 Packages

PKGS=$(wc -c Packages)
PKGS_GZ=$(wc -c Packages.gz)
cat > Release << EOF
Architectures: all
Date: $(date -u -R)
MD5Sum:
 $(md5sum Packages  | cut -d" " -f1) $PKGS
 $(md5sum Packages.gz  | cut -d" " -f1) $PKGS_GZ
SHA1:
 $(sha1sum Packages  | cut -d" " -f1) $PKGS
 $(sha1sum Packages.gz  | cut -d" " -f1) $PKGS_GZ
SHA256:
 $(sha256sum Packages | cut -d" " -f1) $PKGS
 $(sha256sum Packages.gz | cut -d" " -f1) $PKGS_GZ
EOF

rm -f Release.gpg
gpg --sign --digest-algo SHA256 -ab -u "$GPG_NAME" -o Release.gpg Release

rsync -rlt -v * trialinfo.at:/var/www/html/debs
