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
use strict;

my $STDOUT_encoding = -t STDOUT ? "console_out" : "UTF-8";
my $STDERR_encoding = -t STDERR ? "console_out" : "UTF-8";
binmode(STDIN, ":encoding(console_in)");
binmode(STDOUT, ":encoding($STDOUT_encoding)");
binmode(STDERR, ":encoding($STDERR_encoding)");

my $db;
my $username;
my $password;
my $list;
my $force;
my $result = GetOptions("db=s" => \$db,
			"username=s" => \$username,
			"password=s" => \$password,
			"l|list" => \$list,
			"force" => \$force);

if ($^O =~ /win/i) {
    @ARGV = map { bsd_glob($_, GLOB_NOCASE) } @ARGV;
}

decode_argv;

unless ($result && $db && ($list || @ARGV)) {
    print "VERWENDUNG: $0 {--db=...} [--username=...] [--password=...]\n" .
	  "\t[--list] [--force] {id} ...\n";
    exit $result ? 0 : 1;
}

my $dbh = DBI->connect("DBI:$db", $username, $password,
		       { RaiseError => 1, AutoCommit => 1, db_utf8($db) })
    or die "Could not connect to database: $DBI::errstr\n";

my $status = 0;

use Encode qw(is_utf8);

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
		my $cfg = cfg_aus_datenbank($dbh, $id);
		my ($cfg_fh, $cfg_name) = tempfile("$dateiname-XXXXXX",
						   SUFFIX => ".cfg",
						   UNLINK => 1);
		cfg_datei_schreiben $cfg_fh, $cfg;

		print "$dateiname.dat\n";
		my $fahrer_nach_startnummer = fahrer_aus_datenbank($dbh, $id);
		my ($dat_fh, $dat_name) = tempfile("$dateiname-XXXXXX",
						   SUFFIX => ".dat",
						   UNLINK => 1);
		dat_datei_schreiben $dat_fh, $fahrer_nach_startnummer;

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
