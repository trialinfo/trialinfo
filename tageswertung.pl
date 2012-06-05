#! /usr/bin/perl -w

# Trialtool: Auswertung einer Veranstaltung machen ("Tageswertung")

# Copyright (C) 2012  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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
use File::Temp qw(tempfile);
use Getopt::Long;
use Trialtool;
use RenderOutput;
use Wertungen;
use strict;

binmode(STDIN, ":encoding(console_in)");
binmode(STDERR, ":encoding(console_out)");
if (-t STDOUT) {
    binmode(STDOUT, ":encoding(console_out)");
} else {
   binmode(STDOUT, ":encoding(UTF-8)");
}

my $shtml = catfile("htdocs", "ergebnisse", "tageswertung.shtml");
my $wertung = 0;  # Index von Wertung 1 (0 .. 3)
my $spalten;
my $anzeigen_mit;

my $result = GetOptions("wertung=i" => sub { $wertung = $_[1] - 1; },
			"html" => \$RenderOutput::html,
			"anzeigen-mit=s" => \$anzeigen_mit,

			"club" => sub { push @$spalten, $_[0] },
			"fahrzeug" => sub { push @$spalten, $_[0] },
			"geburtsdatum" => sub { push @$spalten, $_[0] },
			"lizenznummer" => sub { push @$spalten, $_[0] });
unless ($result) {
    print "VERWENDUNG: $0 [--wertung=(1..4)] [--html] [--club] [--lizenznummer] [--fahrzeug] [--geburtsdatum]\n";
    exit 1;
}

my ($tempfh, $tempname);
if ($anzeigen_mit) {
    ($tempfh, $tempname) = tempfile("tageswertung-XXXXXX",
				    SUFFIX => $RenderOutput::html ? ".html" : ".txt",
				    UNLINK => 1)
	or die "$!\n";
    STDOUT->fdopen($tempfh, "w")
	or die "$tempname: $!\n";
    binmode STDOUT, ":pop:encoding(UTF-8)";
}

if ($^O =~ /win/i) {
    @ARGV = map { bsd_glob($_, GLOB_NOCASE) } @ARGV;
}

decode_argv;

my $fh;
if ($RenderOutput::html) {
    $fh = new FileHandle(encode(locale_fs => $shtml), "<:encoding(UTF-8)")
	or die "$shtml: $!\n";
    while (<$fh>) {
	last if (/<!--#include.*?-->/);
	s/<!--.*?-->//g;
	print;
    }
}

foreach my $name (trialtool_dateien @ARGV) {
    my $cfg = cfg_datei_parsen("$name.cfg");
    my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat");
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;

    doc_h1 "Tageswertung mit Punkten für die $cfg->{wertungen}[$wertung]";
    doc_h2 doc_text "$cfg->{titel}[$wertung]\n$cfg->{subtitel}[$wertung]";
    tageswertung $cfg, $fahrer_nach_startnummer, $wertung, $spalten;
}

if ($RenderOutput::html) {
    while (<$fh>) {
	s/<!--.*?-->//g;
	print;
    }
}

if ($anzeigen_mit) {
    system $anzeigen_mit, $tempname;
    # Windows won't allow to unlink an open file ...
    close STDOUT;
}
