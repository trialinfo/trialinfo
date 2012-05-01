#! /usr/bin/perl -w

# Trialtool: Lesen des Dateiformats

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

# Die *.dat - Dateien bestehen aus Datensätzen zu je 847 Bytes pro Fahrer,
# direkt vom Dateianfang weg.  Das Format der Fahrerdaten ist in $fahrer_format
# beschrieben.  Die Datensätze 0 - 999 enthalten die Fahrer mit zugeordneter
# Startnummer, darauf folgen in den Datensätzen 1000 bis ~1400 Fahrer ohne
# Startnummer.  Danach folgen die den Fahrern zugeordneten Helfer.
#
# Die *.cfg - Dateien enthalten die Veranstaltungsdaten (siehe $cfg_format).
#
# TODO:
# * Wo stehen die Einstellungen für den Bewertungsmodus?
# * Die anderen Bewertungsmodi sind noch nicht implementiert ...

use Parse::Binary::FixedFormat;
use Encode qw(decode);
use FileHandle;
use strict;

my $cfg_format = [
    "titel:A70:4",
    "subtitel:A70:4",
    "wertungen:A20:4",			# Bezeichnungen der Wertungen
    ":A11",
    "kartenfarben:A7:5",		# "Blau", "Rot", "Gelb", "Weiss", "Keine"
    "ergebnisliste_feld:A18",		# "Fahrzeug"
    ":A5",				# ?
    "klassen:A60:15",			# Klassenbezeichnungen
    "startzeiten:A5:15",
    "wertungspunkte:S<:20",		# Wertungspunkte für Rang 1 - 20
    "sektionen:A15:15",			# Gefahrene Sektionen pro Klasse
    ":A208",				# ?
    "runden:A:15",			# Anzahl der Runden je Klasse ("4")
];

my $fahrer_format = [
    "klasse:S<",
    "helfer:S<",			# 0 = kein Helfer, sonst > 1400
    "nenngeld:A10",
    "bewerber:A40",			# ?
    "nachname:A30",
    "vorname:A30",
    ":A40",				# Nachname, Vorname
    "strasse:A30",
    "wohnort:A40",
    "plz:A5",
    "club:A40",
    "fahrzeug:A30",
    "geburtsdatum:A10",
    "telefon:A20",
    "lizenznummer:A20",
    "rahmennummer:A20",
    "kennzeichen:A15",
    "hubraum:A10",
    "bemerkung:A150",			# Verwendet für E-Mail
    "land:A33",
    "startzeit:A5",
    "zielzeit:A5",
    "wertungen:A:4",
    "stechen:S<",			# 0 = kein Stechen
    "papierabnahme:S<",
    ":A",				# ?
    "runden:A5",			# Gefahrene Runden
    "zusatzpunkte:f",
    "punkte_pro_runde:S<:5",
    ":A60",				# ?
    "os_1s_2s_3s:S<:4",
    ":A4",				# ?
    "punkte:f",
    "ausfall:S<",			# 0 = Im Rennen, 3 = Ausfall, 4 = Aus der Wertung,
					# 5 = Nicht gestartet, 6 = Nicht gestartet, entschuldigt
    "nennungseingang:S<",
    ":A2",				# ?
    "punkte_pro_sektion:S<:75",		# 6 = kein Ergebnis
];

sub decode_strings($$) {
    my ($data, $fmt) = @_;

    for (my $n = 0; $n < @$fmt; $n++) {
	if ($fmt->[$n] =~ /(.*):A[^:]*(:)?/) {
	    if ($2) {
		$data->{$1} = [ map { decode("windows-1252", $_) } @{ $data->{$1}} ];
	    } else {
		$data->{$1} = decode("windows-1252", $data->{$1});
	    }
	}
    }
}

sub cfg_datei_parsen($) {
    my ($dateiname) = @_;

    my $fh = new FileHandle($dateiname);
    binmode $fh, ":bytes";
    my $cfg = do { local $/; <$fh> };
    my $cfg_parser = new Parse::Binary::FixedFormat($cfg_format);
    $cfg = $cfg_parser->unformat($cfg);
    delete $cfg->{''};
    decode_strings($cfg, $cfg_format);
    $cfg->{runden} = [ map { ord($_) - ord("0") } @{$cfg->{runden}} ];
    return $cfg;
}

sub runden_zaehlen($) {
    my ($string) = @_;

    my $index = index($string, "N");
    return $index == -1 ? length($string) : $index;
}

sub punkte_aufteilen($) {
    my ($punkte) = @_;

    return [ [@$punkte[0..14]],
	     [@$punkte[15..29]],
	     [@$punkte[30..44]],
	     [@$punkte[45..59]],
	     [@$punkte[60..74]] ];
}

sub fahrer_nach_klassen($) {
    my ($fahrer_nach_startnummern) = @_;
    my $fahrer_nach_klassen;

    foreach my $fahrer (values %$fahrer_nach_startnummern) {
	my $klasse = $fahrer->{klasse};
	push @{$fahrer_nach_klassen->{$klasse}}, $fahrer;
    }
    return $fahrer_nach_klassen;
}

