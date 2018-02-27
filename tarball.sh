#! /bin/sh

set -e

topdir=$PWD
tag=$1

version=${tag#$PACKAGE-}
basename=$PACKAGE-$version

tmpdir=$(mktemp -d)
trap "rm -rf $tmpdir" EXIT

mkdir "$tmpdir/$basename"
git archive "$tag" | tar -C "$tmpdir/$basename" -x

cd "$tmpdir/$basename"
make -f $topdir/Makefile install
make -f $topdir/Makefile build
make -f $topdir/Makefile

cd "$tmpdir/$basename/backend"
rm -fv views/*.marko emails/*.marko

cd dist
find . -type f -print0 \
| xargs -0 -i'{}' cp -v --parents '{}' ..

cd ..
rm -rf dist

cd ..

sed -e "s:@PACKAGE@:$PACKAGE:g" \
    -e "s:@VERSION@:$version:g" \
    $topdir/Makefile.release > Makefile

cd ..
tar -c "$basename" | gzip -9 > "$topdir/$basename.tar.gz"
echo "$basename.tar.gz"
