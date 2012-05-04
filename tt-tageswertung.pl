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

# TODO:
# * Filename globbing on Windows
# * Ergebnisse in Editor-Programm darstellen (wordpad?)
#
# * Lizenzfahrer (1-100) bekommen in den Klassen 1-10 keine Wertungspunkte =>
#   überprüfen oder sogar erzwingen ...
# * In der Klasse 5 gibt es keine Jahreswertungspunkte.
#
# * Wie lassen sich die "Ausfall"-Texte im Tabellencode unterstützen?
#   (Sie gehen über mehrere Spalten.)
# * Bekommt man das (einklammern) von Fahrern außer Konkurrenz irgendwie
#   hin?  Das macht natürlich nur im Textmodus Sinn.
# * HTML-Code über Template

use open IO => ":locale";
use utf8;

use List::Util qw(max);
use Getopt::Long;
use Trialtool;
use RenderOutput;
use Wertungen;
use strict;

my $wertung = 0;  # Index von Wertung 1 (0 .. 3)

my $result = GetOptions("wertung=i" => sub { $wertung = $_[1] - 1; },
			"html" => \$RenderOutput::html);
unless ($result) {
    print "VERWENDUNG: $0 [--wertung=(1..4)]\n";
    exit 1;
}

doc_begin "Österreichischer Trialsport-Verband";
foreach my $name (trialtool_dateien @ARGV) {
    my $cfg = cfg_datei_parsen("$name.cfg");
    my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat");
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;

    doc_h1 "Tageswertung mit Punkten für die Jahreswertung";
    doc_h2 doc_text "$cfg->{titel}[$wertung]\n$cfg->{subtitel}[$wertung]";
    tageswertung $cfg, $fahrer_nach_startnummer, $wertung;
}
doc_end;
