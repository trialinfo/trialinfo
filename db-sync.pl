#! /usr/bin/perl -w

# Trialtool: Daten in eine SQL-Datenbank kopieren und/oder synchron halten

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
# * Alle SQL-Statements tracen
# * Logfile

use DBI;
use Trialtool;
use Wertungen;
use Getopt::Long;
use File::Glob ':glob';
use File::Basename;
use File::stat;
use POSIX qw(strftime);
use Encode qw(encode);
use Encode::Locale qw(decode_argv);
use DBH_Logger;
use strict;

binmode(STDIN, ":encoding(console_in)");
binmode(STDERR, ":encoding(console_out)");
if (-t STDOUT) {
    binmode(STDOUT, ":encoding(console_out)");
} else {
   binmode(STDOUT, ":encoding(UTF-8)");
}

my $trace_sql;

my @tables;  # Liste der Tabellen in der Datenbank

my @create_veranstaltung_tables = split /;/, q{
DROP TABLE IF EXISTS fahrer;
CREATE TABLE fahrer (
  id INT, -- veranstaltung
  startnummer INT,
  klasse INT NOT NULL,
  nachname VARCHAR(30),
  vorname VARCHAR(30),
  strasse VARCHAR(30),
  wohnort VARCHAR(40),
  plz VARCHAR(5),
  club VARCHAR(40),
  fahrzeug VARCHAR(30),
  geburtsdatum DATE,
  telefon VARCHAR(20),
  lizenznummer VARCHAR(20),
  rahmennummer VARCHAR(20),
  kennzeichen VARCHAR(15),
  hubraum VARCHAR(10),
  bemerkung VARCHAR(150),
  land VARCHAR(33),
  startzeit TIME,
  zielzeit TIME,
  stechen INT,
  nennungseingang BOOLEAN,
  papierabnahme BOOLEAN,
  runden INT,
  s0 INT,
  s1 INT,
  s2 INT,
  s3 INT,
  ausfall INT,
  zusatzpunkte INT,
  punkte INT,
  rang INT,
  PRIMARY KEY (id, startnummer)
);

DROP TABLE IF EXISTS fahrer_wertung;
CREATE TABLE fahrer_wertung (
  id INT, -- veranstaltung
  startnummer INT,
  wertung INT,
  wertungspunkte INT NOT NULL,
  PRIMARY KEY (id, startnummer, wertung)
);

DROP TABLE IF EXISTS klasse;
CREATE TABLE klasse (
  id INT, -- veranstaltung
  klasse INT,
  runden INT,
  bezeichnung VARCHAR(60),
  gestartet BOOLEAN,
  PRIMARY KEY (id, klasse)
);

DROP TABLE IF EXISTS punkte;
CREATE TABLE punkte (
  id INT, -- veranstaltung
  startnummer INT,
  runde INT,
  sektion INT,
  punkte INT NOT NULL,
  PRIMARY KEY (id, startnummer, runde, sektion)
);

DROP TABLE IF EXISTS runde;
CREATE TABLE runde (
  id INT, -- veranstaltung
  startnummer INT,
  runde INT,
  punkte INT NOT NULL,
  PRIMARY KEY (id, startnummer, runde)
);

DROP TABLE IF EXISTS sektion;
CREATE TABLE sektion (
  id INT, -- veranstaltung
  klasse INT,
  sektion INT,
  PRIMARY KEY (id, klasse, sektion)
);

DROP TABLE IF EXISTS veranstaltung;
CREATE TABLE veranstaltung (
  id INT, -- veranstaltung
  datum DATE,
  dat_mtime TIMESTAMP NULL,
  cfg_mtime TIMESTAMP NULL,
  dateiname VARCHAR(128),
  PRIMARY KEY (id)
);

DROP TABLE IF EXISTS wertung;
CREATE TABLE wertung (
  id INT, -- veranstaltung
  wertung INT,
  titel VARCHAR(70),
  subtitel VARCHAR(70),
  bezeichnung VARCHAR(20),
  PRIMARY KEY (id, wertung)
);

DROP TABLE IF EXISTS wertungspunkte;
CREATE TABLE wertungspunkte (
  id INT, -- veranstaltung
  rang INT,
  punkte INT NOT NULL,
  PRIMARY KEY (id, rang)
);

-- Geänderte Startnummern in der Jahreswertung
DROP TABLE IF EXISTS neue_startnummer;
CREATE TABLE neue_startnummer (
  id INT, -- veranstaltung
  startnummer INT,
  neue_startnummer INT,
  PRIMARY KEY (id, startnummer, neue_startnummer)
);

DROP TABLE IF EXISTS vareihe_veranstaltung;
CREATE TABLE vareihe_veranstaltung (
  vareihe INT,
  id INT, -- veranstaltung
  PRIMARY KEY (vareihe, id)
);
};

