#! /usr/bin/perl -w

# Trialtool
#
# Die *.dat - Dateien bestehen aus Datensätzen zu je 847 Bytes pro Fahrer,
# direkt vom Dateianfang weg.  Das Format der Fahrerdaten ist in $fahrer_format
# beschrieben.  Die Datensätze 0 - 999 enthalten die Fahrer mit zugeordneter
# Startnummer, darauf folgen in den Datensätzen 1000 bis ~1400 Fahrer ohne
# Startnummer.  Danach folgen die den Fahrern zugeordneten Helfer.
# 
# * Wie werden die Zusatzpunkte gespeichert?
# * Wie speichert das Trialtool die Reihenfolge der Fahrer in den
#   Ergebnislisten?
#
# TODO:
# * UTF-8 Zeichencodierung fixen
# * Datenmodell
# * Datenbank füttern
# * Änderungen erkennen und nur Änderungen schicken
# * "Dameon" mode
# * Logfile?

use Parse::Binary::FixedFormat;
use Data::Dumper;
use Encode qw(find_encoding);
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

sub cfg_datei_parsen($) {
    my ($dateiname) = @_;

    my $fh = new FileHandle($dateiname);
    my $cfg = do { local $/; <$fh> };
    my $cfg_parser = new Parse::Binary::FixedFormat($cfg_format);
    $cfg = $cfg_parser->unformat($cfg);
    delete $cfg->{''};
    zeichensatz_konvertieren($cfg, $cfg_format);
    $cfg->{runden} = [ map { ord($_) - ord("0") } @{$cfg->{runden}} ];
    return $cfg;
}

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
    "runden:A5",		# Gefahrene Runden
    ":A2",
    ":A2",				# Zusatzpunkte (Codierung?)
    "punkte_pro_runde:S<:5",
    ":A60",				# ?
    "oer_1er_2er_3er:S<:4",
    ":A6",				# ?
    ":S<",				# Punkte + Zusatzpunkte (Codierung?)
    "ausfall:S<",			# 0 = Im Rennen, 3 = Ausfall, 4 = Aus der Wertung,
					# 5 = Nicht gestartet, 6 = Nicht gestartet, entschuldigt
    "nennungseingang:S<",
    ":A2",				# ?
    "punkte_pro_sektion:S<:75",		# 6 = kein Ergebnis
];

sub zeichensatz_konvertieren($$) {
    my ($fahrer, $fahrer_format) = @_;
    my $encoding = find_encoding("iso-8859-15")
	or die "Can't find iso-8859-15 encoding\n";

    # FIXME: Aus irgend einem Grund decodiert er nicht richtig ...

    foreach my $f (@$fahrer_format) {
	next unless $f =~ /(.*):A/ && $1 ne "";
	if (ref($fahrer->{$1}) eq "ARRAY") {
	    $fahrer->{$1} = [ map { $encoding->decode($_) } @{$fahrer->{$1}} ];
	} else {
	    $fahrer->{$1} = $encoding->decode($fahrer->{$1});
	}
    }
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

sub punkte_ausrechnen($) {
    my ($fahrer) = @_;
    my $punkte = 0;

    foreach my $p (@{$fahrer->{punkte_pro_runde}}) {
	$punkte += $p;
    }
    $fahrer->{punkte} = $punkte;
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

    # Fahrer mit Papierabnahme vor Fahrern ohne Papierabnahme
    return $b->{papierabnahme} - $a->{papierabnahme}
    	if $a->{papierabnahme} != $b->{papierabnahme};

    # Fahrer im Rennen und ausgefallene Fahrer vor Fahrern aus der Wertung und
    # nicht gestarteten Fahrern
    return ($a->{ausfall} <= 3) - ($b->{ausfall} <= 3)
    	if ($a->{ausfall} <= 3) != ($b->{ausfall} <= 3);

    # Abfallend nach gefahrenen Runden
    return $b->{runden} - $a->{runden}
    	if $a->{runden} != $b->{runden};

    # Aufsteigend nach Punkten
    return $a->{punkte} - $b->{punkte}
	if $a->{punkte} != $b->{punkte};

    # Abfallend nach 0ern, 1ern, 2ern, 3ern
    my $ax = $a->{oer_1er_2er_3er};
    my $bx = $b->{oer_1er_2er_3er};
    for (my $n = 0; $n < @$ax; $n++) {
	return $bx->[$n] - $ax->[$n]
	    if $ax->[$n] != $bx->[$n];
    }

    # Aufsteigend nach der besten letzten Runde
    $ax = $a->{punkte_pro_runde};
    $bx = $b->{punkte_pro_runde};
    for (my $n = @$ax - 1; $n >= 0; $n--){
	return $ax->[$n] - $bx->[$n]
	    if $ax->[$n] != $bx->[$n];
    }

    # Aufsteigend nach Ergebnis im Stechen
    return $a->{stechen} - $b->{stechen};
}

sub rang_berechnen($) {
    my ($fahrer_nach_klassen) = @_;

    foreach my $klasse (keys %$fahrer_nach_klassen) {
	my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};
	my $rang = 1;

	$fahrer_in_klasse = [ sort rang_vergleich @$fahrer_in_klasse ];
	for (my $n = 0, my $vorheriger_fahrer; $n < @$fahrer_in_klasse; $n++) {
	    my $fahrer = $fahrer_in_klasse->[$n];
	    if ($fahrer->{runden} > 0) {
		$fahrer->{rang} =
		    $vorheriger_fahrer &&
		    rang_vergleich($vorheriger_fahrer, $fahrer) == 0 ?
			$vorheriger_fahrer->{rang} : $rang;
		$rang++;
		$vorheriger_fahrer = $fahrer;
	    }
	}
	$fahrer_nach_klassen->{$klasse} = $fahrer_in_klasse;
    }
}

