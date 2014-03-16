# Trialtool: Lesen des Dateiformats

# Copyright 2012-2014  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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
# direkt vom Dateianfang weg.  Das Format der Fahrerdaten ist in $dat_format
# beschrieben.  Die Datensätze sind folgendermaßen belegt:
#  * 0 - 998:		Fahrer mit zugeordneten Startnummern 1-999.
#  * 999 - 1398:	Fahrer ohne Startnummern.
#  * 1399 - 1599:	Helfer.
#
# Bei Helfern ist die Klasse auf 100 gesetzt, Bewerber ist nachname_vorname des
# zugeordneten Fahrers, und helfer_nummer wird verwendet.  Das Feld
# geburtsdatum ist hier ein Textfeld mit beliebigem Inhalt.
#
# In manchen Dateien wiederholen sich danach Datensätze wie es scheint, und es
# folge anderes rätselhaftes Zeug.
#
# Die *.cfg - Dateien enthalten die Veranstaltungsdaten (siehe $cfg_format).

package Trialtool;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(cfg_datei_parsen cfg_datei_schreiben dat_datei_parsen
	     dat_datei_schreiben trialtool_dateien gestartete_klassen);

use File::Spec::Functions;
use Parse::Binary::FixedFormat;
use Encode qw(encode decode);
use FileHandle;
use JSON_bool;
use strict;

my $cfg_format = [
    "titel:A70:4",			#    0:
    "subtitel:A70:4",			#  280:
    "wertungen:A20:4",			#  560: Bezeichnungen der Wertungen
    "vierpunktewertung:A",		#  640: Vierpunktewertung Fahhrad ("J", "N")
    "wertungsmodus:C",			#  641: Rundenergebnis bei Punktegleichheit:
					#	0 = keines, 1 = aufsteigend, 2 = absteigend
    ":a",				#  642: ?
    "punkte_sektion_auslassen:S<",	#  643: Punkte für Auslassen einer Sektion
    "wertungspunkte_234:S<",		#  645: Wertungspunkte für jeden Fahrer in Wertung 2, 3, 4?
    "rand_links:S<",			#  647: Seitenrand links
    "tastatureingabe:S<",		#  649: Maus- oder Tastatureingabe
    "kartenfarben:A7:5",		#  651: "Blau", "Rot", "Gelb", "Weiss", "Grün", "Braun", "Keine"
    "ergebnisliste_feld:A18",		#  686: "Club", "Fahrzeug", "Wohnort"
    ":a3",				#  704: ?
    "rand_oben:S<",			#  707: Seitenrand oben
    "klassen:A60:15",			#  709: Klassenbezeichnungen
    "fahrzeiten:A5:15",			# 1609:
    "wertungspunkte:S<:20",		# 1684: Wertungspunkte für Rang 1 - 20
    "sektionen:A15:15",			# 1724: Gefahrene Sektionen pro Klasse
    "wertung1_markiert:S<",		# 1949: Feld "Wertungspunkte" markiert?
    "versicherung:S<",			# 1951: Versicherungsart-Vorwahl (0 = Keine,
					#	1 = ADAC-Versicherung, 2 = DMV-Versicherung,
					#	3 = KFZ-Versicherung, 4 = Tagesversicherung)
    ":a10",				# 1953: ?
    "ergebnislistenbreite:S<",		# 1963: Ergebnislistenbreite (7, 8, 9, 10, 12)
    ":a8",				# 1965: ?
    "nennungsmaske_felder1:S<:6",	# 1973: Felder Nennungsmaske (0, 1)
    "auswertung_klasse:S<:15",		# 1985: Klasse in Auswertungsmenü ausgewählt (0, 1)?
    ":a110",				# 2015: ?
    "nennungsmaske_felder2:S<:15",	# 2125: Felder Nennungsmaske (0, 1)
    "_1:S<",				# 2155: ? (immer 1)
    "runden:A:15",			# 2157: Anzahl der Runden je Klasse ("4")
    ":A15",				# 2172: ?
];

# Diese Felder sind in der Eingabemaske immer sichtbar:
my $nennungsmaske_felder = [ qw(
    startnummer
    klasse
    nachname
    vorname
    wertung1
    nennungseingang
    start
    helfer
) ];

