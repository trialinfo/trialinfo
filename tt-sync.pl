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
# * UTF-8-Codierung im Dateinamen in der Datenbank ist kaputt
# * Logfile?
# * Web-Auswertung: PHP?
# * Zieldatenbank, user, kennwort konfigurierbar
# * Wenn Verbindung zu Zieldatenbank abbricht, wieder aufbauen
# * Zusatzpunkte?
# * Filename globbing on Windows
# * Only store filename without directories in veranstaltung; \ vs. /

use open IO => ":locale";
use DBI;
use Trialtool;
use Getopt::Long;
use Scalar::Util qw(looks_like_number);
use File::stat;
use POSIX qw(strftime);
use strict;

sub traced_sql_value($) {
    my ($_) = @_;

    return "NULL"
	unless defined $_;
    return $_
	if looks_like_number $_;
    s/'/''/g;
    return "'$_'";
}

my $trace_sql;
my $traced_sql_statement;
sub trace_sql_statement($) {
    $traced_sql_statement = shift;
    return $traced_sql_statement;
}

sub trace_sql_values(@) {
    if ($trace_sql) {
	my $_ = $traced_sql_statement;
	s/\?/traced_sql_value shift @_/ge;
	print "    $_\n";
    }
}

my @tables;  # Liste der Tabellen in der Datenbank

my @create_table_statements = split /;/, q{
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
  punkte INT,
  wertungspunkte INT,
  rang INT,
  PRIMARY KEY (id, startnummer)
);

DROP TABLE IF EXISTS fahrer_wertung;
CREATE TABLE fahrer_wertung (
  id INT, -- veranstaltung
  startnummer INT,
  wertung INT,
  PRIMARY KEY (id, startnummer, wertung)
);

DROP TABLE IF EXISTS klasse;
CREATE TABLE klasse (
  id INT, -- veranstaltung
  nummer INT,
  bezeichnung VARCHAR(60),
  jahreswertung BOOLEAN,
  PRIMARY KEY (id, nummer)
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
  dat_mtime DATETIME,
  cfg_mtime DATETIME,
  cfg_name VARCHAR(128),
  dat_name VARCHAR(128),
  PRIMARY KEY (id)
);

DROP TABLE IF EXISTS wertung;
CREATE TABLE wertung (
  id INT, -- veranstaltung
  nummer INT,
  titel VARCHAR(70),
  subtitel VARCHAR(70),
  bezeichnung VARCHAR(20),
  PRIMARY KEY (id, nummer)
);

DROP TABLE IF EXISTS wertungspunkte;
CREATE TABLE wertungspunkte (
  id INT, -- veranstaltung
  rang INT,
  punkte INT NOT NULL,
  PRIMARY KEY (id, rang)
);
};

sub tabellen_erzeugen($) {
    my ($dbh) = @_;

    foreach my $statement (@create_table_statements) {
	next if $statement =~ /^\s*$/;
	$dbh->do($statement);
    }
}

sub veranstaltung_loeschen($$) {
    my ($dbh, $id) = @_;

    foreach my $table (@tables) {
	$dbh->do("DELETE FROM $table WHERE id = ?", undef, $id);
    }
}

sub mtime($) {
    my ($dateiname) = @_;

    my $stat = stat("$dateiname")
	or die "$dateiname: $!\n";
    return strftime("%Y-%m-%d %H:%M:%S", localtime($stat->mtime));
}

sub veranstaltung_aktualisieren($$$$) {
    my ($dbh, $id, $cfg_mtime, $dat_mtime) = @_;

    my $sth = $dbh->prepare(qq{
	UPDATE veranstaltung
	SET cfg_mtime = ?, dat_mtime = ?
	WHERE id = ?
    });
    $sth->execute($cfg_mtime, $dat_mtime, $id);
}

