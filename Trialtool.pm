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

package Trialtool;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(cfg_datei_parsen dat_datei_parsen trialtool_dateien gestartete_klassen);

use File::Spec::Functions;
use Parse::Binary::FixedFormat;
use Encode qw(encode decode);
use FileHandle;
use strict;

my $cfg_format = [
    "titel:A70:4",
    "subtitel:A70:4",
    "wertungen:A20:4",			# Bezeichnungen der Wertungen
    ":A1",
    "wertungsmodus:C",			# Rundenergebnis bei Punktegleichheit:
					# 0 = keines, 1 = aufsteigend, 2 = absteigend
    ":A9",
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
    "s0:S<",				# 0er
    "s1:S<",				# 1er
    "s2:S<",				# 2er
    "s3:S<",				# 3er
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

    my $fh = new FileHandle(encode(locale_fs => $dateiname));
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

sub dat_datei_parsen($) {
    my ($dateiname) = @_;

    my $fh = new FileHandle(encode(locale_fs => $dateiname));
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
    my $gestartet;
    for (my $n = 0; $n < @$sektionen; $n++) {
	push @$gestartet, (index $sektionen->[$n], "J") != -1;
    }
    return $gestartet;
}

1;
