#! /usr/bin/perl -w -Itrial-toolkit

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

use utf8;
use DBI;
use Trialtool;
use Wertungen;
use Getopt::Long;
use File::Glob ':glob';
use File::Basename;
use Encode qw(encode);
use Encode::Locale qw(decode_argv);
use POSIX qw(strftime);
use List::Util qw(max);
use IO::Tee;
use Datenbank;
use DatenbankAktualisieren;
use Timestamp;
use TrialToolkit;
use strict;

my $STDOUT_encoding = -t STDOUT ? "console_out" : "UTF-8";
my $STDERR_encoding = -t STDERR ? "console_out" : "UTF-8";
binmode(STDIN, ":encoding(console_in)");
binmode(STDOUT, ":encoding($STDOUT_encoding)");
binmode(STDERR, ":encoding($STDERR_encoding)");

my $trace_sql = 0;
my $dry_run;

my $veranstaltungen;
my $dbh;

my @create_veranstaltung_tables = split /;/, q{
DROP TABLE IF EXISTS fahrer;
CREATE TABLE fahrer (
  version INT NOT NULL DEFAULT 1,
  id INT, -- veranstaltung
  startnummer INT,
  klasse INT,
  helfer INT,
  bewerber VARCHAR(40),
  nenngeld VARCHAR(10),
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
  email VARCHAR(60),
  bemerkung VARCHAR(150),
  land VARCHAR(15),
  bundesland VARCHAR(20),
  helfer_nummer VARCHAR(8),
  startzeit TIME,
  zielzeit TIME,
  stechen INT DEFAULT 0,
  nennungseingang BOOLEAN,
  start BOOLEAN,
  start_morgen BOOLEAN,
  versicherung INT,
  runden INT,
  s0 INT, -- nicht in version berücksichtigt (berechnet)
  s1 INT, -- nicht in version berücksichtigt (berechnet)
  s2 INT, -- nicht in version berücksichtigt (berechnet)
  s3 INT, -- nicht in version berücksichtigt (berechnet)
  s4 INT, -- nicht in version berücksichtigt (berechnet)
  s5 INT, -- nicht in version berücksichtigt (berechnet)
  ausser_konkurrenz BOOLEAN,
  ausfall INT DEFAULT 0,
  zusatzpunkte INT,
  punkte INT, -- nicht in version berücksichtigt (berechnet)
  rang INT, -- nicht in version berücksichtigt (berechnet)
  PRIMARY KEY (id, startnummer)
);

-- In fahrer.version berücksichtigt
DROP TABLE IF EXISTS fahrer_wertung;
CREATE TABLE fahrer_wertung (
  id INT, -- veranstaltung
  startnummer INT,
  wertung INT,
  wertungsrang INT, -- nicht in fahrer.version berücksichtigt (berechnet)
  wertungspunkte REAL, -- nicht fahrer.in version berücksichtigt (berechnet)
  PRIMARY KEY (id, startnummer, wertung)
);

-- In veranstaltung.version berücksichtigt
DROP TABLE IF EXISTS klasse;
CREATE TABLE klasse (
  id INT, -- veranstaltung
  klasse INT,
  runden INT,
  bezeichnung VARCHAR(60),
  gestartet BOOLEAN,
  farbe VARCHAR(20),
  fahrzeit TIME,
  wertungsklasse INT NOT NULL,
  keine_wertung1 BOOLEAN,
  PRIMARY KEY (id, klasse)
);

-- In fahrer.version berücksichtigt
DROP TABLE IF EXISTS punkte;
CREATE TABLE punkte (
  id INT, -- veranstaltung
  startnummer INT,
  runde INT,
  sektion INT,
  punkte INT NOT NULL,
  PRIMARY KEY (id, startnummer, runde, sektion)
);

-- In fahrer.version berücksichtigt
DROP TABLE IF EXISTS runde;
CREATE TABLE runde (
  id INT, -- veranstaltung
  startnummer INT,
  runde INT,
  punkte INT NOT NULL, -- nicht in fahrer.version berücksichtigt (berechnet)
  PRIMARY KEY (id, startnummer, runde)
);

-- In veranstaltung.version berücksichtigt
DROP TABLE IF EXISTS sektion;
CREATE TABLE sektion (
  id INT, -- veranstaltung
  klasse INT,
  sektion INT,
  PRIMARY KEY (id, klasse, sektion)
);

-- In veranstaltung.version berücksichtigt
DROP TABLE IF EXISTS sektion_aus_wertung;
CREATE TABLE sektion_aus_wertung (
  id INT, -- veranstaltung
  klasse INT,
  runde INT,
  sektion INT,
  PRIMARY KEY (id, klasse, runde, sektion)
);

DROP TABLE IF EXISTS veranstaltung;
CREATE TABLE veranstaltung (
  version INT NOT NULL DEFAULT 1,
  id INT, -- veranstaltung
  basis INT, -- veranstaltung
  datum DATE,
  mtime TIMESTAMP NULL,
  dat_mtime TIMESTAMP NULL,
  cfg_mtime TIMESTAMP NULL,
  dateiname VARCHAR(128),
  art VARCHAR(20),  -- Art der Veranstaltung
  aktiv BOOLEAN,
  vierpunktewertung BOOLEAN,
  wertungsmodus INT,
  punkteteilung BOOLEAN,
  punkte_sektion_auslassen INT,
  wertungspunkte_234 BOOLEAN,
  ergebnisliste_feld INT,
  wertung1_markiert BOOLEAN,
  versicherung INT,
  rand_links INT,
  rand_oben INT,
  ergebnislistenbreite INT,
  PRIMARY KEY (id)
);

-- In veranstaltung.version berücksichtigt
DROP TABLE IF EXISTS veranstaltung_feature;
CREATE TABLE veranstaltung_feature (
  id INT, -- veranstaltung
  feature VARCHAR(30),
  PRIMARY KEY (id, feature)
);

-- In veranstaltung.version berücksichtigt
DROP TABLE IF EXISTS kartenfarbe;
CREATE TABLE kartenfarbe (
  id INT, -- veranstaltung
  runde INT,
  farbe VARCHAR(20),
  PRIMARY KEY (id, runde)
);

-- In veranstaltung.version berücksichtigt
DROP TABLE IF EXISTS wertung;
CREATE TABLE wertung (
  id INT, -- veranstaltung
  wertung INT,
  titel VARCHAR(70),
  subtitel VARCHAR(70),
  bezeichnung VARCHAR(20),
  PRIMARY KEY (id, wertung)
);

-- In veranstaltung.version berücksichtigt
DROP TABLE IF EXISTS wertungspunkte;
CREATE TABLE wertungspunkte (
  id INT, -- veranstaltung
  rang INT,
  punkte INT NOT NULL,
  PRIMARY KEY (id, rang)
);

-- Geänderte Startnummern in der Jahreswertung
-- In veranstaltung.version berücksichtigt
DROP TABLE IF EXISTS neue_startnummer;
CREATE TABLE neue_startnummer (
  vareihe INT,
  id INT, -- veranstaltung
  startnummer INT,
  neue_startnummer INT,
  PRIMARY KEY (vareihe, id, startnummer)
);

-- In vareihe.version berücksichtigt
DROP TABLE IF EXISTS vareihe_veranstaltung;
CREATE TABLE vareihe_veranstaltung (
  vareihe INT,
  id INT, -- veranstaltung
  PRIMARY KEY (vareihe, id)
);
};

