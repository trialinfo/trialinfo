#! /bin/sh

set -e

version=${1:1}

tarball=$PACKAGE-$version.tar.gz
basename=$PACKAGE-$version
deb=${basename/-/_}_all.deb

curdir=$PWD

tmpdir=$(mktemp -d)
trap "rm -rf $tmpdir" EXIT

tar -xz -C "$tmpdir" < "$tarball"
cp -r debian "$tmpdir/$basename/"
cd "$tmpdir/$basename"
sed -i \
    -e "s/@VERSION@/$version/g" \
    -e "s/@DATE@/$(date -R)/g" \
    "debian/changelog"
sudo dpkg-buildpackage -us -uc -d
cd ..
sudo chown -R $(whoami) .
cat "$deb" > "$curdir/$deb"
