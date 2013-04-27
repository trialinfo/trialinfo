#! /usr/bin/perl -w -Itrial-toolkit

# Trialtool: Daten aus SQL-Datenbank in Trialtool-Dateien exportieren

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

use utf8;
use DBI;
use Trialtool qw(cfg_datei_schreiben dat_datei_schreiben);
use Datenbank qw(cfg_aus_datenbank fahrer_aus_datenbank db_utf8);
use Getopt::Long;
use File::Glob ':glob';
use Encode qw(encode);
use Encode::Locale qw(decode_argv);
use File::Temp qw(tempfile);
use TrialToolkit;
use strict;

my $STDOUT_encoding = -t STDOUT ? "console_out" : "UTF-8";
my $STDERR_encoding = -t STDERR ? "console_out" : "UTF-8";
binmode(STDIN, ":encoding(console_in)");
binmode(STDOUT, ":encoding($STDOUT_encoding)");
binmode(STDERR, ":encoding($STDERR_encoding)");

my $list;
my $force;
my $result = GetOptions("db=s" => \$database,
			"username=s" => \$username,
			"password=s" => \$password,
			"l|list" => \$list,
			"force" => \$force);

if ($^O =~ /win/i) {
    @ARGV = map { bsd_glob($_, GLOB_NOCASE) } @ARGV;
}

decode_argv;

unless ($result && $database && ($list || @ARGV)) {
    print <<EOF;
VERWENDUNG: $0 [optionen] {id} ...

Erzeugt die *.cfg und *.dat - Datei einer oder mehrerer Veranstaltungen aus der
Datenbank.  Eine Liste der vorhandenen Veranstaltungs-IDs kann mit der Option
--list angezeigt werden.

Optionen:
  --db=...
    Name der Datenbank, z.B. "mysql:database;host=hostname".  Verschiedene
    Datenbanktypen werden unterstützt; derzeit wird hauptsächlich MySQL
    verwendet.  Wenn nicht angegeben, wird die Default-Datenbankverbindung
    verwendet.

  --username=...
    Benutzername für den Datenbankzugriff.  Wenn nicht angegeben, wird der
    Default-Benutzername verwendet.

  --password=...
    Kennwort für den Datenbankzugriff.  Wen nicht angegeben, wird das Default-
    Kennwort verwendet.

  --list
    Die vorhandenen Veranstaltungen mit ihrer ID anzeigen.

  --force
    Bestehende Dateien überschreiben.
EOF
    exit $result ? 0 : 1;
}

my $dbh = DBI->connect("DBI:$database", $username, $password,
		       { RaiseError => 1, AutoCommit => 1, db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

my $status = 0;

if ($list) {
    my $sth = $dbh->prepare(q{
	SELECT id, dateiname
	FROM veranstaltung
	ORDER BY dateiname
    });
    $sth->execute;
    my $header_printed;
    while (my @row = $sth->fetchrow_array) {
	unless ($header_printed) {
	    printf "%3s  %s\n", "id", "dateiname";
	    $header_printed = 1;
	}
	printf "%3d  %s\n", @row;
    }
} else {
    foreach my $id (@ARGV) {
	eval {
	    my $dateiname;

	    my $sth = $dbh->prepare(q{
		SELECT dateiname
		FROM veranstaltung
		WHERE id = ?
	    });
	    $sth->execute($id);
	    if (my @row = $sth->fetchrow_array) {
		$dateiname = $row[0];
		if (-e "$dateiname.cfg" && !$force) {
		    die "Dateiname '$dateiname.cfg' existiert bereits; überschreiben mit --force\n";
		}
		if (-e "$dateiname.dat" && !$force) {
		    die "Dateiname '$dateiname.dat' existiert bereits; überschreiben mit --force\n";
		}
		print "$dateiname.cfg\n";
		my ($cfg_mtime, $dat_mtime);
		my $cfg = cfg_aus_datenbank($dbh, $id, \$cfg_mtime, \$dat_mtime);
		my ($cfg_fh, $cfg_name) = tempfile("$dateiname-XXXXXX",
						   SUFFIX => ".cfg",
						   UNLINK => 1);
		cfg_datei_schreiben $cfg_fh, $cfg;
		$cfg_fh->flush;
		utime $cfg_mtime, $cfg_mtime, $cfg_fh;

		print "$dateiname.dat\n";
		my $fahrer_nach_startnummer = fahrer_aus_datenbank($dbh, $id);
		my ($dat_fh, $dat_name) = tempfile("$dateiname-XXXXXX",
						   SUFFIX => ".dat",
						   UNLINK => 1);
		dat_datei_schreiben $dat_fh, $fahrer_nach_startnummer;
		$dat_fh->flush;
		utime $dat_mtime, $dat_mtime, $dat_fh;

		unless (rename $cfg_name, encode(locale_fs => "$dateiname.cfg")) {
		    die "$dateiname.cfg: $!\n";
		}
		unless (rename $dat_name, encode(locale_fs => "$dateiname.dat")) {
		    die "$dateiname.dat: $!\n";
		    next;
		}
	    } else {
		die "Keine Veranstaltung mit id $id gefunden\n";
	    }
	};
	if ($@) {
	    warn $@;
	    $status = 1;
	}
    }
}

exit $status;