my @tables = map { /^\s*DROP TABLE IF EXISTS (.*)/m ? $1 : () }
		 @create_veranstaltung_tables;

my @create_reihen_tables = split /;/, q{
-- Veranstaltungsreihe
DROP TABLE IF EXISTS vareihe;
CREATE TABLE vareihe (
  version INT NOT NULL DEFAULT 1,
  vareihe INT,
  wertung INT, -- Wertung im Trialtool
  bezeichnung VARCHAR(40),
  kuerzel VARCHAR(10),
  verborgen BOOL,
  PRIMARY KEY (vareihe)
);

-- In vareihe.version berücksichtigt
DROP TABLE IF EXISTS vareihe_klasse;
CREATE TABLE vareihe_klasse (
  vareihe INT,
  wertungsklasse INT,
  laeufe INT,
  streichresultate INT,
  PRIMARY KEY (vareihe, wertungsklasse)
);
};

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

sub veranstaltung_loeschen($$$) {
    my ($dbh, $id, $auch_in_veranstaltung) = @_;

    foreach my $table (@tables) {
	next if ($table eq "veranstaltung" || $table eq "vareihe_veranstaltung") &&
		!$auch_in_veranstaltung;
	$dbh->do("DELETE FROM $table WHERE id = ?", undef, $id);
    }
}

