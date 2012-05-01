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

my $result = GetOptions("wertung=i" => sub { $wertung = $_[1] - 1; });
unless ($result) {
    print "VERWENDUNG: $0 [--wertung=(1..4)]\n";
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

foreach my $x (trialtool_dateien @ARGV) {
    my ($cfg_name, $dat_name) = @$x;
    my $cfg = cfg_datei_parsen($cfg_name);
    $cfg->{gestartete_klassen} = gestartete_klassen($cfg);
    my $fahrer_nach_startnummer = dat_datei_parsen($dat_name);
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;
    push @$veranstaltungen, [$cfg, $fahrer_nach_startnummer];
}

my $gesamtpunkte;

foreach my $veranstaltung (@$veranstaltungen) {
    my $fahrer_nach_startnummer = $veranstaltung->[1];

    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	if (exists $fahrer->{wertungspunkte}[$wertung]) {
	    my $startnummer = $fahrer->{startnummer};
	    my $klasse = $fahrer->{klasse};
	    $gesamtpunkte->{$klasse}{$startnummer} +=
		$fahrer->{wertungspunkte}[$wertung];
	}
    }
}

# Converts a reference to a hash to a list of pairs:
# {1 => "one", 2 => "two"}  =>  ([1, "one"], [2, "two"])
sub hashref_to_pairs($) {
    my ($hashref) = @_;
    my (@list, $key, $value);

    while (($key, $value) = each %$hashref) {
	push @list, [ $key, $value ];
    }
    return @list;
}

sub gesamtwertung($$) {
    my ($a, $b) = @_;

    return $b->[1] <=> $a->[1]  # Gesamtpunkte
	if $a->[1] != $b->[1];
    return $a->[0] <=> $b->[0];  # Startnummer
}

my ($letzte_cfg, $letzte_fahrer) =
    @{$veranstaltungen->[@$veranstaltungen - 1]};

print "$letzte_cfg->{wertungen}[$wertung]\n\n";

foreach my $klasse (sort {$a <=> $b} keys %$gesamtpunkte) {
    my $gesamtpunkte_in_klasse = $gesamtpunkte->{$klasse};

    printf "$letzte_cfg->{klassen}[$klasse - 1]\n";
    printf " %2s  %3s  %-20.20s", "", "Nr.", "Name";
    for (my $n = 0; $n < @$veranstaltungen; $n++) {
	my $gestartet = $veranstaltungen->[$n][0]{gestartete_klassen}[$klasse - 1];
	printf "  %2s", $gestartet ? $n + 1 : "";
    }
    printf "  Ges\n";
    my $fahrer_in_klasse = [
	map { $letzte_fahrer->{$_->[0]} }
	    sort gesamtwertung
		 (hashref_to_pairs($gesamtpunkte_in_klasse)) ];
    for (my $idx = 0; $idx < @$fahrer_in_klasse; $idx++) {
	my $fahrer = $fahrer_in_klasse->[$idx];
	my $startnummer = $fahrer->{startnummer};
	printf " %2s. %3u", $idx + 1, $startnummer;
	printf "  %-20.20s", $fahrer->{nachname} . ", " . $fahrer->{vorname};
	for (my $n = 0; $n < @$veranstaltungen; $n++) {
	    my $veranstaltung = $veranstaltungen->[$n];
	    my $gestartet = $veranstaltung->[0]{gestartete_klassen}[$klasse - 1];
	    my $fahrer = $veranstaltung->[1]{$startnummer};
	    printf "  %2s", ($fahrer->{klasse} = $klasse &&
			     exists($fahrer->{wertungspunkte}[$wertung])) ?
			    $fahrer->{wertungspunkte}[$wertung] :
			    $gestartet ? "-" : "";
	}
	printf "  %3s\n", $gesamtpunkte_in_klasse->{$startnummer};
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