sub rang_vergleich($$) {
    my ($a, $b) = @_;

    # Fahrer im Rennen und ausgefallene Fahrer vor Fahrern aus der Wertung und
    # nicht gestarteten Fahrern
    return ($b->{ausfall} <= 3) <=> ($a->{ausfall} <= 3)
	if ($a->{ausfall} <= 3) != ($b->{ausfall} <= 3);

    # Abfallend nach gefahrenen Runden
    return $b->{runden} <=> $a->{runden}
	if $a->{runden} != $b->{runden};

    # Aufsteigend nach Punkten
    return $a->{punkte} <=> $b->{punkte}
	if $a->{punkte} != $b->{punkte};

    # Abfallend nach 0ern, 1ern, 2ern, 3ern
    my $ax = $a->{os_1s_2s_3s};
    my $bx = $b->{os_1s_2s_3s};
    for (my $n = 0; $n < @$ax; $n++) {
	return $bx->[$n] <=> $ax->[$n]
	    if $ax->[$n] != $bx->[$n];
    }

    # Aufsteigend nach der besten letzten Runde
    $ax = $a->{punkte_pro_runde};
    $bx = $b->{punkte_pro_runde};
    for (my $n = @$ax - 1; $n >= 0; $n--){
	return $ax->[$n] <=> $bx->[$n]
	    if $ax->[$n] != $bx->[$n];
    }

    # Aufsteigend nach Ergebnis im Stechen
    return $a->{stechen} <=> $b->{stechen};
}

sub rang_und_wertungspunkte_berechnen($$) {
    my ($fahrer_nach_startnummer, $cfg) = @_;
    my $wertungspunkte = $cfg->{wertungspunkte};

    my $fahrer_nach_klassen = fahrer_nach_klassen($fahrer_nach_startnummer);
    foreach my $klasse (keys %$fahrer_nach_klassen) {
	my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};

	my $rang = 1;
	$fahrer_in_klasse = [ sort rang_vergleich @$fahrer_in_klasse ];
	my $vorheriger_fahrer;
	foreach my $fahrer (@$fahrer_in_klasse) {
	    $fahrer->{rang} =
		$vorheriger_fahrer &&
		rang_vergleich($vorheriger_fahrer, $fahrer) == 0 ?
		    $vorheriger_fahrer->{rang} : $rang;
	    $rang++;
	    $vorheriger_fahrer = $fahrer;
	}
	$fahrer_nach_klassen->{$klasse} = $fahrer_in_klasse;
    }

    for (my $wertung = 0; $wertung < @{$cfg->{wertungen}}; $wertung++) {
	foreach my $klasse (keys %$fahrer_nach_klassen) {
	    my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};

	    my $wp_idx = 0;
	    my $vorheriger_fahrer;
	    foreach my $fahrer (@$fahrer_in_klasse) {
		next unless defined $fahrer->{rang} &&
			    $fahrer->{wertungen}[$wertung] &&
			    $fahrer->{runden} == $cfg->{runden}[$klasse - 1] &&
			    !$fahrer->{ausfall};
		if ($vorheriger_fahrer &&
		    $vorheriger_fahrer->{rang} == $fahrer->{rang}) {
		    $fahrer->{wertungspunkte}[$wertung] =
			$vorheriger_fahrer->{wertungspunkte}[$wertung];
		} elsif ($wp_idx < @$wertungspunkte &&
			 $wertungspunkte->[$wp_idx] != 0) {
		    $fahrer->{wertungspunkte}[$wertung] = $wertungspunkte->[$wp_idx];
		}
		$wp_idx++;
		$vorheriger_fahrer = $fahrer;
	    }
	}
    }
}

sub dat_datei_parsen($) {
    my ($dateiname) = @_;

    my $fh = new FileHandle($dateiname);
    binmode $fh, ":bytes";
    my $dat = do { local $/; <$fh> };
    my $fahrer_nach_startnummern;

    my $fahrer_parser = new Parse::Binary::FixedFormat($fahrer_format);
    for (my $n = 0; $n < 1000; $n++) {
	my $fahrer_binaer = substr($dat, $n * 847, 847);
	my $klasse = unpack "S<", $fahrer_binaer;
	next if $klasse == 0;
	my $fahrer = $fahrer_parser->unformat($fahrer_binaer);
	delete $fahrer->{''};
	decode_strings($fahrer, $fahrer_format);
	$fahrer->{startnummer} = $n + 1;
	$fahrer->{wertungen} = [ map { $_ eq "J" ? 1 : 0 } @{$fahrer->{wertungen}} ];
	$fahrer->{runden} = runden_zaehlen($fahrer->{runden});
	$fahrer->{punkte_pro_sektion} = punkte_aufteilen($fahrer->{punkte_pro_sektion});
	delete $fahrer->{geburtsdatum}
	    if $fahrer->{geburtsdatum} eq "01.01.1901";
	$fahrer_nach_startnummern->{$fahrer->{startnummer}} = $fahrer;
    }

    return $fahrer_nach_startnummern;
}

sub trialtool_dateien(@) {
    my (%cfg, %dat);

    foreach my $arg (@_) {
	if ($arg =~ /^(.*)\.cfg$/i) {
	    $cfg{$1} = $arg;
	} elsif ($arg =~ /^(.*)\.dat$/i) {
	    $dat{$1} = $arg;
	} else {
	    $dat{$arg} = "$arg.dat";
	}
    }
    foreach my $arg (keys %cfg) {
	$dat{$arg} = "$arg.dat"
	    unless exists $dat{$arg};
    }
    foreach my $arg (keys %dat) {
	$cfg{$arg} = "$arg.cfg"
	    unless exists $cfg{$arg};
    }
    for my $file (values %cfg, values %dat) {
	die "Datei $file existiert nicht\n"
	    unless -e $file;
    }
    return map { [$cfg{$_}, $dat{$_}] } sort keys %cfg;
}

1;
