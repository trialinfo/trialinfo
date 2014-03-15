#! /usr/bin/perl -w -Ilib

# Trialtool: Veranstaltung zurücksetzen unf zwischen Veranstaltungsarten umschalten (ÖTSV)

# Copyright (C) 2013  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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

use utf8;

use File::Glob ':glob';
use File::Temp qw(tempfile);
use Getopt::Long;
use Trialtool;
use Encode qw(encode decode);
use Encode::Locale qw(decode_argv);
use strict;

sub OTSV { return 0; }
sub OTSV_OSK { return 1; }

my $typ;
my $dry_run;

my $STDOUT_encoding = -t STDOUT ? "console_out" : "UTF-8";
my $STDERR_encoding = -t STDERR ? "console_out" : "UTF-8";
binmode STDIN, ":encoding(console_in)";
binmode(STDOUT, ":encoding($STDOUT_encoding)");
binmode(STDERR, ":encoding($STDERR_encoding)");

my $result = GetOptions(
    "otsv" => sub() { $typ = OTSV; },
    "osk" => sub() { $typ = OTSV_OSK; },
    "dry-run" => \$dry_run);

unless ($result && defined $typ && @ARGV) {
    print <<EOF;
VERWENDUNG: $0 [optionen] {datei|verzeichnis} ...

Schaltet zwischen verschiedenen Veranataltungsarten um, indem die Klassen der
Lizenzfahrer geändert und die startenden Klassen angepasst werden.

DIE PUNKTE, NENNUNGSEINGANG UND PAPIERABNAHME WERDEN ZURÜCKGESETZT!

Als {datei} kann eine *.cfg oder *.dat - Datei angegeben werden, oder beide.
Wird das {verzeichnis} des Trialtools angegeben, wird die aktuelle
Veranstaltung geändert.

Optionen:
  --otsv
    Umschalten auf reine ÖTSV-Veranstaltung ohne OSK-Klassen.

  --osk
    Umschalten auf kombinierte ÖTSV- und OSK-Veranstaltung.
EOF
    exit 1;
}

sub lizenzfahrer($) {
    my ($fahrer) = @_;

    # return $fahrer->{lizenznummer} ne '';
    return $fahrer->{startnummer} < 100;
}

sub lizenzklasse($) {
    my ($fahrer) = @_;

    return $fahrer->{klasse} >= 11 && $fahrer->{klasse} <= 13;
}

if ($^O =~ /win/i) {
    @ARGV = map { bsd_glob($_, GLOB_NOCASE) } @ARGV;
}

sub local_rename($$) {
    my ($from, $to) = @_;

    return rename(encode(locale_fs => $from),
		  encode(locale_fs => $to));
}

decode_argv;

