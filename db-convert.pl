#! /usr/bin/perl -w -Itrial-toolkit

# Copyright (C) 2014  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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
use Getopt::Long;
use TrialToolkit;
use strict;

my $result = GetOptions("db=s" => \$database,
			"username=s" => \$username,
			"password=s" => \$password);

unless ($result) {
    print <<EOF;
VERWENDUNG: $0 

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
EOF
    exit $result ? 0 : 1;
}

my $dbh = DBI->connect("DBI:$database", $username, $password,
		       { RaiseError => 1, AutoCommit => 1, mysql_enable_utf8 => 1 })
    or die "Could not connect to database: $DBI::errstr\n";

sub sql_ausfuehren($@) {
    my ($dbh, @sql) = @_;

    my $affected_rows;
    foreach my $statement (@sql) {
	next if $statement =~ /^\s*$/;
	$affected_rows = $dbh->do($statement);
    }
    return $affected_rows;
}

sub create_version_trigger($$) {
    my ($dbh, $table) = @_;

    if ($dbh->{Driver}{Name} ne "mysql") {
	print STDERR "Tabelle $table: Trigger zur Überprüfung der Version werden nicht erzeugt!\n";
	return;
    }

    sql_ausfuehren $dbh, split /\n\n/, qq[
	DROP TRIGGER IF EXISTS ${table}_insert

	CREATE TRIGGER ${table}_insert BEFORE INSERT ON ${table}
	  FOR EACH ROW
	  BEGIN
	  IF new.version <> 1 THEN
	    -- The SIGNAL statement is only supported from MySQL 5.5 on; call
	    -- an undefined procedure instead to be compatible with older versions.
	    -- SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid Row Version';
	    CALL \`Invalid Row Version\`;
	  END IF;
	END

	DROP TRIGGER IF EXISTS ${table}_update

	CREATE TRIGGER ${table}_update BEFORE UPDATE ON ${table}
	  FOR EACH ROW
	  BEGIN
	  IF new.version < old.version OR new.version > old.version + 1 THEN
	    -- The SIGNAL statement is only supported from MySQL 5.5 on; call
	    -- an undefined procedure instead to be compatible with older versions.
	    -- SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid Row Version';
	    CALL \`Invalid Row Version\`;
	  END IF;
	END
	];
}

foreach my $sql (split /\s*;\s*/, q{
	    SET storage_engine=InnoDB;

	    ALTER TABLE veranstaltung
	    ADD COLUMN version INT NOT NULL DEFAULT 1 FIRST;

	    ALTER TABLE veranstaltung
	    ADD COLUMN mtime TIMESTAMP NULL AFTER datum;

	    ALTER TABLE fahrer
	    ADD COLUMN version INT NOT NULL DEFAULT 1 FIRST;

	    ALTER TABLE veranstaltung
	    ADD COLUMN basis INT AFTER id;

	    ALTER TABLE fahrer
	    ADD COLUMN papierabnahme_morgen BOOLEAN AFTER papierabnahme;

	    ALTER TABLE fahrer
	    ADD COLUMN s5 INT AFTER s4;

	    ALTER TABLE vareihe
	    ADD COLUMN version INT NOT NULL DEFAULT 1 FIRST;

	    ALTER TABLE veranstaltung
	    CHANGE COLUMN wertungspunkte_markiert wertung1_markiert BOOLEAN;

	    ALTER TABLE veranstaltung_feature
	    CHANGE COLUMN feature feature VARCHAR(30);

	    ALTER TABLE vareihe
	    ADD COLUMN verborgen BOOL;

	    ALTER TABLE klasse ADD COLUMN wertungsklasse INT;
	    ALTER TABLE klasse ADD COLUMN keine_wertungen BOOLEAN;
	    ALTER TABLE vareihe_klasse CHANGE COLUMN klasse wertungsklasse INT;

	    UPDATE klasse SET wertungsklasse = klasse;

	    UPDATE fahrer
	    SET papierabnahme_morgen = 0;

	    UPDATE fahrer
	    SET startnummer = 999 - startnummer
	    WHERE startnummer >= 1000;

	    UPDATE fahrer
	    SET s5 = (
		SELECT COUNT(*) - s4 - s3 - s2 - s1 - s0
		FROM punkte AS p
		WHERE fahrer.id = p.id AND fahrer.startnummer = p.startnummer)
	    WHERE papierabnahme;

	    DROP TABLE IF EXISTS ns;
	    CREATE TABLE ns (
	      vareihe INT,
	      id INT,
	      startnummer INT,
	      neue_startnummer INT,
	      PRIMARY KEY (vareihe, id, startnummer)
	    );

	    INSERT INTO ns
		SELECT vareihe, id, startnummer, neue_startnummer
		FROM vareihe_veranstaltung
		JOIN neue_startnummer USING (id)
		JOIN fahrer USING (id, startnummer)
		JOIN vareihe_klasse USING (vareihe, klasse);

	    DROP TABLE neue_startnummer;
	    RENAME TABLE ns to neue_startnummer;

	    DROP TABLE IF EXISTS sektion_aus_wertung;
	    CREATE TABLE sektion_aus_wertung (
	      id INT,
	      klasse INT,
	      runde INT,
	      sektion INT,
	      PRIMARY KEY (id, klasse, runde, sektion)
	    );

	    UPDATE klasse SET farbe = '#0000ff' WHERE farbe in ('blue', 'Blau');
	    UPDATE klasse SET farbe = '#a52a2a' WHERE farbe in ('brown', 'Braun');
	    UPDATE klasse SET farbe = '#ffff00' WHERE farbe in ('yellow', 'Gelb');
	    UPDATE klasse SET farbe = '#008000' WHERE farbe in ('green', 'Grün', 'Gruen');
	    UPDATE klasse SET farbe = '#ff0000' WHERE farbe in ('red', 'Rot');
	    UPDATE klasse SET farbe = '#ffffff' WHERE farbe in ('white', 'Weiss', 'Weiß');

	    UPDATE kartenfarbe SET farbe = '#0000ff' WHERE farbe in ('blue', 'Blau');
	    UPDATE kartenfarbe SET farbe = '#a52a2a' WHERE farbe in ('brown', 'Braun');
	    UPDATE kartenfarbe SET farbe = '#ffff00' WHERE farbe in ('yellow', 'Gelb');
	    UPDATE kartenfarbe SET farbe = '#008000' WHERE farbe in ('green', 'Grün', 'Gruen');
	    UPDATE kartenfarbe SET farbe = '#ff0000' WHERE farbe in ('red', 'Rot');
	    UPDATE kartenfarbe SET farbe = '#ffffff' WHERE farbe in ('white', 'Weiss', 'Weiß');

	    UPDATE veranstaltung
	    SET mtime = CASE WHEN dat_mtime > cfg_mtime THEN dat_mtime ELSE cfg_mtime END;
        }) {
    $dbh->do($sql)
	or die "$sql: $!\n";
}
create_version_trigger $dbh, 'veranstaltung';
create_version_trigger $dbh, 'fahrer';
create_version_trigger $dbh, 'vareihe';
