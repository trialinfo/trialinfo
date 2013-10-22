package Timestamp;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(mtime_timestamp timestamp_mtime max_timestamp);

use POSIX qw(strftime mktime);
use File::stat;
use Encode qw(encode);
use Time::localtime;
use Time::Local;

sub mtime_timestamp($) {
    my ($dateiname) = @_;

    my $stat = stat(encode(locale_fs => "$dateiname"))
	or die "$dateiname: $!\n";
    return strftime("%Y-%m-%d %H:%M:%S", @{localtime($stat->mtime)});
}

sub timestamp_mtime($) {
    my ($timestamp) = @_;

    if ($timestamp =~ /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/) {
	return mktime($6, $5, $4, $3, $2 - 1, $1 - 1900);
    } else {
	return undef;
    }
}

sub max_timestamp($$) {
    my ($a, $b) = @_;
    my ($ta, $tb);

    return $b unless defined $a;
    return $a unless defined $b;

    $ta = timelocal($6, $5, $4, $3, $2 - 1, $1 - 1900)
	if $a =~ /^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)$/;
    $tb = timelocal($6, $5, $4, $3, $2 - 1, $1 - 1900)
	if $b =~ /^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)$/;
    return $ta < $tb ? $b : $a;
}
