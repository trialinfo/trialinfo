#! /usr/bin/perl -w

#
# TODO:
# * UTF-8 Zeichencodierung fixen
# * UTF-8-Codierung im Dateinamen in der Datenbank ist kaputt
# * Jahreswertung implementieren
#
# * Lizenzfahrer bekommen (1-100) in den Klassen 1-10 keine Wertungspunkte.
# * In der Klasse 5 gibt es keine Wertungspunkte.
# * Funktion schreiben, die die "Jahreswertung"-Werte nach den Klassen
#   berechnet (für Ö); Wertung angeben für wertungspunkte_einfuegen()

use Trialtool;
use strict;

# FIXME: Das ist böse ...
binmode(STDOUT, ":utf8");

my $veranstaltungen;

foreach my $cfg_dat (trialtool_dateien @ARGV) {
    my $cfg = cfg_datei_parsen($cfg_dat->[0]);
    my $fahrer_nach_startnummer = dat_datei_parsen($cfg_dat->[1]);
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;
    push @$veranstaltungen, [$cfg, $fahrer_nach_startnummer];
}

# Die Daten der letzten Veranstaltung enthalten alle Fahrer
# Wir berechnen direkt dort die Gesamtpunkte.
my ($letzte_cfg, $letzte_fahrer) =
    @{$veranstaltungen->[@$veranstaltungen - 1]};

foreach my $veranstaltung (@$veranstaltungen) {
    my $fahrer_nach_startnummer = $veranstaltung->[1];

    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	if (exists $fahrer->{wertungspunkte}) {
	    my $startnummer = $fahrer->{startnummer};
	    $letzte_fahrer->{$startnummer}{gesamtpunkte} +=
		$fahrer->{wertungspunkte};
	}
    }
}

sub gesamtwertung($$) {
    my ($a, $b) = @_;

    return exists($b->{gesamtpunkte}) - exists($a->{gesamtpunkte})
	if !exists($a->{gesamtpunkte}) || !exists($b->{gesamtpunkte});
    return $b->{gesamtpunkte} <=> $a->{gesamtpunkte}
	if $b->{gesamtpunkte} != $a->{gesamtpunkte};
    return $a->{startnummer} <=> $b->{startnummer};
}

my $fahrer_nach_klassen = fahrer_nach_klassen($letzte_fahrer);
foreach my $klasse (sort {$a <=> $b} keys $fahrer_nach_klassen) {
    my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};
    printf "$letzte_cfg->{klassen}[$klasse - 1]\n";
    printf " %3s  %-20.20s", "Nr.", "Name";
    for (my $n = 0; $n < @$veranstaltungen; $n++) {
	printf "  %2s", $n + 1;
    }
    printf "  Ges\n";
    foreach my $fahrer (sort gesamtwertung @$fahrer_in_klasse) {
	next unless exists $fahrer->{gesamtpunkte};
	my $startnummer = $fahrer->{startnummer};
	printf " %3u", $startnummer;
	printf "  %-20.20s", $fahrer->{nachname} . ", " . $fahrer->{vorname};
	foreach my $veranstaltung (@$veranstaltungen) {
	    my $fahrer = $veranstaltung->[1]{$startnummer};
	    printf "  %2s", (exists($fahrer->{wertungspunkte}) ?
			     $fahrer->{wertungspunkte} : "-");
	}
	printf "  %3s\n", $fahrer->{gesamtpunkte};
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