my @create_reihen_tables = split /;/, q{
DROP TABLE IF EXISTS vareihe;
-- Veranstaltungsreihe
CREATE TABLE vareihe (
  vareihe INT,
  PRIMARY KEY (vareihe)
);

-- Wertungsreihe
DROP TABLE IF EXISTS wereihe;
CREATE TABLE wereihe (
  wereihe INT,
  vareihe INT NOT NULL,
  wertung INT NOT NULL, -- Wertung im Trialtool
  bezeichnung VARCHAR(40),
  style VARCHAR(10),
  PRIMARY KEY (wereihe)
);

DROP TABLE IF EXISTS wereihe_klasse;
CREATE TABLE wereihe_klasse (
  wereihe INT,
  klasse INT,
  streichresultate INT,
  PRIMARY KEY (wereihe, klasse)
);

INSERT INTO vareihe (vareihe)
VALUES (1);

INSERT INTO wereihe (wereihe, vareihe, bezeichnung, wertung)
    VALUES (1, 1, "ÖTSV Cup 2012", 1);
INSERT INTO wereihe_klasse (wereihe, klasse, streichresultate)
    VALUES (1, 1, 0);
INSERT INTO wereihe_klasse (wereihe, klasse, streichresultate)
    VALUES (1, 2, 0);
INSERT INTO wereihe_klasse (wereihe, klasse, streichresultate)
    VALUES (1, 3, 0);
INSERT INTO wereihe_klasse (wereihe, klasse, streichresultate)
    VALUES (1, 4, 0);
INSERT INTO wereihe_klasse (wereihe, klasse, streichresultate)
    VALUES (1, 5, 0);
INSERT INTO wereihe_klasse (wereihe, klasse, streichresultate)
    VALUES (1, 6, 0);
INSERT INTO wereihe_klasse (wereihe, klasse, streichresultate)
    VALUES (1, 7, 0);

INSERT INTO wereihe (wereihe, vareihe, bezeichnung, wertung, style)
    VALUES (2, 1, "OSK Staatsmeisterschaft 2012", 1, "osk");
INSERT INTO wereihe_klasse (wereihe, klasse, streichresultate)
    VALUES (2, 11, 0);
INSERT INTO wereihe_klasse (wereihe, klasse, streichresultate)
    VALUES (2, 12, 0);
INSERT INTO wereihe_klasse (wereihe, klasse, streichresultate)
    VALUES (2, 13, 0);
};

sub sql_ausfuehren($@) {
    my ($dbh, @sql) = @_;

    foreach my $statement (@sql) {
	next if $statement =~ /^\s*$/;
	$dbh->do($statement);
    }
}

sub veranstaltung_loeschen($$$) {
    my ($dbh, $id, $auch_in_veranstaltung) = @_;

    foreach my $table (@tables) {
	next if ($table eq "veranstaltung" || $table eq "vareihe_veranstaltung") &&
		!$auch_in_veranstaltung;
	$dbh->do("DELETE FROM $table WHERE id = ?", undef, $id);
    }
}