sub features_aktualisieren($$) {
    my ($cfg, $features) = @_;

    my $f = { map { $_ => 1 } @{$cfg->{features}} };
    foreach my $feature (keys %$features) {
	if ($features->{$feature}) {
	    $f->{$feature} = 1;
	} else {
	    delete $f->{$feature};
	}
    }
    $cfg->{features} = [keys %$f];
}

sub status($) {
    my ($dateiname) = @_;
    my $cfg_mtime = mtime_timestamp("$dateiname.cfg");
    my $dat_mtime = mtime_timestamp("$dateiname.dat");

    foreach my $id (keys %$veranstaltungen) {
	my $cfg = $veranstaltungen->{$id}{cfg};
	if (defined $cfg->{dateiname} && $cfg->{dateiname} eq basename $dateiname) {
	    my $changed = $cfg->{cfg_mtime} ne $cfg_mtime ||
			  $cfg->{dat_mtime} ne $dat_mtime;
	    return ($id, $changed, $cfg_mtime, $dat_mtime);
	}
    }

    return (undef, 1, $cfg_mtime, $dat_mtime);
}

sub commit_or_rollback($) {
    my ($dbh) = @_;

    if ($dry_run) {
	$dbh->rollback;
    } else {
	$dbh->commit;
    }
}

sub veranstaltungen_aus_datenbank($) {
    my ($dbh) = @_;
    my $veranstaltungen;

    my $sth = $dbh->prepare(q{
	SELECT id, dateiname, cfg_mtime, dat_mtime
	FROM veranstaltung
    });
    $sth->execute;
    while (my $cfg = $sth->fetchrow_hashref) {
	my $id = $cfg->{id};
	$veranstaltungen->{$id}{cfg} = $cfg;
    }
    return $veranstaltungen;
}

sub naechste_id($) {
    my ($veranstaltungen) = @_;
    my $max_id = 0;
    foreach my $id (keys %$veranstaltungen) {
	$max_id = max($id, $max_id);
    }
    return $max_id + 1;
}

my $create_tables;
my $poll_interval;  # Sekunden
my $reconnect_interval;  # Sekunden
my $force;
my $vareihe;
my $farben = [];
my $list;
my $recalc;
my $delete;
my $delete_id;
my $log;
my $nur_fahrer = 1;
my $features_list = [];
my $aktiv = 1;
my $result = GetOptions("db=s" => \$database,
			"username=s" => \$username,
			"password=s" => \$password,
			"create-tables" => \$create_tables,
			"poll:i" => \$poll_interval,
			"reconnect:i" => \$reconnect_interval,
			"force" => \$force,
			"trace-sql" => sub () { $trace_sql = 1; },
			"trace-all-sql" => sub () { $trace_sql = 2; },
			"dry-run" => \$dry_run,
			"vareihe=s" => \@$vareihe,
			"farben=s@" => \@$farben,
			"punkteteilung" => \$punkteteilung,
			"keine-punkteteilung" => sub () { undef $punkteteilung },
			"alle-fahrer" => sub () { undef $nur_fahrer; },
			"list" => \$list,
			"recalc" => \$recalc,
			"delete" => \$delete,
			"delete-id" => \$delete_id,
			"log=s" => \$log,
			"features=s" => \@$features_list,
			"inaktiv" => sub () { undef $aktiv });

