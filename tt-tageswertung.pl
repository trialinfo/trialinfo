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

use open IO => ":locale";
use utf8;

use Getopt::Long;
use Trialtool;
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

    my $namen = 0;
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	my $n = length "$fahrer->{nachname}, $fahrer->{vorname}";
	$namen = $n
	    if $n > $namen;
    }

    print "Tageswertung mit Punkten für die $cfg->{wertungen}[$wertung]\n";
    print "$cfg->{titel}[0]\n$cfg->{subtitel}[0]\n\n";

    my $fahrer_nach_klassen = fahrer_nach_klassen($fahrer_nach_startnummer);
    foreach my $klasse (sort {$a <=> $b} keys %$fahrer_nach_klassen) {
	my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};
	my $idx = $klasse - 1;
	my $runden = $cfg->{runden}[$idx];

	$fahrer_in_klasse = [ map { ($_->{runden} > 0 ||
				     $_->{papierabnahme}) ?
				     $_ : () } @$fahrer_in_klasse ];
	next unless @$fahrer_in_klasse > 0;

	printf "$cfg->{klassen}[$idx]\n";
	printf "     Nr.  %-*.*s", $namen, $namen, "Name";
	for (my $n = 0; $n < $runden; $n++) {
	   print "  R", $n + 1;
	}
	print "  ZP  0S  1S  2S  3S  Ges  WP\n";

	$fahrer_in_klasse = [ sort rang_wenn_definiert @$fahrer_in_klasse ];
	foreach my $fahrer (@$fahrer_in_klasse) {
	    if ($fahrer->{runden} == $runden &&  !$fahrer->{ausfall}) {
		printf " %2u.", $fahrer->{rang};
	    } else {
		printf "    ";
	    }
	    printf "%s%3u", ($fahrer->{ausfall} == 4 ? "(" : " "), $fahrer->{startnummer};
	    printf "  %-*.*s", $namen, $namen, $fahrer->{nachname} . ", " . $fahrer->{vorname};
	    for (my $n = 0; $n < $runden; $n++) {
		if ($fahrer->{runden} > $n) {
		    printf "  %2u", $fahrer->{punkte_pro_runde}[$n];
		} else {
		    print "   -";
		}
	    }
	    printf "  %2s", $fahrer->{zusatzpunkte} || "";
	    if ($fahrer->{ausfall} != 0 && $fahrer->{ausfall} != 4) {
		print "  $ausfall->{$fahrer->{ausfall}}";
	    } elsif ($fahrer->{runden} > 0) {
		for (my $n = 0; $n < 4; $n++) {
		    printf "  %2u", $fahrer->{os_1s_2s_3s}[$n];
		}
		printf "  %3u", $fahrer->{punkte};
		if (exists $fahrer->{wertungspunkte}[$wertung]) {
		    printf "  %2u", $fahrer->{wertungspunkte}[$wertung];
		} elsif ($fahrer->{ausfall} == 4) {
			print ")";
		}
	    }
	    print "\n";
	}
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