sub in_datenbank_schreiben($$$$$$$$) {
    my ($dbh, $id, $basename, $cfg_mtime, $dat_mtime, $fahrer_nach_startnummer,
	$cfg, $vareihe) = @_;
    my $sth;
    my $datum;

    $datum = $1
	if $basename =~ /^(\d{4}-\d{2}-\d{2}) /;

    unless ($id) {
	$sth = $dbh->prepare(qq{
	    SELECT MAX(id) + 1
	    FROM veranstaltung
	});
	$sth->execute;
	$id = $sth->fetchrow_array || 1;
    }
    $sth = $dbh->prepare(qq{
	INSERT INTO veranstaltung (id, datum, dateiname, cfg_mtime, dat_mtime)
	VALUES (?, ?, ?, ?, ?)
    });
    $sth->execute($id, $datum, $basename, $cfg_mtime, $dat_mtime);

    $sth = $dbh->prepare(qq{
	INSERT INTO vareihe_veranstaltung(vareihe, id)
	VALUES (?, ?)
    });
    foreach my $vareihe (@$vareihe) {
	$sth->execute($vareihe, $id);
    }

    $sth = $dbh->prepare(qq{
	INSERT INTO wertung (id, wertung, titel, subtitel,
			     bezeichnung)
	VALUES (?, ?, ?, ?, ?)
    });
    for (my $n = 0; $n < @{$cfg->{titel}}; $n++) {
	next if $cfg->{titel}[$n] eq "" && $cfg->{subtitel}[$n] eq "";
	$sth->execute($id, $n + 1, $cfg->{titel}[$n], $cfg->{subtitel}[$n],
		      $cfg->{wertungen}[$n]);
    }
    $sth = $dbh->prepare(qq{
	INSERT INTO wertungspunkte (id, rang, punkte)
	VALUES (?, ?, ?)
    });
    for (my $n = 0; $n < @{$cfg->{wertungspunkte}}; $n++) {
	next unless $cfg->{wertungspunkte}[$n] != 0;
	$sth->execute($id, $n + 1, $cfg->{wertungspunkte}[$n]);
    }
    $sth = $dbh->prepare(qq{
	INSERT INTO sektion (id, klasse, sektion)
	VALUES (?, ?, ?)
    });
    for (my $m = 0; $m < @{$cfg->{sektionen}}; $m++) {
	for (my $n = 0; $n < length $cfg->{sektionen}[$m]; $n++) {
	    next if substr($cfg->{sektionen}[$m], $n, 1) eq "N";
	    $sth->execute($id, $m + 1, $n + 1);
	}
    }
    $sth = $dbh->prepare(qq{
	INSERT INTO klasse (id, klasse, runden, bezeichnung, gestartet)
	VALUES (?, ?, ?, ?, ?)
    });
    my $gestartete_klassen = gestartete_klassen($cfg);
    for (my $n = 0; $n < @{$cfg->{klassen}}; $n++) {
	next if $cfg->{klassen}[$n] eq "";
	$sth->execute($id, $n + 1, $cfg->{runden}[$n], $cfg->{klassen}[$n],
		      $gestartete_klassen->[$n]);
    }

    my @felder = qw(
	startnummer klasse nachname vorname strasse wohnort plz club fahrzeug
	telefon lizenznummer rahmennummer kennzeichen hubraum bemerkung land
	startzeit zielzeit stechen nennungseingang papierabnahme runden ausfall
	zusatzpunkte punkte rang geburtsdatum s0 s1 s2 s3
    );
    $sth = $dbh->prepare(sprintf qq{
	INSERT INTO fahrer (id, %s)
	VALUES (?, %s)
    }, join(", ", @felder), join(", ", map { "?" } @felder));
    my $sth2 = $dbh->prepare(qq{
	INSERT INTO punkte (id, startnummer, runde, sektion,
				  punkte)
	VALUES (?, ?, ?, ?, ?)
    });
    my $sth3 = $dbh->prepare(qq{
	INSERT INTO runde (id, startnummer, runde, punkte)
	VALUES (?, ?, ?, ?)
    });
    my $sth4 = $dbh->prepare(qq{
	INSERT INTO fahrer_wertung (id, startnummer, wertung, wertungspunkte)
	VALUES (?, ?, ?, ?)
    });
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	$sth->execute($id, (map { $fahrer->{$_} } @felder));

	for (my $m = 0; $m < @{$fahrer->{punkte_pro_sektion}}; $m++) {
	    my $punkte = $fahrer->{punkte_pro_sektion}[$m];
	    for (my $n = 0; $n < @$punkte; $n++) {
		next if $punkte->[$n] == 6;
		$sth2->execute($id, $fahrer->{startnummer}, $m + 1, $n + 1,
			       $punkte->[$n]);
	    }
	    if ($m < $fahrer->{runden}) {
		$sth3->execute($id, $fahrer->{startnummer}, $m + 1,
			       $fahrer->{punkte_pro_runde}[$m]);
	   }
	}
	for (my $n = 0; $n < @{$fahrer->{wertungen}}; $n++) {
	    next unless exists $fahrer->{wertungspunkte}[$n];
	    $sth4->execute($id, $fahrer->{startnummer}, $n + 1,
			   $fahrer->{wertungspunkte}[$n] || 0);
	}
	if (exists $fahrer->{neue_startnummer}) {
	    $dbh->do(qq{
		INSERT INTO neue_startnummer (id, startnummer, neue_startnummer)
		VALUES (?, ?, ?)
	}, undef, $id, $fahrer->{startnummer}, $fahrer->{neue_startnummer});
	}
    }
    return $id;
}