# Belegung von $cfg->{nennungsmaske_felder1}:
my $nennungsmaske_felder1 = [ qw(
    kennzeichen
    land
    rahmennummer
    lizenznummer
    hubraum
    bemerkung
) ];

# Belegung von $cfg->{nennungsmaske_felder2}:
my $nennungsmaske_felder2 = [ qw(
    strasse
    plz
    wohnort
    telefon
    geburtsdatum
    bewerber
    club
    fahrzeug
    startzeit
    zielzeit
    wertung2
    wertung3
    wertung4
    nenngeld
    versicherung
) ];

my $dat_format = [
    "klasse:S<",			#   0: 99 = keine Klasse zugeordnet, 100 = Helfer
    "helfer:S<",			#   2: 0 = kein Helfer, sonst "Startnummer" des Helfers
    "nenngeld:A10",			#   4:
    "bewerber:A40",			#  14:
    "nachname:A30",			#  54:
    "vorname:A30",			#  84:
    "nachname_vorname:A20",		# 114: Nachname, Vorname
    ":A20",				# 134: ?
    "strasse:A30",			# 154:
    "wohnort:A40",			# 184:
    "plz:A5",				# 224:
    "club:A40",				# 229:
    "fahrzeug:A30",			# 269:
    "geburtsdatum:A10",			# 299:
    "telefon:A20",			# 309:
    "lizenznummer:A20",			# 329:
    "rahmennummer:A20",			# 349:
    "kennzeichen:A15",			# 369:
    "hubraum:A10",			# 384:
    "bemerkung:A150",			# 394: Verwendet für E-Mail
    "land:A15",				# 544:
    "helfer_nummer:A8",			# 559: (Nur für Helfer)
    ":A10",				# 567: ?
    "startzeit:A5",			# 577:
    "zielzeit:A5",			# 582:
    "wertungen:A:4",			# 587:
    "stechen:S<",			# 591: 0 = kein Stechen
    "start:S<",				# 593: Papierabnahme = Fahrer startet
    "versicherung:A",			# 595: "0" = Keine, "1" = ADAC-Versicherung,
					#      "2" = DMV-Versicherung, "3" = KFZ-Versicherung,
					#      "4" = Tagesversicherung
    "runden:A5",			# 596: Gefahrene Runden
    "zusatzpunkte:f",			# 601:
    "punkte_pro_runde:S<:5",		# 605:
    "r:S<:30",				# 615: [ 0er, ..., 5er ] pro Runde (5er nicht gezählt, immer 0)
    "punkteverteilung:S<:6",		# 675: [ 0er, ..., 5er ] gesamt (5er nicht gezählt, immer 0)
    "punkte:f",				# 687:
    "ausfall:S<",			# 691: 0 = Im Rennen, 3 = Ausfall, 4 = Aus der Wertung,
					#      5 = Nicht gestartet, 6 = Nicht gestartet, entschuldigt
    "nennungseingang:S<",		# 693:
    ":S<",				# 695: ? (immer 0)
    "punkte_pro_sektion:S<:75",		# 697: 6 = kein Ergebnis
					# 847
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

sub encode_strings($$) {
    my ($data, $fmt) = @_;

    for (my $n = 0; $n < @$fmt; $n++) {
	if ($fmt->[$n] =~ /(.*):A[^:]*(:)?/) {
	    if ($2) {
		$data->{$1} = [ map { encode("windows-1252", $_) } @{ $data->{$1}} ];
	    } else {
		$data->{$1} = encode("windows-1252", $data->{$1});
	    }
	}
    }
}

my @ergebnisliste_felder = ( "Club", "Fahrzeug", "Wohnort" );
my %ergebnisliste_felder = (
    map { $ergebnisliste_felder[$_] => $_ }
        (0 .. $#ergebnisliste_felder) );

my %kartenfarben_in = (
    'Blau' => '#0000ff',
    'Braun' => '#a52a2a',
    'Gelb' => '#ffff00',
    'Grün' => '#008000',
    'Rot' => '#ff0000',
    'Weiss' => '#ffffff',
);
my %kartenfarben_out = map { $kartenfarben_in{$_} => $_ } keys %kartenfarben_in;

sub cfg_datei_parsen($) {
    my ($dateiname) = @_;

    my $fh = new FileHandle(encode(locale_fs => $dateiname));
    binmode $fh, ":bytes";
    my $cfg = do { local $/; <$fh> };
    my $cfg_parser = new Parse::Binary::FixedFormat($cfg_format);
    $cfg = $cfg_parser->unformat($cfg);
    decode_strings($cfg, $cfg_format);
    delete $cfg->{''};
    $cfg->{runden} = [ map { ord($_) - ord("0") } @{$cfg->{runden}} ];
    $cfg->{fahrzeiten} = [ map { $_ eq "00:00" ? undef : "$_:00" } @{$cfg->{fahrzeiten}} ];
    $cfg->{vierpunktewertung} = json_bool($cfg->{vierpunktewertung} eq "J");
    $cfg->{ergebnisliste_feld} = $ergebnisliste_felder{$cfg->{ergebnisliste_feld}};
    $cfg->{kartenfarben} = [ map { $_ eq "Keine" ? undef : $kartenfarben_in{$_} } @{$cfg->{kartenfarben}} ];
    $cfg->{wertung1_markiert} = json_bool($cfg->{wertung1_markiert});

    my $klassen = [];
    for (my $n = 0; $n < @{$cfg->{klassen}}; $n++) {
	$klassen->[$n] = {
	    bezeichnung => $cfg->{klassen}[$n],
	    runden => $cfg->{runden}[$n],
	    fahrzeit => $cfg->{fahrzeiten}[$n],
	    # farbe => ...
	    wertungsklasse => $n + 1,
	};
    }
    $cfg->{klassen} = $klassen;
    delete $cfg->{runden};
    delete $cfg->{fahrzeiten};

    my $wertungen = [];
    for (my $n = 0; $n < @{$cfg->{titel}}; $n++) {
	$wertungen->[$n] = {
	    titel => $cfg->{titel}[$n],
	    subtitel => $cfg->{subtitel}[$n],
	    bezeichnung => $cfg->{wertungen}[$n],
	};
    }
    $cfg->{wertungen} = $wertungen;
    delete $cfg->{titel};
    delete $cfg->{subtitel};

    my $sektionen = [];
    for (my $n = 0; $n < @{$cfg->{sektionen}}; $n++) {
	my $s = $cfg->{sektionen}[$n];
	$sektionen->[$n] = [];
	for (my $i = 0; $i < length $s; $i++) {
	    push @{$sektionen->[$n]}, $i + 1
		if substr($s, $i, 1) eq 'J';
	}
    }
    $cfg->{sektionen} = $sektionen;

    for (my $n = @{$cfg->{wertungspunkte}} - 1; $n > 0; $n--) {
	pop @{$cfg->{wertungspunkte}}
	    if $cfg->{wertungspunkte}[$n] == $cfg->{wertungspunkte}[$n - 1];
    }

    $cfg->{features} = [ @$nennungsmaske_felder ];
    for (my $n = 0; $n < @$nennungsmaske_felder1; $n++) {
	push @{$cfg->{features}}, $nennungsmaske_felder1->[$n]
	    if $cfg->{nennungsmaske_felder1}[$n];
    }
    for (my $n = 0; $n < @$nennungsmaske_felder2; $n++) {
	push @{$cfg->{features}}, $nennungsmaske_felder2->[$n]
	    if $cfg->{nennungsmaske_felder2}[$n];
    }
    delete $cfg->{nennungsmaske_felder1};
    delete $cfg->{nennungsmaske_felder2};
    delete $cfg->{_1};

    return $cfg;
}

sub cfg_datei_schreiben($$) {
    my ($fh, $cfg) = @_;

    binmode $fh, ":bytes";
    my $cfg_parser = new Parse::Binary::FixedFormat($cfg_format);

    $cfg = { %{$cfg} };

    my $features = { map { $_ => 1 } @{$cfg->{features}} };

    for (my $n = @{$cfg->{wertungspunkte}}; $n < 20; $n++) {
	$cfg->{wertungspunkte}[$n] = $cfg->{wertungspunkte}[$n - 1];
    }

    my $sektionen = $cfg->{sektionen};
    $cfg->{sektionen} = [];
    for (my $n = 0; $n < 15; $n++) {
	my $s = 'N' x 15;
	foreach my $sektion (@{$sektionen->[$n]}) {
	    substr($s, $sektion - 1, 1) = 'J';
	}
	push @{$cfg->{sektionen}}, $s;
    }

    my $klassen = $cfg->{klassen};
    $cfg->{klassen} = [];
    $cfg->{runden} = [];
    $cfg->{fahrzeit} = [];
    for (my $n = 0; $n < 15; $n++) {
	my $klasse = $klassen->[$n];
	push @{$cfg->{klassen}}, $klasse->{bezeichnung};
	push @{$cfg->{runden}}, $klasse->{runden};
	push @{$cfg->{fahrzeit}}, $klasse->{fahrzeit};
    }

    my $wertungen = $cfg->{wertungen};
    $cfg->{titel} = [];
    $cfg->{subtitel} = [];
    $cfg->{wertungen} = [];
    for (my $n = 0; $n < 4; $n++) {
	my $wertung = $wertungen->[$n];
	push @{$cfg->{titel}}, $wertung->{titel};
	push @{$cfg->{subtitel}}, $wertung->{subtitel};
	push @{$cfg->{wertungen}}, $wertung->{bezeichnung};
    }

    $cfg->{nennungsmaske_felder1} = [];
    for (my $n = 0; $n < @$nennungsmaske_felder1; $n++) {
	$cfg->{nennungsmaske_felder1}[$n] =
	    exists $features->{$nennungsmaske_felder1->[$n]};
    }
    $cfg->{nennungsmaske_felder2} = [];
    for (my $n = 0; $n < @$nennungsmaske_felder2; $n++) {
	$cfg->{nennungsmaske_felder2}[$n] =
	    exists $features->{$nennungsmaske_felder2->[$n]};
    }
    delete $cfg->{features};
    $cfg->{_1} = 1;

    # Pad arrays; otherwise pack() writes variable-length records
    foreach my $fmt (@$cfg_format) {
	if ($fmt =~ /(.*):.*:(.*)/) {
	    $cfg->{$1}[$2 - 1] //= undef;
	}
    }

    $cfg->{kartenfarben} = [ map { defined $_ ? $kartenfarben_out{$_} : "Keine" } @{$cfg->{kartenfarben}} ];
    $cfg->{runden} = [ map { "0" + ($_ // 0) } @{$cfg->{runden}} ];
    $cfg->{fahrzeiten} = [ map { defined $_ ? substr($_, 0, 5) : "00:00" } @{$cfg->{fahrzeiten}} ];
    $cfg->{vierpunktewertung} = $cfg->{vierpunktewertung} ? "J" : "N";
    $cfg->{wertung1_markiert} = json_unbool($cfg->{wertung1_markiert});
    $cfg->{ergebnisliste_feld} = $ergebnisliste_felder[$cfg->{ergebnisliste_feld}];

    encode_strings($cfg, $cfg_format);
    print $fh $cfg_parser->format($cfg);
}

sub runden_zaehlen($) {
    my ($string) = @_;

    my $index = index($string, "N");
    return $index == -1 ? length($string) : $index;
}

sub punkte_aufteilen($) {
    my ($punkte) = @_;

    $punkte = [ map { $_ == 6 ? undef : $_ } @$punkte ];
    return [ [@$punkte[0..14]],
	     [@$punkte[15..29]],
	     [@$punkte[30..44]],
	     [@$punkte[45..59]],
	     [@$punkte[60..74]] ];
}

sub dat_datei_parsen($$$) {
    my ($dateiname, $cfg, $nur_fahrer) = @_;

    my $startnummern = $nur_fahrer ? 999 : 1600;
    my $fh = new FileHandle(encode(locale_fs => $dateiname));
    binmode $fh, ":bytes";
    my $dat = do { local $/; <$fh> };
    my $fahrer_nach_startnummern;

    $cfg->{neue_startnummern} = {};
    my $fahrer_parser = new Parse::Binary::FixedFormat($dat_format);
    for (my $n = 1; $n <= $startnummern; $n++) {
	my $startnummer = $n;
	my $fahrer_binaer = substr($dat, ($n - 1) * 847, 847);
	my $klasse = unpack "S<", $fahrer_binaer;
	next if $klasse == 0;
	my $fahrer = $fahrer_parser->unformat($fahrer_binaer);
	decode_strings($fahrer, $dat_format);
	delete $fahrer->{''};

	if ($startnummer >= 1000 && $startnummer < 1400) {
	    # Dast Trialtool verwendet dir Startnummern 1000 - 1399 für Fahrer,
	    # denen keine Startnummer zugeordnet ist.  Um in der internen
	    # Darstellung auch mehr als 400 Fahrer ohne Startnummer darstellen
	    # zu können, ändern wir diesen Bereich auf -1 .. -400.
	    $startnummer = 999 - $startnummer;
	    # Sicherstellen, dass Fahrer ohne Startnummer nicht in den
	    # Starterlisten oder Ergebnissen auftauchen!
	    $fahrer->{nennungseingang} = 0;
	    $fahrer->{start} = 0;
	}

	$fahrer->{startnummer} = $startnummer;
	$fahrer->{klasse} = undef
	    if $fahrer->{klasse} == 99;
	$fahrer->{helfer} = undef
	    if $fahrer->{helfer} == 0;
	$fahrer->{wertungen} = [ map { $_ eq 'J' ? { aktiv => json_bool(1) } : {} } @{$fahrer->{wertungen}} ];
	$fahrer->{nennungseingang} = json_bool($fahrer->{nennungseingang});
	$fahrer->{start} = json_bool($fahrer->{start});
	# Das Rundenfeld im Trialtool gibt an wieviele Runden schon eingegeben
	# wurden, und nicht, wieviele Runden komplett gefahren wurden.
	# Sektionen können bei der Eingabe übersprungen werden, im Unterschied
	# zur Eingabe für Strafpunkte für eine Sektion, die der Fahrer
	# ausgelassen hat.
	$fahrer->{runden} = runden_zaehlen($fahrer->{runden});
	$fahrer->{punkte_pro_sektion} = punkte_aufteilen([
	    map { $_ > 5 ? -1 : $_ } @{$fahrer->{punkte_pro_sektion}} ]);
	delete $fahrer->{r};
	if ($fahrer->{geburtsdatum} =~ /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/) {
	    my $jahr;
	    if ($3 > 100) {
		$jahr = $3;
	    } elsif ($3 > localtime->year() % 100) {
		$jahr = $3 + int(localtime->year() / 100) * 100 + 1800;
	    } else {
		$jahr = $3 + int(localtime->year() / 100) * 100 + 1900;
	    }
	    $fahrer->{geburtsdatum} = sprintf("%04d-%02d-%02d", $jahr, $2, $1);
	    $fahrer->{geburtsdatum} = undef
		if $fahrer->{geburtsdatum} eq "1901-01-01";
	} else {
	    $fahrer->{geburtsdatum} = undef;
	}
	if ($fahrer->{startzeit} =~ /^(\d{1,2})\.(\d{1,2})$/ &&
	    "$1:$2" ne "00:00") {
	    $fahrer->{startzeit} = "$1:$2:00";
	} else {
	    $fahrer->{startzeit} = undef;
	}
	if ($fahrer->{zielzeit} =~ /^(\d{1,2})\.(\d{1,2})$/ &&
	    "$1:$2" ne "00:00") {
	    $fahrer->{zielzeit} = "$1:$2:00";
	} else {
	    $fahrer->{zielzeit} = undef;
	}
	$fahrer->{versicherung} = $fahrer->{versicherung} - '0';
	$fahrer->{versicherung} = undef
	    if $fahrer->{versicherung} == 0;

	if ($fahrer->{bemerkung} =~ s/\s*\*JW:\s*(\d*)\s*\*\s*//) {
	    # Falls für die Jahreswerung eine andere Startnummer verwendet
	    # werden soll, kann das im Feld Bemerkung vermerkt werden,
	    # z.B.:  *JW:987*.  Wenn keine Startnummer angegeben ist
	    # (*JW:*), werden die Wertungspunkte in der Jahreswertung
	    # ignoriert.
	    $cfg->{neue_startnummern}{$startnummer} = $1 || undef;
	}

	if ($fahrer->{bemerkung} =~ s/\s*\*BL:\s*([^*]*?)\s*\*\s*//) {
	    $fahrer->{bundesland} = $1;
	} else {
	    $fahrer->{bundesland} = undef;
	}
	$fahrer_nach_startnummern->{$startnummer} = $fahrer;
    }

    return $fahrer_nach_startnummern;
}

sub dat_datei_schreiben($$$) {
    my ($fh, $cfg, $fahrer_nach_startnummern) = @_;
    my $leerer_fahrer = "\0" x 4 . " " x 573 . "00.0000.00NNNN" .
			"\0" x 4 . "0NNNNN" . "\0" x 96 . "\6\0" x 75;

    binmode $fh, ":bytes";

    my $fahrer_parser = new Parse::Binary::FixedFormat($dat_format);

    my $neue_startnummern = $cfg->{neue_startnummern};
    for (my $n = 0; $n < 1600; $n++) {
	my $startnummer = $n + 1;
	if ($startnummer >= 1000 && $startnummer < 1400) {
	    # Fahrer ohne Startnummer: siehe dat_datei_parsen().
	    $startnummer = 999 - $startnummer;
	}

	if (exists $fahrer_nach_startnummern->{$startnummer}) {
	    my $fahrer = { %{$fahrer_nach_startnummern->{$startnummer}} };
	    if ($fahrer->{ausser_konkurrenz} && $fahrer->{ausfall} == 0) {
		$fahrer->{ausfall} = 4;  # Aus der Wertung
	    }
	    if (defined $fahrer->{email}) {
		$fahrer->{bemerkung} = $fahrer->{email} . " " . $fahrer->{bemerkung};
	    }
	    if (defined $fahrer->{bundesland}) {
		$fahrer->{bemerkung} .= " *BL:" .
		    ($fahrer->{bundesland} // '') . "*";
	    }
	    my $nachname_vorname = "$fahrer->{nachname}, $fahrer->{vorname}";
	    $nachname_vorname = substr($nachname_vorname, 0, 19) . '.'
		if length $nachname_vorname > 20;
	    $fahrer->{nachname_vorname} = $nachname_vorname;
	    if (defined $fahrer->{geburtsdatum} && $fahrer->{geburtsdatum} =~ /^(....)-(..)-(..)$/) {
		$fahrer->{geburtsdatum} = "$3.$2.$1";
	    } else {
		$fahrer->{geburtsdatum} = undef;
	    }
	    my $runden = $fahrer->{runden} // 0;
	    $fahrer->{runden} = 'J' x $runden . 'N' x (5 - $runden);
	    $fahrer->{versicherung} = '0' + ($fahrer->{versicherung} // 0);

	    if (defined $fahrer->{startzeit} && $fahrer->{startzeit} =~ /(..):(..):(..)/) {
		$fahrer->{startzeit} = "$1.$2";
	    } else {
		$fahrer->{startzeit} = undef;
	    }
	    if (defined $fahrer->{zielzeit} && $fahrer->{zielzeit} =~ /(..):(..):(..)/) {
		$fahrer->{zielzeit} = "$1.$2";
	    } else {
		$fahrer->{zielzeit} = undef;
	    }
	    if (exists $neue_startnummern->{$startnummer}) {
		$fahrer->{bemerkung} .= " *JW:" .
		    ($neue_startnummern->{$startnummer} // '') . "*";
	    }

	    # Das Trialtool merkt sich nicht, welche Sektionen aus der Wertung
	    # genommen wurden, wir müssen hier also stattdessen die Punkte dieser
	    # Sektionen auf undef setzen.

	    my $punkte_pro_sektion = $fahrer->{punkte_pro_sektion};

	    if ($cfg->{sektionen_aus_wertung} && defined $fahrer->{klasse}) {
		if (my $runden = $cfg->{sektionen_aus_wertung}[$fahrer->{klasse} - 1]) {
		    for (my $runde = 0; $runde < @$runden; $runde++) {
			if (my $sektionen = $runden->[$runde]) {
			    foreach my $sektion ($sektionen) {
				$punkte_pro_sektion->[$runde][$sektion - 1] = undef;
			    }
			}
		    }
		}
	    }

	    my $r;
	    for (my $runde = 0; $runde < 5; $runde++) {
		for (my $sektion = 0; $sektion < 15; $sektion++) {
		    my $punkte = $punkte_pro_sektion->[$runde][$sektion];
		    $r->[$runde * 6 + $punkte]++
			if defined $punkte && $punkte >= 0 && $punkte < 5;
		}
	    }
	    $fahrer->{r} = $r;

	    my $p;
	    for (my $runde = 0; $runde < 5; $runde++) {
		for (my $sektion = 0; $sektion < 15; $sektion++) {
		    $p->[$runde * 15 + $sektion] =
			$punkte_pro_sektion->[$runde][$sektion] // 6;
		}
	    }
	    my $auslassen = $cfg->{punkte_sektion_auslassen};
	    $fahrer->{punkte_pro_sektion} = [ map { $_ == -1 ? $auslassen : $_ } @$p ];

	    $fahrer->{punkteverteilung}[5] = 0;  # Anzahl der 5er ist immer auf 0 gesetzt ...

	    $fahrer->{klasse} = 99
		unless defined $fahrer->{klasse};

	    # Pad arrays; otherwise pack() writes variable-length records
	    foreach my $fmt (@$dat_format) {
		if ($fmt =~ /(.*):.*:(.*)/) {
		    $fahrer->{$1}[$2 - 1] //= undef;
		}
	    }

	    $fahrer->{wertungen} = [ map { $_ && $_->{aktiv} ? 'J' : 'N' } @{$fahrer->{wertungen}} ];
	    $fahrer->{nennungseingang} = json_unbool($fahrer->{nennungseingang});
	    $fahrer->{start} = json_unbool($fahrer->{start});
	    encode_strings($fahrer, $dat_format);
	    print $fh $fahrer_parser->format($fahrer);
	} else {
	    print $fh $leerer_fahrer;
	}
    }
}

# Nimmt eine Liste von Datei- / Verzeichnisnamen aus Argument, und liefert eine
# Liste von Dateinamen ohne Erweiterung.  Es wird überprüft, ob die dazugehörige
# *.cfg und *.dat - Datei existiert.
#
#  - Wenn "Dateiname" mit oder ohne Erweiterung *.cfg oder *.dat angegeben
#    wird, ergibt das "Dateiname".
#
#  - Wenn ein Verzeichnisname angegeben wird, wird angenommen, dass das
#    Verzeichnis das TrialTool enthält.  Es wird der Dateiname der aktuellen
#    Veranstaltung zurückgegeben.
#
sub trialtool_dateien(@) {
    my (%name);

    foreach my $arg (@_) {
	if (-d encode(locale_fs => $arg)) {
	    my $ini = catfile($arg, "trialtool.ini");
	    my $fh = new FileHandle(encode(locale_fs => $ini), "<:bytes")
		or die "$ini: $!\n";
	    my $arg2 = do { local $/; <$fh> };
	    $arg2 =~ s/\r?\n$//s;
	    $arg2 = decode("windows-1252", $arg2);
	    $name{catfile($arg, $arg2)} = 1;
	} elsif ($arg =~ /^(.*)\.(cfg|dat)$/i) {
	    $name{$1} = 1;
	} else {
	    $name{$arg} = 1;
	}
    }
    foreach my $name (keys %name) {
	die "Datei $name.cfg existiert nicht\n"
	    unless -e encode(locale_fs => "$name.cfg");
	die "Datei $name.dat existiert nicht\n"
	    unless -e encode(locale_fs => "$name.dat");
    }
    return sort keys %name;
}

sub gestartete_klassen($) {
    my ($cfg) = @_;

    my $sektionen = $cfg->{sektionen};
    my $gestartet = [];
    for (my $n = 0; $n < @$sektionen; $n++) {
	$gestartet->[$n] = 1
	    if $sektionen->[$n] && @{$sektionen->[$n]};
    }
    return $gestartet;
}

1;
