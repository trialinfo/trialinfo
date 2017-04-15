#! /bin/sh

set -e

topdir=$PWD
tag=$1

version=${tag:1}
basename=$PACKAGE-$version

tmpdir=$(mktemp -d)
trap "rm -rf $tmpdir" EXIT

mkdir "$tmpdir/$basename"
git archive "$tag" | tar -C "$tmpdir/$basename" -x

cd "$tmpdir/$basename/backend"
npm install > /dev/null

MARKO_FILES='views/*.marko emails/*.marko'
node_modules/marko/bin/markoc $MARKO_FILES
rm -f $MARKO_FILES

npm run build

cd dist
find . -type f -print0 \
| xargs -0 -i'{}' cp -v --parents '{}' ..

cd ..
rm -rf dist

cd ..
make -f $topdir/Makefile download

sed -e "s:@PACKAGE@:$PACKAGE:g" \
    -e "s:@VERSION@:$version:g" \
    $topdir/Makefile.release > Makefile

cd ..
tar -c "$basename" | gzip -9 > "$topdir/$basename.tar.gz"
echo "$basename.tar.gz"