sub tabelle_kopieren ($$$$$) {
    my ($tabelle, $von_dbh, $nach_dbh, $id, $ersetzen) = @_;
    my ($von_sth, $nach_sth);
    my ($filter, @filter) = ("", ());
    my @zeile;

    if (defined $id) {
	$filter = "WHERE id = ?";
	@filter = ( $id );
    }

    if ($ersetzen) {
	$nach_sth = $nach_dbh->do(qq{
	    DELETE FROM $tabelle $filter
	}, undef, @filter);
    }
    $von_sth = $von_dbh->prepare(qq{
	SELECT * from $tabelle $filter
    });
    $von_sth->execute(@filter);
    if (@zeile = $von_sth->fetchrow_array) {
	my @spaltennamen = @{$von_sth->{NAME_lc}};
	$nach_sth = $nach_dbh->prepare(
	    "INSERT INTO $tabelle (" . join(", ", @spaltennamen) . ") " .
	    "VALUES (" . join(", ", map { "?" } @spaltennamen) . ")"
	);
	for (;;) {
	    $nach_sth->execute(@zeile);
	    @zeile = $von_sth->fetchrow_array
		or last;
	}
    }
}

sub veranstaltung_kopieren($$$) {
    my ($von_dbh, $nach_dbh, $id) = @_;

    foreach my $table (@tables) {
	next if $table eq "veranstaltung" || $table eq "vareihe_veranstaltung";
	tabelle_kopieren $table, $von_dbh, $nach_dbh, $id, 0;
    }
}

sub mtime($) {
    my ($dateiname) = @_;

    my $stat = stat("$dateiname")
	or die "$dateiname: $!\n";
    return strftime("%Y-%m-%d %H:%M:%S", localtime($stat->mtime));
}

sub status($$) {
    my ($dbh, $dateiname) = @_;
    my $basename = basename($dateiname);
    my $sth;
    my @row;

    my $cfg_mtime = mtime("$dateiname.cfg");
    my $dat_mtime = mtime("$dateiname.dat");

    $sth = $dbh->prepare(qq{
	SELECT id, (cfg_mtime != ? OR dat_mtime != ?)
	FROM veranstaltung
	WHERE dateiname = ?
    });
    $sth->execute($cfg_mtime, $dat_mtime, $basename);
    unless (@row = $sth->fetchrow_array) {
	@row = (undef, 1);
    }
    return (@row, $basename, $cfg_mtime, $dat_mtime);
}