sub dat_datei_parsen($) {
    my ($dateiname) = @_;

    my $fh = new FileHandle($dateiname);
    my $dat = do { local $/; <$fh> };
    my $fahrer_nach_startnummern;
    my $fahrer_nach_klassen;

    my $fahrer_parser = new Parse::Binary::FixedFormat($fahrer_format);
    for (my $n = 0; $n < 1000; $n++) {
	my $fahrer_binaer = substr($dat, $n * 847, 847);
	my $klasse = unpack "S<", $fahrer_binaer;
	next if $klasse == 0;
	my $fahrer = $fahrer_parser->unformat($fahrer_binaer);
	delete $fahrer->{''};
	zeichensatz_konvertieren($fahrer, $fahrer_format);
	$fahrer->{startnummer} = $n + 1;
	$fahrer->{wertungen} = [ map { $_ eq "J" ? 1 : 0 } @{$fahrer->{wertungen}} ];
	$fahrer->{runden} = runden_zaehlen($fahrer->{runden});
	$fahrer->{punkte_pro_sektion} = punkte_aufteilen($fahrer->{punkte_pro_sektion});
	punkte_ausrechnen $fahrer;
	$fahrer_nach_startnummern->{$fahrer->{startnummer}} = $fahrer;
    }

    $fahrer_nach_klassen = fahrer_nach_klassen($fahrer_nach_startnummern);
    rang_berechnen $fahrer_nach_klassen;
    return $fahrer_nach_startnummern;
}

sub wertungspunkte_einfuegen($$) {
    my ($fahrer_nach_startnummer, $cfg) = @_;

    my $wp = $cfg->{wertungspunkte};
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	my $idx = $fahrer->{klasse} - 1;
	next unless defined $fahrer->{rang} &&
		    $fahrer->{rang} <= 20 &&
		    $wp->[$fahrer->{rang} - 1] != 0 &&
		    $fahrer->{runden} == $cfg->{runden}[$idx] &&
		    !$fahrer->{ausfall};
	
	$fahrer->{wertungspunkte} = $wp->[$fahrer->{rang} - 1];
    }
}

sub rang_wenn_definiert($$) {
    my ($a, $b) = @_;

    return exists($a->{rang}) - exists($b->{rang})
	if exists($a->{rang}) != exists($b->{rang});
    return $a->{rang} <=> $b->{rang};
}

sub ergebnis_ausgeben($$) {
    my ($cfg, $fahrer_nach_startnummer) = @_;

    my $ausfall = {
	3 => "ausgefallen",
	4 => "aus der wertung",
	5 => "nicht gestartet",
	6 => "nicht gestartet, entschuldigt"
    };

    print "$cfg->{titel}[0]\n$cfg->{subtitel}[0]\n\n";

    my $fahrer_nach_klassen = fahrer_nach_klassen($fahrer_nach_startnummer);
    foreach my $klasse (sort {$a <=> $b} keys $fahrer_nach_klassen) {
	my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};
	my $idx = $klasse - 1;
	my $runden = $cfg->{runden}[$idx];

	printf "$cfg->{klassen}[$idx]\n";
	print "     Nr." . (" " x 22);
	for (my $n = 0; $n < $runden; $n++) {
	   print "  R", $n + 1;
	}
	print "  ZP  0S  1S  2S  3S  Ges  WP\n";
	$fahrer_in_klasse = [ sort rang_wenn_definiert @$fahrer_in_klasse ];
	foreach my $fahrer (@$fahrer_in_klasse) {
	    next if $fahrer->{runden} == 0;
	    if ($fahrer->{runden} == $runden &&  !$fahrer->{ausfall}) {
		printf " %2u", $fahrer->{rang};
	    } else {
		printf "   ";
	    }
	    printf " %s%3u", ($fahrer->{ausfall} == 4 ? "(" : " "), $fahrer->{startnummer};
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
	    } else {
		for (my $n = 0; $n < 4; $n++) {
		    printf "  %2u", $fahrer->{oer_1er_2er_3er}[$n];
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

my $cfg = cfg_datei_parsen($ARGV[0]);
my $fahrer_nach_startnummer = dat_datei_parsen($ARGV[1]);
wertungspunkte_einfuegen $fahrer_nach_startnummer, $cfg;

# FIXME: Das ist böse ...
binmode(STDOUT, ":utf8");

ergebnis_ausgeben $cfg, $fahrer_nach_startnummer;
# print Dumper($cfg);
# print Dumper($fahrer_nach_startnummer);
