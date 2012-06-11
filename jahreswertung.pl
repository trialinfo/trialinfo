#! /usr/bin/perl -w

# Trialtool: Auswertung über mehrere Veranstaltungen machen ("Jahreswertung")

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
use File::Basename;
use Getopt::Long;
use Trialtool;
use Wertungen;
use RenderOutput;
use strict;

binmode(STDIN, ":encoding(console_in)");
binmode(STDERR, ":encoding(console_out)");
if (-t STDOUT) {
    binmode(STDOUT, ":encoding(console_out)");
} else {
    binmode(STDOUT, ":encoding(UTF-8)");
}

my $wertung = 0;  # Index von Wertung 1 (0 .. 3)
my $spalten;
my $streichresultate = [];
my $anzeigen_mit;

my $result = GetOptions("wertung=i" => sub { $wertung = $_[1] - 1; },
			"streich=s@" => \@$streichresultate,
			"html" => \$RenderOutput::html,
			"anzeigen-mit=s" => \$anzeigen_mit,

			"club" => sub { push @$spalten, $_[0] },
			"fahrzeug" => sub { push @$spalten, $_[0] },
			"geburtsdatum" => sub { push @$spalten, $_[0] },
			"lizenznummer" => sub { push @$spalten, $_[0] });
unless ($result) {
    print "VERWENDUNG: $0 [--wertung=(1..4)] [--streich=N] [--html]\n" .
	  "\t[--club] [--lizenznummer] [--fahrzeug] [--geburtsdatum]\n";
    exit 1;
}

$streichresultate = [ map { split /,/, $_ } @$streichresultate ];
my $veranstaltungen;

my ($tempfh, $tempname);
if ($anzeigen_mit) {
    ($tempfh, $tempname) = tempfile("jahreswertung-XXXXXX",
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

my $n = 1;
foreach my $name (trialtool_dateien @ARGV) {
    my $cfg = cfg_datei_parsen("$name.cfg");
    if ($RenderOutput::html &&
	basename($name) =~ /^(\d{4})-0*(\d+)-0*(\d+) /) {
	$cfg->{label} = "$3.<br>$2.";
	$cfg->{label2} = "$3.$2.";
    } else {
	$cfg->{label} = $n;
    }
    $n++;
    my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat");
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;
    push @$veranstaltungen, [$cfg, $fahrer_nach_startnummer];
}

foreach my $veranstaltung (@$veranstaltungen) {
    my $fahrer_nach_startnummer = $veranstaltung->[1];
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	if (exists $fahrer->{neue_startnummer}) {
		my $cfg = $veranstaltung->[0];
		print STDERR "Veranstaltung $cfg->{label}: Startnummer " .
			     "$fahrer->{startnummer} -> " .
			     "$fahrer->{neue_startnummer}\n";
		$fahrer->{alte_startnummer} = $fahrer->{startnummer};
		$fahrer->{startnummer} = $fahrer->{neue_startnummer};
		delete $fahrer->{neue_startnummer};

		delete $fahrer_nach_startnummer->{$fahrer->{alte_startnummer}};
		$fahrer_nach_startnummer->{$fahrer->{startnummer}} = $fahrer;
	}
    }
}

my $letzte_cfg = $veranstaltungen->[@$veranstaltungen - 1][0];

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

doc_h1 $letzte_cfg->{wertungen}[$wertung];
jahreswertung $veranstaltungen, $wertung, $streichresultate, $spalten;

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