sub tabelle_aktualisieren($$$$$) {
    my ($table, $tmp_dbh, $dbh, $id, $tmp_id) = @_;
    my ($sth, $sth2);

    my @keys = $tmp_dbh->primary_key(undef, undef, $table);
    die unless map { $_ eq "id" } @keys;
    my @other_keys = grep { $_ ne "id" } @keys;
    my $other_keys = join ", ", @other_keys;
    my $old_other_keys = join(",", map { "old.$_" } @other_keys);

    my %keys = map { $_ => 1 } @keys;
    my @nonkeys;
    my $tmp_sth = $tmp_dbh->column_info(undef, undef, $table, undef);
    while (my @row = $tmp_sth->fetchrow_array) {
	push @nonkeys, $row[3]
	    unless exists $keys{$row[3]};
    }

    unless (@other_keys) {
	$sth = $tmp_dbh->prepare(qq{
	    SELECT new.id
	    FROM (
		SELECT 1 AS _
		FROM $table
		WHERE id = ?
	    ) AS old LEFT JOIN (
		SELECT id, 1 AS _
		FROM $table
		WHERE id = ?
	    ) AS new USING (_)
	    WHERE new._ IS NULL
	});
    } else {
	$sth = $tmp_dbh->prepare(qq{
	    SELECT $old_other_keys
	    FROM (
		SELECT $other_keys, 1 AS _
		FROM $table
		WHERE id = ?
	    ) AS old LEFT JOIN (
		SELECT id, $other_keys, 1 AS _
		FROM $table
		WHERE id = ?
	    ) AS new USING ($other_keys)
	    WHERE new._ IS NULL
	    });
    }
    $sth->execute($tmp_id, $id);
    $sth2 = undef;
    while (my @row = $sth->fetchrow_array) {
	unless ($sth2) {
	    $sth2 = $dbh->prepare(
		"DELETE FROM $table WHERE " .
		join(" AND ", map { "$_ = ?" } (@other_keys, "id"))
	    );
	}
	$sth2->execute(@row, $id);
    }

    unless (@other_keys) {
	$sth = $tmp_dbh->prepare(qq{
	    SELECT new.*
	    FROM (
		SELECT *, 1 AS _
		FROM $table
		WHERE id = ?
	    ) AS new LEFT JOIN (
		SELECT 1 AS _
		FROM $table
		WHERE id = ?
	    ) AS old USING (_)
	    WHERE old._ IS NULL
	    });
    } else {
	$sth = $tmp_dbh->prepare(qq{
	    SELECT new.*
	    FROM (
		SELECT *, 1 AS _
		FROM $table
		WHERE id = ?
	    ) AS new LEFT JOIN (
		SELECT $other_keys, 1 AS _
		FROM $table
		WHERE id = ?
	    ) AS old USING (_, $other_keys)
	    WHERE old._ IS NULL
	    });
    }
    $sth->execute($id, $tmp_id);
    $sth2 = undef;
    while (my @row = $sth->fetchrow_array) {
	unless ($sth2) {
	    my @spaltennamen = @{$sth->{NAME_lc}};
	    pop @spaltennamen;
	    $sth2 = $dbh->prepare(
		"INSERT INTO $table (" . join(", ", @spaltennamen) . ") " .
		"VALUES (" . join(", ", map { "?" } @spaltennamen) . ")"
	    );
	}
	pop @row;
	$sth2->execute(@row);
    }

    if (@nonkeys) {
	my $nonkeys = join(", ", @nonkeys);
	my $old_nonkeys = join(", ", map { "old.$_" } @nonkeys);
	my $new_nonkeys = join(", ", map { "new.$_" } @nonkeys);
	my $all_nonkeys_equal = join(" AND ",
	    map { "(old.$_ COLLATE BINARY IS new.$_ COLLATE BINARY)" } @nonkeys);
	unless (@other_keys) {
	    $sth = $tmp_dbh->prepare(qq{
		SELECT $new_nonkeys
		FROM (
		    SELECT $nonkeys
		    FROM $table
		    WHERE id = ?
		) AS old JOIN (
		    SELECT $nonkeys
		    FROM $table
		    WHERE id = ?
		) AS new
		WHERE NOT ($all_nonkeys_equal)
	    });
	} else {
	    $sth = $tmp_dbh->prepare(qq{
		SELECT $new_nonkeys, $old_other_keys
		FROM (
		    SELECT $other_keys, $nonkeys
		    FROM $table
		    WHERE id = ?
		) AS old JOIN (
		    SELECT $other_keys, $nonkeys
		    FROM $table
		    WHERE id = ?
		) AS new USING ($other_keys)
		WHERE NOT ($all_nonkeys_equal)
	    });
	}
	$sth->execute($tmp_id, $id);
	$sth2 = undef;
	while (my @row = $sth->fetchrow_array) {
	    unless ($sth2) {
		$sth2 = $dbh->prepare(
		    "UPDATE $table " .
		    "SET " . join(", ", map { "$_ = ?" } @nonkeys) . " " .
		    "WHERE " .  join(" AND ",
				     map { "$_ = ?" } (@other_keys, "id"))
		);
	    }

	    $sth2->execute(@row, $id);
	}
    }
}

