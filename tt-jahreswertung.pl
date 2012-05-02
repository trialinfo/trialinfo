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
# * Lizenzfahrer bekommen (1-100) in den Klassen 1-10 keine Wertungspunkte =>
#   überprüfen oder sogar erzwingen ...
# * In der Klasse 5 gibt es keine Jahreswertungspunkte.

use open IO => ":locale";
use utf8;

use Getopt::Long;
use Trialtool;
use strict;

my $wertung = 0;  # Index von Wertung 1 (0 .. 3)
my $streich = 0;  # Streichresultate

my $result = GetOptions("wertung=i" => sub { $wertung = $_[1] - 1; },
			"streich=i" => \$streich );
unless ($result) {
    print "VERWENDUNG: $0 [--wertung=(1..4)] [--streich=N]\n";
    exit 1;
}

my $veranstaltungen;

sub gestartete_klassen($) {
    my ($cfg) = @_;

    my $sektionen = $cfg->{sektionen};
    my $gestartet;
    for (my $n = 0; $n < @$sektionen; $n++) {
	push @$gestartet, (index $sektionen->[$n], "J") != -1;
    }
    return $gestartet;
}

foreach my $name (trialtool_dateien @ARGV) {
    my $cfg = cfg_datei_parsen("$name.cfg");
    $cfg->{gestartete_klassen} = gestartete_klassen($cfg);
    my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat");
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;
    push @$veranstaltungen, [$cfg, $fahrer_nach_startnummer];
}

my $gesamtpunkte;
my ($letzte_cfg, $letzte_fahrer) =
    @{$veranstaltungen->[@$veranstaltungen - 1]};

foreach my $veranstaltung (@$veranstaltungen) {
    my $fahrer_nach_startnummer = $veranstaltung->[1];

    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	if (exists $fahrer->{wertungspunkte}[$wertung]) {
	    my $startnummer = $fahrer->{startnummer};
	    my $klasse = $fahrer->{klasse};
	    $gesamtpunkte->{$klasse}{$startnummer} +=
		$fahrer->{wertungspunkte}[$wertung];
	    push @{$letzte_fahrer->{$startnummer}{wp}},
		$fahrer->{wertungspunkte}[$wertung];
	}
    }
}

$letzte_fahrer = { map { ( $_->{startnummer}, $_ ) }
			grep { exists $_->{wp} }
			     values %$letzte_fahrer };

foreach my $fahrer (values %$letzte_fahrer) {
    my $wp = $fahrer->{wp};
    my $n = 0;

    if ($streich) {
	$fahrer->{streich} = 0;
	$wp = [ sort { $a <=> $b } @$wp ];
	for (; $n < $streich && $n < @$wp; $n++) {
	    $fahrer->{streich} += $wp->[$n];
	}
    }
    $fahrer->{gesamt} = 0;
    for (; $n < @$wp; $n++) {
	$fahrer->{gesamt} += $wp->[$n];
    }
}

if ($streich) {
    $letzte_fahrer = { map { ( $_->{startnummer}, $_ ) }
			    grep { $_->{gesamt} > 0 }
				 values %$letzte_fahrer };
}

sub gesamtwertung {
    return $b->{gesamt} <=> $a->{gesamt}
	if $a->{gesamt} != $b->{gesamt};
    return $a->{startnummer} <=> $b->{startnummer};
}

my $namen = 0;
foreach my $fahrer (values %$letzte_fahrer) {
    my $n = length "$fahrer->{nachname}, $fahrer->{vorname}";
    $namen = $n
	if $n > $namen;
}

print "$letzte_cfg->{wertungen}[$wertung]\n";
if ($streich) {
    if ($streich == 1) {
	print "Mit einem Streichresultat\n";
    } else {
	print "Mit $streich Streichresultaten\n";
    }
}
print "\n";

my $fahrer_nach_klassen = fahrer_nach_klassen($letzte_fahrer);
foreach my $klasse (sort {$a <=> $b} keys $fahrer_nach_klassen) {
    printf "$letzte_cfg->{klassen}[$klasse - 1]\n";
    printf " %2s  %3s  %-*.*s", "", "Nr.", $namen, $namen, "Name";
    for (my $n = 0; $n < @$veranstaltungen; $n++) {
	my $gestartet = $veranstaltungen->[$n][0]{gestartete_klassen}[$klasse - 1];
	printf "  %2s", $gestartet ? $n + 1 : "";
    }
    printf "  Str"
	if $streich;
    printf "  Ges\n";
    my $fahrer_in_klasse = [ sort gesamtwertung @{$fahrer_nach_klassen->{$klasse}} ];

    my $letzter_fahrer;
    for (my $n = 0; $n < @$fahrer_in_klasse; $n++) {
	my $fahrer = $fahrer_in_klasse->[$n];
	my $startnummer = $fahrer->{startnummer};
	if ($letzter_fahrer &&
	    $fahrer->{gesamt} == $letzter_fahrer->{gesamt}) {
	    $fahrer->{rang} = $letzter_fahrer->{rang};
	} else {
	    $fahrer->{rang} = $n + 1;
	}
	$letzter_fahrer = $fahrer;
    }

    foreach my $fahrer (@$fahrer_in_klasse) {
	my $startnummer = $fahrer->{startnummer};
	printf " %2s. %3u", $fahrer->{rang}, $startnummer;
	printf "  %-*.*s", $namen, $namen, $fahrer->{nachname} . ", " . $fahrer->{vorname};
	for (my $n = 0; $n < @$veranstaltungen; $n++) {
	    my $veranstaltung = $veranstaltungen->[$n];
	    my $gestartet = $veranstaltung->[0]{gestartete_klassen}[$klasse - 1];
	    my $fahrer = $veranstaltung->[1]{$startnummer};
	    printf "  %2s", ($fahrer->{klasse} = $klasse &&
			     exists($fahrer->{wertungspunkte}[$wertung])) ?
			    $fahrer->{wertungspunkte}[$wertung] :
			    $gestartet ? "-" : "";
	}
	printf "  %3s", $fahrer->{streich}
	    if $streich;
	printf "  %3s\n", $fahrer->{gesamt};
    }
    print "\n";
}

print "Veranstaltungen:\n";
for (my $n = 0; $n < @$veranstaltungen; $n++) {
    my $cfg = $veranstaltungen->[$n][0];
    printf "  %2s  %s: %s\n", $n + 1, $cfg->{titel}[0],  $cfg->{subtitel}[0];
}
print "\n";

# use Data::Dumper;
# print Dumper($cfg);
# print Dumper($fahrer_nach_startnummer);