eval {
    foreach my $name (trialtool_dateien @ARGV) {
	my ($otsv, $osk);
	my $fehler;

	print "$name\n" . ("=" x length $name) . "\n\n";
	STDOUT->flush;

	print "Sind Sie sicher, dass Sie die Veranstaltung zurücksetzen\n" .
	      "und in eine " . (($typ == OTSV) ? "Nur-ÖTSV" : "ÖTSV+OSK") .
	      "-Veranstaltung umwandeln wollen (J/N)?";
	STDOUT->flush;

	$_ = <STDIN>;
	print "\n";
	if ($_ !~ /^[jy]/i) {
	    print STDERR "Abbruch!\n";
	    exit 1;
	}

	my $cfg = cfg_datei_parsen("$name.cfg");
	my $fahrer_nach_startnummer = dat_datei_parsen("$name.dat", $cfg, 0);

	my $befahrene_sektionen = 'N' x 15;
	for (my $klasse = 1; $klasse <= 15; $klasse++) {
	    for (my $sektion = 1; $sektion <= 15; $sektion++) {
		substr($befahrene_sektionen, $sektion - 1, 1) = 'J'
		    if substr($cfg->{sektionen}[$klasse - 1], $sektion - 1, 1) eq 'J';
	    }
	}

	foreach my $klasse (($typ == OTSV_OSK) ? (11, 12, 13) : (1)) {
	     $cfg->{sektionen}[$klasse - 1] = $befahrene_sektionen;
	}
	foreach my$klasse (($typ == OTSV_OSK) ? (1) : (11, 12, 13)) {
	     $cfg->{sektionen}[$klasse - 1] = 'N' x 15;
	}

	foreach my $fahrer (values %$fahrer_nach_startnummer) {
	    next
		unless $fahrer->{startnummer} < 1000 && defined $fahrer->{klasse};

	    if ($typ == OTSV_OSK) {
		if (lizenzfahrer($fahrer)) {
		    if ($fahrer->{klasse} >= 1 && $fahrer->{klasse} <= 3) {
			$fahrer->{klasse} += 10;
		    }
		    $fahrer->{wertungen}[0] = lizenzklasse($fahrer);
		    $fahrer->{ausfall} = lizenzklasse($fahrer) ? 0 : 4;  # 4 = Aus der Wertung
		} else {
		    if ($fahrer->{klasse} == 1) {
			$fahrer->{klasse} += 10;
		    } elsif ($fahrer->{klasse} >= 12 && $fahrer->{klasse} <= 13) {
			$fahrer->{klasse} -= 10;
		    }
		    $fahrer->{wertungen}[0] =
			!(lizenzklasse($fahrer) || $fahrer->{klasse} == 5);
		    $fahrer->{ausfall} =
			lizenzklasse($fahrer) ? 4 : 0;  # 4 = Aus der Wertung
		}
		# FIXME: Auch internationale Lizenzfahrer kommen in die
		# Jahreswertung, wenn sie eine zweistellige Startnummer bekommen.
		# Das sollten sie eigentlich nicht, wir können das aber nicht
		# vernünftig unterscheiden.
	    } elsif ($typ == OTSV) {
		if (lizenzklasse($fahrer)) {
		    $fahrer->{klasse} -= 10;
		}
		$fahrer->{wertungen}[0] =
		    !(lizenzfahrer($fahrer) || $fahrer->{klasse} == 5);
		$fahrer->{ausfall} = 0;
	    }
	    $fahrer->{nennungseingang} = 0;
	    $fahrer->{start} = 0;
	    $fahrer->{zusatzpunkte} = 0;
	    $fahrer->{punkte} = 0;
	    $fahrer->{runden} = 0;
	    $fahrer->{punkte_pro_runde} = [ (0) x 5 ];
	    $fahrer->{punkte_pro_sektion} = [ ([ (undef) x 15 ]) x 5 ];
	    $fahrer->{s} = [(0) x 6];
	    $fahrer->{startzeit} = undef;
	    $fahrer->{zielzeit} = undef;
	    $fahrer->{stechen} = 0;
	}

	my ($cfgfh, $cfgname) = tempfile(encode(locale_fs => "$name-XXXXXX"), UNLINK => 1)
	    or die "$!\n";
	$cfgname = decode(locale_fs => $cfgname);
	binmode $cfgfh;
	cfg_datei_schreiben $cfgfh, $cfg;
	$cfgfh->flush;
	eval { $cfgfh->sync; };
	if ($cfgfh->error) {
	    die "Schreiben von '$cfgname': $!\n";
	}
	$cfgfh->close;

	my ($datfh, $datname) = tempfile(encode(locale_fs => "$name-XXXXXX"), UNLINK => 1)
	    or die "$!\n";
	$datname = decode(locale_fs => $datname);
	binmode $datfh;
	dat_datei_schreiben $datfh, $cfg, $fahrer_nach_startnummer;
	$datfh->flush;
	eval { $datfh->sync; };
	if ($datfh->error) {
	    die "Schreiben von '$datname': $!\n";
	}
	$datfh->close;
	
	if ($dry_run) {
	    unless (unlink($cfgname)) {
		die "Löschen von '$cfgname': $!\n";
	    }
	    unless (unlink($datname)) {
		die "Löschen von '$datname': $!\n";
	    }
	} else {
	    unless (local_rename("$name.cfg", "$name.cfg.bak")) {
		die "Umbenennen von '$name.cfg' auf '$name.cfg.bak': $!\n";
	    }
	    unless (local_rename("$name.dat", "$name.dat.bak")) {
		die "Umbenennen von '$name.dat' auf '$name.dat.bak': $!\n";
	    }
	    unless (local_rename($cfgname, "$name.cfg")) {
		die "Umbenennen von '$cfgname' auf '$name.cfg': $!\n";
	    }
	    unless (local_rename($datname, "$name.dat")) {
		die "Umbenennen von '$datname' auf '$name.dat': $!\n";
	    }
	}
    }
};

if ($@) {
    print STDERR "$@\n";
    if ($! =~ /Permission denied/) {
	print STDERR "\nBeenden Sie bitte das TrialTool und versuchen Sie es erneut.\n";
    }
    if ($^O =~ /win/i) {
	print STDERR "\nBitte eine Taste drücken.";
	STDERR->flush;
	$_ = <STDIN>;
    }
}