sub tabellen_aktualisieren {
    my ($tmp_dbh, $dbh, $id, $tmp_id) = @_;

    foreach my $table (@tables) {
	tabelle_aktualisieren $table, $tmp_dbh, $dbh, $id, $tmp_id;
    }
}

sub veranstaltung_umnummerieren($$) {
    my ($dbh, $id) = @_;
    my $sth;

    $sth = $dbh->prepare(qq{
	SELECT MAX(id) + 1
	FROM veranstaltung
    });
    $sth->execute;
    my $tmp_id = $sth->fetchrow_array || 1;
    foreach my $table (@tables) {
	$dbh->do(qq{
	    UPDATE $table
	    SET id = ?
	    WHERE id = ?
	}, undef, $tmp_id, $id);
    }
    return $tmp_id;
}

my $db;
my $username;
my $password;
my $create_tables;
my $temp_db = ':memory:';
my $poll_interval;  # Sekunden
my $reconnect_interval;  # Sekunden
my $force;
my $vareihe;
my $delete;
my $result = GetOptions("db=s" => \$db,
			"username=s" => \$username,
			"password=s" => \$password,
			"create-tables" => \$create_tables,
			"poll:i" => \$poll_interval,
			"reconnect:i" => \$reconnect_interval,
			"force" => \$force,
			"trace-sql" => \$trace_sql,
			"temp-db=s" => \$temp_db,
			"vareihe=s" => \@$vareihe,
			"delete" => \$delete);

$vareihe = [ map { split /,/, $_ } @$vareihe ];
$vareihe = [ 1 ]
    unless @$vareihe;

if ($^O =~ /win/i) {
    @ARGV = map { bsd_glob($_, GLOB_NOCASE) } @ARGV;
}

decode_argv;

unless ($result && $db && ($create_tables || @ARGV)) {
    print "VERWENDUNG: $0 {--db=...} [--username=...] [--password=...]\n" .
	  "\t[--create-tables] [--poll=N] [--reconnect=N] [--force]\n" .
	  "\t[--trace-sql] [--vareihe=N] {datei|verzeichnis} ...\n";
    exit $result ? 0 : 1;
}
if (defined $poll_interval && $poll_interval == 0) {
    $poll_interval = 30;
}
if (defined $reconnect_interval && $reconnect_interval == 0) {
    $reconnect_interval = $poll_interval;
}

my $erster_sync = $force;

