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
use Trialtool;
use strict;

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

    print "Tageswertung\n";
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
	printf "     Nr.  %-20.20s", "Name";
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
	    printf "  %-20.20s", $fahrer->{nachname} . ", " . $fahrer->{vorname};
	    for (my $n = 0; $n < $runden; $n++) {
		if ($fahrer->{runden} > $n) {
		    printf "  %2u", $fahrer->{punkte_pro_runde}[$n];
		} else {
		    print "   -";
		}
	    }
	    print "    ";
	    if ($fahrer->{ausfall} != 0 && $fahrer->{ausfall} != 4) {
		print "  $ausfall->{$fahrer->{ausfall}}";
	    } elsif ($fahrer->{runden} > 0) {
		for (my $n = 0; $n < 4; $n++) {
		    printf "  %2u", $fahrer->{os_1s_2s_3s}[$n];
		}
		printf "  %3u", $fahrer->{punkte};
		if (exists $fahrer->{wertungspunkte}) {
		    printf "  %2u", $fahrer->{wertungspunkte};
		} elsif ($fahrer->{ausfall} == 4) {
			print ")";
		}
	    }
	    print "\n";
	}
	print "\n";
    }
}

foreach my $x (trialtool_dateien @ARGV) {
    my ($cfg_name, $dat_name) = @$x;
    my $cfg = cfg_datei_parsen($cfg_name);
    my $fahrer_nach_startnummer = dat_datei_parsen($dat_name);
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, 1, $cfg;  # Wertung 1
    tageswertung $cfg, $fahrer_nach_startnummer;
}

# use Data::Dumper;
# print Dumper($cfg);
# print Dumper($fahrer_nach_startnummer);
