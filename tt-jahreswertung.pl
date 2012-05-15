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

# TODO:
# * Filename globbing on Windows
# * Ergebnisse in Editor-Programm darstellen (wordpad?)

use open IO => ":locale";
use utf8;

use Getopt::Long;
use Trialtool;
use Wertungen;
use RenderOutput;
use strict;

my $wertung = 0;  # Index von Wertung 1 (0 .. 3)
my $spalten;
my $streichresultate = [];

my $result = GetOptions("wertung=i" => sub { $wertung = $_[1] - 1; },
			"streich=s@" => \@$streichresultate,
			"html" => \$RenderOutput::html,

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

foreach my $name (trialtool_dateien @ARGV) {
    my $cfg = cfg_datei_parsen("$name.cfg");
    my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat");
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;
    push @$veranstaltungen, [$cfg, $fahrer_nach_startnummer];
}

my $letzte_cfg = $veranstaltungen->[@$veranstaltungen - 1][0];

doc_begin "Österreichischer Trialsport-Verband";
doc_h1 $letzte_cfg->{wertungen}[$wertung];
jahreswertung $veranstaltungen, $wertung, $streichresultate, $spalten;
doc_end;

# use Data::Dumper;
# print Dumper($cfg);
# print Dumper($fahrer_nach_startnummer);