$vareihe = [ map { split /,/, $_ } @$vareihe ];

$farben = [ map { split /,/, $_ } @$farben ];
unless (@$farben) {
    map { $farben->[$_ - 1] = $klassenfarben->{$_} } keys %$klassenfarben;
}
$klassenfarben = $farben;

my $features = $veranstaltungsfeatures;
foreach my $feature (map { split /,/, $_ } @$features_list) {
    if ($feature =~ /^([-+])(.*)/) {
	$features->{$2} = ($1 eq '+');
    } else {
	$result = 0;
	last;
    }
}

if ($^O =~ /win/i) {
    @ARGV = map { bsd_glob($_, GLOB_NOCASE) } @ARGV;
}

decode_argv;

unless ($result && $database && ($create_tables || $list || @ARGV)) {
    print <<EOF;
VERWENDUNG: $0 [optionen] {datei|verzeichnis} ...

Überträgt eine oder mehrere Veranstaltungen an eine Datenbank, löscht sie dort
(--delete), oder erzeugt die Datenbanktabellen neu (--create-tables).

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

  --create-tables
    Alle benötigten Tabellen löschen und neu erzeugen.  Achtung, alle
    bestehenden Daten gehen dabei verloren!

  --delete
    Lösche die angegebenen Veranstaltungen aus der Datenbank.

  --list
    Liste der Veranstaltungen in der Datenbank anzeigen.

  --recalc
    Wertung von Veranstaltungen in der Datenbank neu berechnen.

  --delete-id
    Lösche die Veranstaltungen mit den angegebenen IDs aus der Datenbank.

  --alle-fahrer
    Alle Fahrerdaten übertragen, auch von Fahrern, denen keine Startnummern
    zugewiesen sind.

  --poll[=M], --reconnect[=N]
    Die angegebenen Veranstaltungen alle M Sekunden auf Änderungen überprüfen.
    Wenn die Verbindung zur Datenbank abreißt, alle N Sekunden einen Neuaufbau
    versuchen.

  --force
    Die Veranstaltung am Server löschen und komplett neu übertragen.  Die
    Zeitstempel der Dateien immer ignorieren.  (Normalerweise wird bei --poll
    nur nach Änderungen gesucht, wenn sich die Zeitstempel ändern.)

  --vareihe=N,...
    Die angegebenen Veranstaltung(en) in die angegebenen Veranstaltungsreihe(n)
    eintragen.  Wenn nicht angegeben, wird Veranstaltung in keine
    Veranstaltungsreihe eingetragen.

  --farben=...,...
    Spurfarben der einzelnen Klassen als HTML Farbname oder Farbcode.

  --punkteteilung, --keine-punkteteilung
    Wenn es ex aequo-Platzierungen gibt, vergibt das Trialtool normalerweise
    allen Fahrern die maximalen Wertungspunkte: zwei Erste bekommen beide die
    Wertungspunkte für den ersten Platz, der nächste Fahrer hat Platz 3. Bei
    Punkteteilung werden stattdessen die Wertungspunkte für den ersten und
    zweiten Platz unter den beiden Ersten aufgeteilt.

  --trace-sql, --trace-all-sql
    Die ausgeführten SQL-Befehle mitprotokollieren (alle oder alle außer den
    SELECT-Befehlen).

  --log=datei
    Die Ausgaben des Programms zusätzlich an die angegebene Datei anhängen.

  --dry-run
    Die Daten an die Datenbank übertragen, aber nicht tatsächlich schreiben
    (kein Commit).

  --feature=-feature,+feature,...
    Feature in der Datenbank ignorieren (-) oder hinzufügen (+).  Momentan sind
    die Features die Namen der Felder, die im Nennformular aktiviert sind.

  --inaktiv
    Veranstaltung(en) als inaktiv markieren.  Sie scheinen dann nicht in
    Veranstaltungslisten auf, und sind in Gesamtwertungen nicht enthalten.
EOF
    exit $result ? 0 : 1;
}
if (defined $poll_interval && $poll_interval == 0) {
    $poll_interval = 30;
}
if (defined $reconnect_interval && $reconnect_interval == 0) {
    $reconnect_interval = $poll_interval;
}

