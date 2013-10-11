#! /usr/bin/perl -w -Itrial-toolkit

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
use TrialToolkit;
use strict;

my $STDOUT_encoding = -t STDOUT ? "console_out" : "UTF-8";
my $STDERR_encoding = -t STDERR ? "console_out" : "UTF-8";
binmode(STDIN, ":encoding(console_in)");
binmode(STDOUT, ":encoding($STDOUT_encoding)");
binmode(STDERR, ":encoding($STDERR_encoding)");

my $wertung = 1;
my $spalten;
my $klassen = [];
my $farben = [];
my $anzeigen_mit;
my $alle_punkte = 1;  # Punkte in den Sektionen als ToolTip
my $nach_relevanz = 1;

my $result = GetOptions("wertung=i" => \$wertung,
			"klassen=s@" => \@$klassen,
			"farben=s@" => \@$farben,
			"html" => \$RenderOutput::html,
			"anzeigen-mit=s" => \$anzeigen_mit,
			"nicht-alle-punkte" => sub () { $alle_punkte = 0 },
			"nicht-nach-relevanz" => sub () { $nach_relevanz = 0 },
			"punkteteilung" => \$punkteteilung,
			"keine-punkteteilung" => sub () { undef $punkteteilung },
			"spalte=s@" => \@$spalten);
unless ($result && @ARGV) {
    print <<EOF;
VERWENDUNG: $0 [optionen] {datei|verzeichnis} ...

Erstellt eine Tageswertung aus Trialtool-Dateien.  Als {datei} kann die *.cfg
oder *.dat - Datei angegeben werden, oder beide.  Wird das {verzeichnis} des
Trialtools angegeben, wird die aktuelle Veranstaltung angezeigt.  Die Ausgabe
erfolgt direkt, als Text oder HTML.

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

  --nicht-alle-punkte
    Normalerweise werden den Summen pro Runde als Zusatzinformation ("title")
    die Einzelpunkte in jeder Sektion mitgegeben.  Web Broser zeigen diese
    meist an, wenn man die Maus über die Rundensumme bewegt. Diese Option
    deaktiviert die Einzelpunkte.  Nur für das HTML-Format relevant.

  --nicht-nach-relevanz
    Wenn Fahrer gleich viele Punkte haben, werden sie nach Anzahl der 0er, 1er,
    usw. gereiht, danach je nach Trialtool-Konfiguration nach dem besten
    Rundenergebnis.  In der Tageswertung wird versucht, den Grund der Reihung
    bei Punktegleichstand farblich klar zu machen.  Diese Option deaktiviert
    das.  Nur für das HTML-Format relevant.

  --spalte={club|fahrzeug|lizenznummer|geburtsdatum|bundesland|land|lbl}
    Zusätzliche Anzeige einer Spalte für den Club, die Lizenznummer, das
    Fahrzeug, Geburtsdatum, Bundesland, Land, oder Land und Bundesland.

  --punkteteilung, --keine-punkteteilung
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

if (!$RenderOutput::html) {
    $alle_punkte = 0;
    $nach_relevanz = 0;
}

$klassen = [ map { split /,/, $_ } @$klassen ];

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
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>$txt->{'tageswertung-titel'}</title>
<base href="htdocs/" />
<link rel="stylesheet" type="text/css" href="ergebnisse.css" />
</head>
<body>
EOF
}

foreach my $name (trialtool_dateien @ARGV) {
    my $zeit = max_timestamp(mtime_timestamp("$name.cfg"), mtime_timestamp("$name.dat"));

    my $cfg = cfg_datei_parsen("$name.cfg");
    my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat", 1);

    if ($wertung != 1) {
	# FIXME: Rang und Wertungspunkte sollten pro Wertung berechnet werden,
	# und die Funktion tageswertung sollte die Fahrer bei der Ausgabe
	# filtern.
	foreach my $startnummer (keys %$fahrer_nach_startnummer) {
	    my $fahrer = $fahrer_nach_startnummer->{$startnummer};
	    delete $fahrer_nach_startnummer->{$startnummer}
		unless $fahrer->{wertungen}[$wertung - 1];
	}
    }

    $cfg->{punkteteilung} = $punkteteilung;
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;

    doc_h1 "Tageswertung mit Punkten für die $cfg->{wertungen}[$wertung - 1]{bezeichnung}";
    doc_h2 doc_text "$cfg->{wertungen}[$wertung - 1]{titel}\n$cfg->{wertungen}[$wertung - 1]{subtitel}";

    tageswertung cfg => $cfg,
		 fahrer_nach_startnummer => $fahrer_nach_startnummer,
		 wertung => $wertung,
		 spalten => $spalten,
		 $klassenfarben ? (klassenfarben => $klassenfarben) : (),
		 alle_punkte => $alle_punkte,
		 nach_relevanz => $nach_relevanz,
		 @$klassen ? (klassen => $klassen) : (),
		 statistik_gesamt => 1,
		 statistik_pro_klasse => 0;

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
