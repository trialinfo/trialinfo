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

my $STDOUT_encoding = -t STDOUT ? "console_out" : "UTF-8";
my $STDERR_encoding = -t STDERR ? "console_out" : "UTF-8";
binmode(STDIN, ":encoding(console_in)");
binmode(STDOUT, ":encoding($STDOUT_encoding)");
binmode(STDERR, ":encoding($STDERR_encoding)");

my $wertung = 0;  # Index von Wertung 1 (0 .. 3)
my $spalten;
my $klassen = [];
my $farben = [];
my $anzeigen_mit;
my $alle_punkte;  # Punkte in den Sektionen als ToolTip

my $result = GetOptions("wertung=i" => sub { $wertung = $_[1] - 1; },
			"klassen=s@" => \@$klassen,
			"farben=s@" => \@$farben,
			"html" => \$RenderOutput::html,
			"anzeigen-mit=s" => \$anzeigen_mit,
			"alle-punkte" => \$alle_punkte,

			"club" => sub { push @$spalten, $_[0] },
			"fahrzeug" => sub { push @$spalten, $_[0] },
			"geburtsdatum" => sub { push @$spalten, $_[0] },
			"lizenznummer" => sub { push @$spalten, $_[0] });
unless ($result) {
    print "VERWENDUNG: $0 [--wertung=(1..4)] [--html] [--alle-punkte] [--club] [--lizenznummer] [--fahrzeug] [--geburtsdatum]\n";
    exit 1;
}

if ($alle_punkte && !$RenderOutput::html) {
    print STDERR "Die Option --alle-punkte setzt die Option --html voraus\n";
    exit 1;
}

$klassen = { map { $_ => 1 } (map { split /,/, $_ } @$klassen) };

$farben = [ map { split /,/, $_ } @$farben ];
my $klassenfarben;
if (@$farben) {
    for (my $n = 0; $n < @$farben; $n++) {
	$klassenfarben->{$n + 1} = $farben->[$n]
	    if $farben->[$n] ne "";
    }
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
    print <<EOF;
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>Österreichischer Trialsport-Verband</title>
<link rel="stylesheet" type="text/css" href="ergebnisse.css" />
</head>
<body>
EOF
}

foreach my $name (trialtool_dateien @ARGV) {
    my $zeit = max_time(mtime("$name.cfg"), mtime("$name.dat"));

    my $cfg = cfg_datei_parsen("$name.cfg");
    my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat");
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;

    if (%$klassen) {
	foreach my $startnummer (keys %$fahrer_nach_startnummer) {
	    my $fahrer = $fahrer_nach_startnummer->{$startnummer};
	    delete $fahrer_nach_startnummer->{$startnummer}
		unless exists $klassen->{$fahrer->{klasse}};
	}
    }

    doc_h1 "Tageswertung mit Punkten für die $cfg->{wertungen}[$wertung]";
    doc_h2 doc_text "$cfg->{titel}[$wertung]\n$cfg->{subtitel}[$wertung]";
    tageswertung $cfg, $fahrer_nach_startnummer, $wertung, $spalten,
		 $klassenfarben, $alle_punkte;

    if ($RenderOutput::html) {
	print "<p>Letzte Änderung: $zeit</p>\n";
    } else {
	print "\nLetzte Änderung: $zeit\n";
    }
}

if ($RenderOutput::html) {
    print <<EOF;
</body>
</html>
EOF
}

if ($anzeigen_mit) {
    system $anzeigen_mit, $tempname;
    # Windows won't allow to unlink an open file ...
    close STDOUT;
}