if (defined $log) {
    open LOG, ">>$log"
	or die "$log: $!\n";
    open STDOUT_DUP, ">&STDOUT"
	or die "STDOUT: $!\n";
    open STDERR_DUP, ">&STDERR"
	or die "STDERR: $!\n";

    binmode(LOG, ":encoding(UTF-8)");
    binmode(STDOUT_DUP, ":encoding($STDOUT_encoding)");
    binmode(STDERR_DUP, ":encoding($STDERR_encoding)");

    print LOG "\n$0 ", join(" ", @ARGV), "\nGestartet um ",
	      strftime("%Y-%m-%d %H:%M:%S", localtime()), "\n";
    LOG->flush;

    *STDOUT = IO::Tee->new(\*STDOUT_DUP, \*LOG);
    *STDERR = IO::Tee->new(\*STDERR_DUP, \*LOG);
}

# Daten am Server löschen und komplett neu übertragen?
my $neu_uebertragen = $force;

sub sql_aktualisieren($$$) {
    my ($sql, $args, $davor) = @_;

    print "    # UPDATE FROM ". join(", ",
	    map { $_->[0] . " = " . sql_value($_->[1]) } @$davor) . "\n"
	if $trace_sql && $davor;
    $dbh->do($sql, undef, @$args);
}