do {
    eval {
	# 'DBI:mysql:databasename;host=db.example.com;mysql_enable_utf8=1'
	my $dbh = DBI->connect("DBI:$db", $username, $password,
			       { RaiseError => 1, AutoCommit => 1 })
	    or die "Could not connect to database: $DBI::errstr\n";
	$dbh = new DBH_Logger($dbh)
	    if $trace_sql;

	print "Connected to $db ...\n";
	if ($create_tables) {
	    sql_ausfuehren $dbh, @create_veranstaltung_tables;
	    sql_ausfuehren $dbh, @create_reihen_tables;
	}

	if (@ARGV) {
	    my $tmp_dbh = DBI->connect("DBI:SQLite:dbname=$temp_db",
				       { RaiseError => 1, AutoCommit => 1 })
		or die "Could not create in-memory database: $DBI::errstr\n";
	    $tmp_dbh->{unicode} = 1;
	    #$tmp_dbh = new DBH_Logger($tmp_dbh)
	    #	if $trace_sql;
	    sql_ausfuehren $tmp_dbh, @create_veranstaltung_tables;
	    my $sth = $tmp_dbh->table_info(undef, undef, undef, "TABLE");
	    while (my @row = $sth->fetchrow_array) {
		push @tables, $row[2];
	    }
	    tabelle_kopieren "veranstaltung", $dbh, $tmp_dbh, undef, 0;
	    tabelle_kopieren "vareihe_veranstaltung", $dbh, $tmp_dbh, undef, 0;
	    my $erster_check = 1;
	    while ($erster_check || $erster_sync || $poll_interval) {
		foreach my $dateiname (trialtool_dateien @ARGV) {
		    my ($id, $veraendert, $basename, $cfg_mtime, $dat_mtime) =
			status($tmp_dbh, $dateiname);

		    if ($delete) {
			if ($id) {
			    veranstaltung_loeschen $dbh, $id, 1;
			}
			next;
		    }

		    $veraendert ||= $force;

		    veranstaltung_kopieren $dbh, $tmp_dbh, $id
			if defined $id && $erster_check &&
			   ($veraendert || $poll_interval) && !$erster_sync;

		    if ($erster_sync || $veraendert) {
			my $cfg = cfg_datei_parsen("$dateiname.cfg");
			my $fahrer_nach_startnummer = dat_datei_parsen("$dateiname.dat");
			rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;
			$tmp_dbh->begin_work;
			my $tmp_id;
			$tmp_id = veranstaltung_umnummerieren $tmp_dbh, $id
			    if defined $id;
			$id = in_datenbank_schreiben $tmp_dbh, $id, $basename,
						     $cfg_mtime, $dat_mtime,
						     $fahrer_nach_startnummer,
						     $cfg, $vareihe;
			$tmp_dbh->commit;

			$dbh->begin_work;
			veranstaltung_loeschen $dbh, $id, 0
			    if $erster_sync;
			tabellen_aktualisieren $tmp_dbh, $dbh, $id,
			    defined $tmp_id ? $tmp_id : $id + 1;
			$dbh->commit;

			$tmp_dbh->begin_work;
			veranstaltung_loeschen $tmp_dbh, $tmp_id, 1
			    if defined $tmp_id;
			$tmp_dbh->commit;
		    }
		}

		$erster_sync = undef;
		$erster_check = undef;
		exit
		    if $delete;
		sleep $poll_interval
		    if defined $poll_interval;
	    }
	}
    };
    if ($@) {
	warn $@;
    }
    if ($reconnect_interval) {
	print "Waiting for $reconnect_interval seconds...\n";
	sleep $reconnect_interval;
	print "\n";
    }
} while ($reconnect_interval);

<<EOF

In Postgresql liefert dieses Statement die Jahreswertung.  Mysql kann die
Subquery, die die Streichpunkte ausrechnet, leider nicht.

SELECT
    serie, klasse, startnummer, streichpunkte, gesamtpunkte,
    rank() OVER (PARTITION BY klasse ORDER BY gesamtpunkte DESC) AS rang
FROM
    (
    SELECT
	serie, klasse, startnummer, streichpunkte,
	punkte - streichpunkte AS gesamtpunkte
    FROM
	(
	SELECT
	    serie, klasse, startnummer,
	    (
	    SELECT COALESCE(SUM(wertungspunkte), 0)
	    FROM
		(
		SELECT wertungspunkte
		FROM fahrer_wertung as _
		JOIN fahrer
		    USING (id, startnummer)
		WHERE
		    startnummer = fahrer_wertung.startnummer AND
		    klasse = fahrer.klasse AND
		    wertung = veranstaltungsreihe.wertung
		ORDER BY
		    wertungspunkte
		LIMIT veranstaltungsreihe.streichresultate
		) AS _
	    ) AS streichpunkte,
	    SUM(wertungspunkte) AS punkte
	FROM
	    veranstaltungsreihe
	JOIN
	    veranstaltungsreihe_veranstaltung
	    USING (serie)
	JOIN
	    fahrer_wertung
	    USING (id, wertung)
	JOIN
	    fahrer
	    USING (id, startnummer)
	GROUP BY serie, klasse, startnummer
	) AS _
    ) AS _
WHERE
    gesamtpunkte > 0;

EOF
