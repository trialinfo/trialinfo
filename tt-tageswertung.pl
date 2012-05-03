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

use open IO => ":locale";
use utf8;

use List::Util qw(max);
use Getopt::Long;
use Trialtool;
use RenderTable;
use strict;

my $wertung = 0;  # Index von Wertung 1 (0 .. 3)

sub rang_wenn_definiert($$) {
    my ($a, $b) = @_;

    return exists($b->{rang}) - exists($a->{rang})
	if !exists($a->{rang}) || !exists($b->{rang});
    return $a->{rang} <=> $b->{rang}
	if $a->{rang} != $b->{rang};
    return $a->{startnummer} <=> $b->{startnummer};
}

sub tageswertung($$) {
    my ($cfg, $fahrer_nach_startnummer) = @_;

    my $ausfall = {
	3 => "ausgefallen",
	4 => "aus der wertung",
	5 => "nicht gestartet",
	6 => "nicht gestartet, entschuldigt"
    };

    my $namenlaenge = 0;
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	my $n = length "$fahrer->{nachname}, $fahrer->{vorname}";
	$namenlaenge = max($n, $namenlaenge);
    }

    print "Tageswertung mit Punkten für die $cfg->{wertungen}[$wertung]\n";
    print "$cfg->{titel}[0]\n$cfg->{subtitel}[0]\n\n";

    my $fahrer_nach_klassen = fahrer_nach_klassen($fahrer_nach_startnummer);
    foreach my $klasse (sort {$a <=> $b} keys %$fahrer_nach_klassen) {
	my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};
	my $idx = $klasse - 1;
	my $runden = $cfg->{runden}[$idx];
	my ($header, $body, $format);

	$fahrer_in_klasse = [ map { ($_->{runden} > 0 ||
				     $_->{papierabnahme}) ?
				     $_ : () } @$fahrer_in_klasse ];
	next unless @$fahrer_in_klasse > 0;

	printf "$cfg->{klassen}[$idx]\n";
	push @$format, "r4", "r3", "l$namenlaenge";
	push @$header, "", "Nr.", "Name";
	for (my $n = 0; $n < $runden; $n++) {
	    push @$format, "r2";
	    push @$header, "R" . ($n + 1);
	}
	push @$format, "r2", "r2", "r2", "r2", "r2", "r3", "r3";
	push @$header, "ZP", "0S", "1S", "2S", "3S", "Ges", "WP";

	$fahrer_in_klasse = [ sort rang_wenn_definiert @$fahrer_in_klasse ];
	foreach my $fahrer (@$fahrer_in_klasse) {
	    my $row;
	    if ($fahrer->{runden} == $runden &&  !$fahrer->{ausfall}) {
		push @$row, "$fahrer->{rang}.";
	    } else {
		push @$row, "";
	    }
	    push @$row, $fahrer->{startnummer};
	    push @$row, $fahrer->{nachname} . ", " . $fahrer->{vorname};
	    for (my $n = 0; $n < $runden; $n++) {
		if ($fahrer->{runden} > $n) {
		    push @$row, $fahrer->{punkte_pro_runde}[$n];
		} else {
		    push @$row, "-";
		}
	    }
	    push @$row, $fahrer->{zusatzpunkte} || "";
	    if ($fahrer->{ausfall} != 0) {
		push @$row, $ausfall->{$fahrer->{ausfall}};
	    } elsif ($fahrer->{runden} > 0) {
		for (my $n = 0; $n < 4; $n++) {
		    push @$row, $fahrer->{os_1s_2s_3s}[$n];
		}
		push @$row, $fahrer->{punkte};
		if (exists $fahrer->{wertungspunkte}[$wertung]) {
		    push @$row, $fahrer->{wertungspunkte}[$wertung];
		}
	    }
	    push @$body, $row;
	}
	render_table $header, $body, $format;
	print "\n";
    }
}

my $result = GetOptions("wertung=i" => sub { $wertung = $_[1] - 1; });
unless ($result) {
    print "VERWENDUNG: $0 [--wertung=(1..4)]\n";
    exit 1;
}

foreach my $name (trialtool_dateien @ARGV) {
    my $cfg = cfg_datei_parsen("$name.cfg");
    my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat");
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;
    tageswertung $cfg, $fahrer_nach_startnummer;
}

# use Data::Dumper;
# print Dumper($cfg);
# print Dumper($fahrer_nach_startnummer);
