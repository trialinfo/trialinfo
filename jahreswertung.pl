#! /usr/bin/perl -w -Itrial-toolkit

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
use TrialToolkit;
use strict;

my $STDOUT_encoding = -t STDOUT ? "console_out" : "UTF-8";
my $STDERR_encoding = -t STDERR ? "console_out" : "UTF-8";
binmode(STDIN, ":encoding(console_in)");
binmode(STDOUT, ":encoding($STDOUT_encoding)");
binmode(STDERR, ":encoding($STDERR_encoding)");

my $wertung = 1;
my $zeit;
my $spalten;
my $klassen = [];
my $farben = [];
my $laeufe;
my $streichresultate;
my $anzeigen_mit;
my $punkteteilung;

my $result = GetOptions("wertung=i" => \$wertung,
			"klassen=s@" => \@$klassen,
			"farben=s@" => \@$farben,
			"laeufe=s" => \$laeufe,
			"streichresultate=s" => \$streichresultate,
			"html" => \$RenderOutput::html,
			"anzeigen-mit=s" => \$anzeigen_mit,
			"punkteteilung" => \$punkteteilung,

			"club" => sub { push @$spalten, $_[0] },
			"fahrzeug" => sub { push @$spalten, $_[0] },
			"geburtsdatum" => sub { push @$spalten, $_[0] },
			"lizenznummer" => sub { push @$spalten, $_[0] });
unless ($result && @ARGV) {
    print <<EOF;
VERWENDUNG: $0 [optionen] {datei} ...

Erstellt eine Jahreswertung aus Trialtool-Dateien.  Als {datei} können die
*.cfg oder *.dat - Dateien angegeben werden, oder beide.  Die Ausgabe erfolgt
direkt, als Text oder HTML.

Optionen:
  --wertung=(1..4)
    Wertung 1 (alle Starter), oder 2-4 (nur die Starter in dieser Wertung).

  --klassen=N,...
    Nur die angegebenen Klassen anzeigen.

  --html
    Ausgabe im HTML-Format.  Normalerweise erfolgt die Ausgabe im Textformat.

  --farben=...,...
    Spurfarben der einzelnen Klassen als HTML Farbname oder Farbcode. Nur für
    das HTML-Format relevant.

  --laeufe=N, --streichresultate=N
    Anzahl der Läufe und der Streichresultate.  Wenn nicht angegeben, wird ohne
    Streichresultate gerechnet.

  --club, --lizenznummer, --fahrzeug, --geburtsdatum
    Zusätzliche Anzeige einer Spalte für den Club, die Lizenznummer, das
    Fahrzeug und/oder das Geburtsdatum.

  --punkteteilung
    Wenn es ex aequo-Platzierungen gibt, vergibt das Trialtool normalerweise
    allen Fahrern die maximalen Wertungspunkte: zwei Erste bekommen beide die
    Wertungspunkte für den ersten Platz, der nächste Fahrer hat Platz 3. Bei
    Punkteteilung werden stattdessen die Wertungspunkte für den ersten und
    zweiten Platz unter den beiden Ersten aufgeteilt.  Geteilte Punkte werden
    soweit möglich als Brüche dargestellt (z.B. 20⅓ statt 20.333).

  --anzeigen-mit=...
    Externes Programm, mit dem die Wertung angezeigt werden soll (z.B. Firefox).
EOF
    exit 1;
}

if (defined $streichresultate && !defined $laeufe) {
    print STDERR "Option --streichresultate nur in Kombination mit " .
	         "Option --laeufe sinnvoll.\n";
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
    $zeit = max_time($zeit, mtime("$name.cfg"));
    $zeit = max_time($zeit, mtime("$name.dat"));

    my $cfg = cfg_datei_parsen("$name.cfg");
    if ($RenderOutput::html &&
	basename($name) =~ /^(\d{4})-0*(\d+)-0*(\d+) /) {
	$cfg->{label} = "$3.<br>$2.";
	$cfg->{label2} = "$3.$2.";
    } else {
	$cfg->{label} = $n;
    }
    $n++;
    my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat", 1);
    $cfg->{punkteteilung} = $punkteteilung;
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

    if (%$klassen) {
	foreach my $startnummer (keys %$fahrer_nach_startnummer) {
	    my $fahrer = $fahrer_nach_startnummer->{$startnummer};
	    delete $fahrer_nach_startnummer->{$startnummer}
		unless exists $klassen->{$fahrer->{klasse}};
	}
    }
}

my $letzte_cfg = $veranstaltungen->[@$veranstaltungen - 1][0];

my $fh;
if ($RenderOutput::html) {
    print <<EOF;
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>$txt->{'jahreswertung-titel'}</title>
<base href="htdocs/ergebnisse/" />
<link rel="stylesheet" type="text/css" href="ergebnisse.css" />
</head>
<body>
EOF
}

doc_h1 $letzte_cfg->{wertungen}[$wertung - 1];
jahreswertung $veranstaltungen, $wertung, $laeufe, $streichresultate,
	      $klassenfarben, $spalten;

if ($RenderOutput::html) {
    print "<p>Letzte Änderung: $zeit</p>\n";
} else {
    print "\nLetzte Änderung: $zeit\n";
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
