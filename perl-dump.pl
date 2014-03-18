#! /usr/bin/perl -w -Ilib

# Copyright 2013-2014  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
#
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU Affero General Public License as published by the Free Software
# Foundation, either version 3 of the License, or (at your option) any later
# version.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
# details.
#
# You can find a copy of the GNU Affero General Public License at
# <http://www.gnu.org/licenses/>.

use utf8;

use Encode qw(encode);
use Encode::Locale qw(decode_argv);
use File::Spec::Functions;
use File::Glob ':glob';
use Getopt::Long;
use Data::Dumper;
use Trialtool;
use Auswertung;
use strict;

my $STDOUT_encoding = -t STDOUT ? "console_out" : "UTF-8";
my $STDERR_encoding = -t STDERR ? "console_out" : "UTF-8";
binmode(STDIN, ":encoding(console_in)");
binmode(STDOUT, ":encoding($STDOUT_encoding)");
binmode(STDERR, ":encoding($STDERR_encoding)");

my $result = GetOptions();
unless ($result && @ARGV) {
    print <<EOF;
VERWENDUNG: $0 {datei|verzeichnis} ...

Dump der internen Perl-Repräsentation der Veranstaltung
EOF
    exit 1;
}

if ($^O =~ /win/i) {
    @ARGV = map { bsd_glob($_, GLOB_NOCASE) } @ARGV;
}

decode_argv;

foreach my $name (trialtool_dateien @ARGV) {
    my $cfg = cfg_datei_parsen("$name.cfg");
    my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat", $cfg, 1);
    print Dumper($cfg);
    print Dumper($fahrer_nach_startnummer);
}