sub in_datenbank_schreiben($$$$$$$$) {
    my ($dbh, $id, $cfg_name, $cfg_mtime, $dat_name, $dat_mtime,
	$fahrer_nach_startnummer, $cfg) = @_;
    my $sth;

    if ($id) {
	veranstaltung_aktualisieren $dbh, $id, $cfg_mtime, $dat_mtime;
    } else {
	$sth = $dbh->prepare(qq{
	    SELECT MAX(id) + 1
	    FROM veranstaltung
	});
	$sth->execute;
	$id = $sth->fetchrow_array || 1;
	$sth = $dbh->prepare(qq{
	    INSERT INTO veranstaltung (id, cfg_name, cfg_mtime,
				       dat_name, dat_mtime)
	    VALUES (?, ?, ?, ?, ?)
	});
	$sth->execute($id, $cfg_name, $cfg_mtime, $dat_name, $dat_mtime);
    }

    $sth = $dbh->prepare(qq{
	INSERT INTO wertung (id, nummer, titel, subtitel,
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
	INSERT INTO klasse (id, nummer, bezeichnung)
	VALUES (?, ?, ?)
    });
    for (my $n = 0; $n < @{$cfg->{klassen}}; $n++) {
	next if $cfg->{klassen}[$n] eq "";
	$sth->execute($id, $n + 1, $cfg->{klassen}[$n]);
    }

    my @felder = qw(
	startnummer klasse nachname vorname strasse wohnort plz club fahrzeug
	telefon lizenznummer rahmennummer kennzeichen hubraum bemerkung land
	startzeit zielzeit stechen nennungseingang papierabnahme runden ausfall
	punkte wertungspunkte rang
    );
    $sth = $dbh->prepare(sprintf qq{
	INSERT INTO fahrer (id, %s, geburtsdatum, s0, s1, s2, s3)
	VALUES (?, %s, ?, ?, ?, ?, ?)
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
	INSERT INTO fahrer_wertung (id, startnummer, wertung)
	VALUES (?, ?, ?)
    });
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	my $geburtsdatum;
	$geburtsdatum = "$3-$2-$1"
	    if (exists $fahrer->{geburtsdatum} &&
		$fahrer->{geburtsdatum} =~ /^(\d\d)\.(\d\d)\.(\d\d\d\d)$/);
	$sth->execute($id, (map { $fahrer->{$_} } @felder), $geburtsdatum,
		      $fahrer->{os_1s_2s_3s}[0], $fahrer->{os_1s_2s_3s}[1],
		      $fahrer->{os_1s_2s_3s}[2], $fahrer->{os_1s_2s_3s}[3]);

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
	    next unless $fahrer->{wertungen}[$n];
	    $sth4->execute($id, $fahrer->{startnummer}, $n + 1);
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

sub status($$$) {
    my ($dbh, $cfg_name, $dat_name) = @_;
    my $sth;

    my $cfg_mtime = mtime($cfg_name);
    my $dat_mtime = mtime($dat_name);

    $sth = $dbh->prepare(qq{
	SELECT id, cfg_mtime, dat_mtime
	FROM veranstaltung
	WHERE cfg_name = ? AND dat_name = ?
    });
    $sth->execute($cfg_name, $dat_name);
    if (my @row = $sth->fetchrow_array) {
	return ($row[0], $row[1] ne $cfg_mtime ||
			 $row[2] ne $dat_mtime);
    }
    return (undef, 1);
}

sub tabelle_aktualisieren($$$$$) {
    my ($table, $tmp_dbh, $dbh, $id, $old_id) = @_;
    my ($sth, $sth2);

    my @keys = $tmp_dbh->primary_key(undef, undef, $table);
    die unless map { $_ eq "id" } @keys;
    my @other_keys = grep { $_ ne "id" } @keys;
    die unless @other_keys;
    my $other_keys = join ", ", @other_keys;
    my $old_other_keys = join(",", map { "old.$_" } @other_keys);

    my %keys = map { $_ => 1 } @keys;
    my @nonkeys;
    my $tmp_sth = $tmp_dbh->column_info(undef, undef, $table, undef);
    while (my @row = $tmp_sth->fetchrow_array) {
	push @nonkeys, $row[3]
	    unless exists $keys{$row[3]};
    }

    $sth = $tmp_dbh->prepare(qq{
	SELECT $old_other_keys
	FROM (
	    SELECT $other_keys
	    FROM $table
	    WHERE id = ?
	) AS old LEFT JOIN (
	    SELECT $other_keys
	    FROM $table
	    WHERE id = ?
	) AS new USING ($other_keys)
	WHERE new.$other_keys[0] IS NULL
	});
    $sth->execute($old_id, $id);
    $sth2 = undef;
    while (my @row = $sth->fetchrow_array) {
	unless ($sth2) {
	    $sth2 = $dbh->prepare(trace_sql_statement(
		"DELETE FROM $table " .
		"WHERE id = ? AND " .
		       join(" AND ", map { "$_ = ?" } @other_keys)
	    ));
	}
	trace_sql_values ($id, @row);
	$sth2->execute($id, @row);
    }

    $sth = $tmp_dbh->prepare(qq{
	SELECT new.*
	FROM (
	    SELECT *
	    FROM $table
	    WHERE id = ?
	) AS new LEFT JOIN (
	    SELECT $other_keys
	    FROM $table
	    WHERE id = ?
	) AS old USING ($other_keys)
	WHERE old.$other_keys[0] IS NULL
	});
    $sth->execute($id, $old_id);
    $sth2 = undef;
    while (my @row = $sth->fetchrow_array) {
	unless ($sth2) {
	    my @spaltennamen = @{$sth->{NAME_lc}};
	    $sth2 = $dbh->prepare(trace_sql_statement(
		"INSERT INTO $table (" . join(", ", @spaltennamen) . ") " . 
		"VALUES (" . join(", ", map { "?" } @spaltennamen) . ")"
	    ));
	}
	trace_sql_values (@row);
	$sth2->execute(@row);
    }

    if (@nonkeys) {
	my $nonkeys = join(", ", @nonkeys);
	my $old_nonkeys = join(", ", map { "old.$_" } @nonkeys);
	my $new_nonkeys = join(", ", map { "new.$_" } @nonkeys);
	my $all_nonkeys_equal = join(" AND ",
	    map { "((old.$_ COLLATE BINARY = new.$_ COLLATE BINARY) OR
		    (old.$_ IS NULL AND new.$_ IS NULL))" } @nonkeys);
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
	$sth->execute($old_id, $id);
	$sth2 = undef;
	while (my @row = $sth->fetchrow_array) {
	    unless ($sth2) {
		my $nonkeys = join(", ", map { "$_ = ?" } @nonkeys);
		my $other_keys = join(" AND ", map { "$_ = ?" } @other_keys);
		$sth2 = $dbh->prepare(trace_sql_statement(
		    "UPDATE $table " .
		    "SET $nonkeys " .
		    "WHERE $other_keys AND id = ?"
		));
	    }
	    trace_sql_values (@row, $id);
	    $sth2->execute(@row, $id);
	}
    }
}

sub andere_tabellen_aktualisieren {
    my ($tmp_dbh, $dbh, $id, $old_id) = @_;

    foreach my $table (@tables) {
	next if $table eq "veranstaltung";
	tabelle_aktualisieren $table, $tmp_dbh, $dbh, $id, $old_id;
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
    my $old_id = $sth->fetchrow_array || 1;
    foreach my $table (@tables) {
	next if $table eq "veranstaltung";
	$dbh->do(qq{
	    UPDATE $table
	    SET id = ?
	    WHERE id = ?
	}, undef, $old_id, $id);
    }
    return $old_id;
}

my $tabellen_erzeugen;
my $temp_db = ':memory:';
my $poll_intervall;  # Sekunden
my $force;
my $result = GetOptions("tabellen-erzeugen" => \$tabellen_erzeugen,
			"poll:i" => \$poll_intervall,
			"force" => \$force,
			"trace-sql" => \$trace_sql,
			"temp-db=s" => \$temp_db);
unless ($result && ($tabellen_erzeugen || @ARGV)) {
    print "VERWENDUNG: $0 [optionen] {trialtool-datei} ...\n";
    exit $result ? 0 : 1;
}
if (defined $poll_intervall && $poll_intervall == 0) {
    $poll_intervall = 30;
}

# 'DBI:mysql:databasename;host=db.example.com'
my $dbh = DBI->connect('DBI:mysql:mydb', 'agruen', '76KILcxM',
		       { RaiseError => 1, AutoCommit => 1 })
    or die "Could not connect to database: $DBI::errstr\n";
if ($tabellen_erzeugen) {
    tabellen_erzeugen $dbh;
}

if (@ARGV) {
    my $tmp_dbh = DBI->connect("DBI:SQLite:dbname=$temp_db",
			       { RaiseError => 1, AutoCommit => 1 })
	or die "Could not create in-memory database: $DBI::errstr\n";
    tabellen_erzeugen $tmp_dbh;
    my $sth = $tmp_dbh->table_info(undef, undef, undef, "TABLE");
    while (my @row = $sth->fetchrow_array) {
	push @tables, $row[2];
    }

    tabelle_kopieren "veranstaltung", $dbh, $tmp_dbh, undef, 0;

    foreach my $x (trialtool_dateien @ARGV) {
	my ($cfg_name, $dat_name) = @$x;
	my ($id, $veraendert) = status($tmp_dbh, $cfg_name, $dat_name);

	if ($veraendert || $poll_intervall || $force) {
	    my $cfg_mtime = mtime($cfg_name);
	    my $dat_mtime = mtime($dat_name);
	    my $cfg = cfg_datei_parsen($cfg_name);
	    my $fahrer_nach_startnummer = dat_datei_parsen($dat_name);
	    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, 1, $cfg;  # Wertung 1
	    $tmp_dbh->begin_work;
	    $id = in_datenbank_schreiben $tmp_dbh, $id, $cfg_name, $cfg_mtime,
					 $dat_name, $dat_mtime,
					 $fahrer_nach_startnummer, $cfg;
	    $tmp_dbh->commit;
	}
	if ($veraendert || $force) {
	    $dbh->begin_work;
	    foreach my $table (@tables) {
		tabelle_kopieren $table, $tmp_dbh, $dbh, $id, 1;
	    }
	    $dbh->commit;
	}
    }
    while ($poll_intervall) {
	foreach my $x (trialtool_dateien @ARGV) {
	    my ($cfg_name, $dat_name) = @$x;
	    my $cfg_mtime = mtime($cfg_name);
	    my $dat_mtime = mtime($dat_name);
	    my ($id, $veraendert) = status($tmp_dbh, $cfg_name, $dat_name);

	    if ($veraendert || $force) {
		my $cfg = cfg_datei_parsen($cfg_name);
		my $fahrer_nach_startnummer = dat_datei_parsen($dat_name);
		rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, 1, $cfg;  # Wertung 1
		$tmp_dbh->begin_work;
		my $old_id = veranstaltung_umnummerieren $tmp_dbh, $id;
		in_datenbank_schreiben $tmp_dbh, $id, $cfg_name, $cfg_mtime,
				       $dat_name, $dat_mtime,
				       $fahrer_nach_startnummer, $cfg;
		$tmp_dbh->commit;
		$dbh->begin_work;
		andere_tabellen_aktualisieren $tmp_dbh, $dbh, $id, $old_id;
		veranstaltung_aktualisieren $dbh, $id, $cfg_mtime, $dat_mtime;
		$dbh->commit;
		$tmp_dbh->begin_work;
		veranstaltung_loeschen $tmp_dbh, $old_id;
		$tmp_dbh->commit;
	    }
	    sleep $poll_intervall;
	}
    }
}