do {
    eval {
	$dbh = DBI->connect("DBI:$database", $username, $password,
			    { PrintError => 1, RaiseError => 1,
			      AutoCommit => 1, db_utf8($database) })
	    or die "Could not connect to database: $DBI::errstr\n";

	if ($dbh->{Driver}{Name} eq "mysql") {
	    $dbh->do("SET storage_engine=InnoDB");  # We need transactions!
	}

	trace_sql $dbh, $trace_sql, \*STDOUT
	    if $trace_sql;

	if ($list) {
	    my $sth = $dbh->prepare(q{
		SELECT id, dateiname, datum
		FROM veranstaltung
		ORDER BY datum, dateiname
	    });
	    $sth->execute;
	    my $header_printed;
	    while (my @row = $sth->fetchrow_array) {
		unless ($header_printed) {
		    printf "%3s  %s\n", "id", "dateiname";
		    $header_printed = 1;
		}
		printf "%3d  %s\n", $row[0], $row[1] // $row[2] // '?';
	    }
	    exit;
	}

	print "Connected to $database ...\n";

	if ($recalc) {
	    foreach my $id (@ARGV) {
		$dbh->begin_work;
		wertung_aktualisieren $dbh, \&sql_aktualisieren, $id;
		commit_or_rollback $dbh;
	    }
	    exit;
	}

	if ($create_tables) {
	    print "Creating tables ...\n";
	    $dbh->begin_work;
	    sql_ausfuehren $dbh, @create_veranstaltung_tables;
	    sql_ausfuehren $dbh, @create_reihen_tables;
	    create_version_trigger $dbh, 'vareihe';
	    create_version_trigger $dbh, 'veranstaltung';
	    create_version_trigger $dbh, 'fahrer';
	    commit_or_rollback $dbh;
	    undef $create_tables;
	}

	if (@ARGV) {
	    my $erster_check;
	    if ($delete_id) {
		foreach my $id (@ARGV) {
		    veranstaltung_loeschen $dbh, $id, 1;
		}
		exit;
	    }

	    unless ($veranstaltungen) {
		$veranstaltungen = veranstaltungen_aus_datenbank($dbh);
		$erster_check = 1;
	    }

	    while ($erster_check || $neu_uebertragen || $poll_interval) {
		foreach my $dateiname (trialtool_dateien @ARGV) {
		    my ($id, $veraendert, $cfg_mtime, $dat_mtime) =
			status($dateiname);

		    if ($delete) {
			if ($id) {
			    veranstaltung_loeschen $dbh, $id, 1;
			}
			next;
		    }

		    $veraendert ||= $force;

		    # Wenn wir nicht laufend übertragen, die Zeitstempel der
		    # Dateien ignorieren und die Daten vergleichen.
		    $veraendert ||= !$poll_interval;

		    if (defined $id && $erster_check &&
			($veraendert || $poll_interval) && !$neu_uebertragen) {
			$veranstaltungen->{$id}{cfg} =
			    cfg_aus_datenbank($dbh, $id);
			$veranstaltungen->{$id}{fahrer} =
			    fahrer_aus_datenbank($dbh, $id);
		    }

		    if ($neu_uebertragen || $veraendert) {
			my $cfg = cfg_datei_parsen("$dateiname.cfg");
			my $fahrer_nach_startnummer = dat_datei_parsen("$dateiname.dat", $cfg, $nur_fahrer);
			if (%{$cfg->{neue_startnummern}} && !@$vareihe) {
				print STDERR "Warnung: Veranstaltung '$dateiname' ist keinen " .
				    "Serien zugeordnet, daher können die Startnummernänderungen " .
				    "(*JW:...*) nicht übernommen werden!\n";
			    delete $cfg->{neue_startnummern};
			}
			$cfg->{dateiname} = basename $dateiname;
			$cfg->{datum} = $1
			    if $cfg->{dateiname} =~ /^(\d{4}-\d{2}-\d{2}) /;
			$cfg->{punkteteilung} = $punkteteilung;
			rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;

			$cfg->{cfg_mtime} = $cfg_mtime;
			$cfg->{dat_mtime} = $dat_mtime;
			$cfg->{mtime} = max_timestamp($cfg_mtime, $dat_mtime);
			$cfg->{aktiv} = $aktiv;
			$cfg->{vareihen} = $vareihe;
			features_aktualisieren $cfg, $features;
			for (my $n = 0; $n < @{$cfg->{klassen}}; $n++) {
			    $cfg->{klassen}[$n]{farbe} = $klassenfarben->[$n];
			}

			print "\n";
			$id = naechste_id($veranstaltungen)
			    unless defined $id;
			my $veranstaltung = $neu_uebertragen ? undef : $veranstaltungen->{$id};
			$dbh->begin_work;
			veranstaltung_loeschen $dbh, $id, 1
			    if $neu_uebertragen;
			veranstaltung_aktualisieren \&sql_aktualisieren, $id,
						    $veranstaltung->{cfg}, $cfg;
			fahrer_aktualisieren \&sql_aktualisieren, $id,
					     $veranstaltung->{fahrer}, $fahrer_nach_startnummer, 1;
			commit_or_rollback $dbh;
			unless ($dry_run) {
			    $veranstaltungen->{$id} = {
				cfg => $cfg,
				fahrer => $fahrer_nach_startnummer
			    };
			}
		    }
		}

		$neu_uebertragen = undef;
		$erster_check = undef;
		exit
		    if $delete;
		sleep $poll_interval
		    if defined $poll_interval;
	    }
	}
    };
    if ($@) {
	$dbh->disconnect;
	# Der Datenstand am Server stimmt vielleicht nicht mehr mit dem
	# lokal zwischengespeicherten Datenstand übereinzustimmen.
	# Reparaturversuch über Neuübertragung der Daten vom Server.
	undef $veranstaltungen;
    }
    if ($reconnect_interval) {
	print "Waiting for $reconnect_interval seconds...\n";
	sleep $reconnect_interval;
	print "\n";
    }
} while ($reconnect_interval);
