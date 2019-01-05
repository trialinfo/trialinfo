#! /bin/sh

: ${PACKAGE:=trialinfo}

set -e

topdir=$PWD
tag=$1

version=${tag#$PACKAGE-}
basename=$PACKAGE-$version

tmpdir=$(mktemp -d)
trap "rm -rf $tmpdir" EXIT

mkdir "$tmpdir/$basename"
git show "$tag:$PACKAGE.spec" > "$tmpdir/$PACKAGE.spec"
git archive --prefix="$basename/" "$tag" | gzip -9 > "$tmpdir/$basename.tar.gz"
make snapshot | gzip -9 > "$tmpdir/snapshot.tar.gz"

cd "$tmpdir"
rpmbuild -ba \
	-D "_sourcedir $tmpdir" \
	-D "_rpmdir $topdir/rpm" \
	-D "_srcrpmdir $topdir/srpm" \
	-D "VERSION $version" \
	"$PACKAGE.spec"
rpm --addsign \
	-D "__gpg /usr/bin/gpg" \
	-D "_gpg_name $GPG_NAME" \
	$topdir/rpm/*/trialinfo-$version-*.rpm \
	$topdir/srpm/trialinfo-$version-*.rpm
