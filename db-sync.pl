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
use DBI qw(looks_like_number);
use Trialtool;
use Wertungen;
use Getopt::Long;
use File::Glob ':glob';
use File::Basename;
use Encode qw(encode);
use Encode::Locale qw(decode_argv);
use Storable qw(dclone);
use POSIX qw(strftime);
use IO::Tee;
use Datenbank;
use TrialToolkit;
use strict;

my $STDOUT_encoding = -t STDOUT ? "console_out" : "UTF-8";
my $STDERR_encoding = -t STDERR ? "console_out" : "UTF-8";
binmode(STDIN, ":encoding(console_in)");
binmode(STDOUT, ":encoding($STDOUT_encoding)");
binmode(STDERR, ":encoding($STDERR_encoding)");

my $trace_sql;
my $trace_all_sql;
my $dry_run;

my @tables;  # Liste der Tabellen in der Datenbank

my @create_veranstaltung_tables = split /;/, q{
DROP TABLE IF EXISTS fahrer;
CREATE TABLE fahrer (
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
  bemerkung VARCHAR(150),
  land VARCHAR(15),
  bundesland VARCHAR(20),
  helfer_nummer VARCHAR(8),
  startzeit TIME,
  zielzeit TIME,
  stechen INT,
  nennungseingang BOOLEAN,
  papierabnahme BOOLEAN,
  versicherung INT,
  runden INT,
  s0 INT,
  s1 INT,
  s2 INT,
  s3 INT,
  s4 INT,
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
  wertungsrang INT,
  wertungspunkte REAL,
  PRIMARY KEY (id, startnummer, wertung)
);

DROP TABLE IF EXISTS klasse;
CREATE TABLE klasse (
  id INT, -- veranstaltung
  klasse INT,
  runden INT,
  bezeichnung VARCHAR(60),
  gestartet BOOLEAN,
  farbe VARCHAR(20),
  fahrzeit TIME,
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
  aktiv BOOLEAN,
  vierpunktewertung BOOLEAN,
  wertungsmodus INT,
  punkteteilung BOOLEAN,
  punkte_sektion_auslassen INT,
  wertungspunkte_234 BOOLEAN,
  ergebnisliste_feld INT,
  wertungspunkte_markiert BOOLEAN,
  versicherung INT,
  rand_links INT,
  rand_oben INT,
  ergebnislistenbreite INT,
  PRIMARY KEY (id)
);

DROP TABLE IF EXISTS veranstaltung_feature;
CREATE TABLE veranstaltung_feature (
  id INT, -- veranstaltung
  feature VARCHAR(20),
  PRIMARY KEY (id, feature)
);

DROP TABLE IF EXISTS kartenfarbe;
CREATE TABLE kartenfarbe (
  id INT, -- veranstaltung
  runde INT,
  farbe VARCHAR(7),
  PRIMARY KEY (id, runde)
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
  PRIMARY KEY (id, startnummer)
);

DROP TABLE IF EXISTS vareihe_veranstaltung;
CREATE TABLE vareihe_veranstaltung (
  vareihe INT,
  id INT, -- veranstaltung
  PRIMARY KEY (vareihe, id)
);
};

my @create_reihen_tables = split /;/, q{
-- Veranstaltungsreihe
DROP TABLE IF EXISTS vareihe;
CREATE TABLE vareihe (
  vareihe INT,
  wertung INT, -- Wertung im Trialtool
  bezeichnung VARCHAR(40),
  kuerzel VARCHAR(10),
  PRIMARY KEY (vareihe)
);

DROP TABLE IF EXISTS vareihe_klasse;
CREATE TABLE vareihe_klasse (
  vareihe INT,
  klasse INT,
  laeufe INT,
  streichresultate INT,
  PRIMARY KEY (vareihe, klasse)
);

INSERT INTO vareihe (vareihe, bezeichnung)
    VALUES (1, 'ÖTSV Cup + OSK Staatsmeisterschaft 2012');

INSERT INTO vareihe (vareihe, wertung, bezeichnung, kuerzel)
    VALUES (2, 1, 'ÖTSV Cup 2012', 'ÖTSV');
INSERT INTO vareihe_klasse (vareihe, klasse, laeufe, streichresultate)
    VALUES (2, 1, 15, 4);
INSERT INTO vareihe_klasse (vareihe, klasse, laeufe, streichresultate)
    VALUES (2, 2, 15, 4);
INSERT INTO vareihe_klasse (vareihe, klasse, laeufe, streichresultate)
    VALUES (2, 3, 15, 4);
INSERT INTO vareihe_klasse (vareihe, klasse, laeufe, streichresultate)
    VALUES (2, 4, 15, 4);
INSERT INTO vareihe_klasse (vareihe, klasse, laeufe, streichresultate)
    VALUES (2, 5, 15, 4);
INSERT INTO vareihe_klasse (vareihe, klasse, laeufe, streichresultate)
    VALUES (2, 6, 15, 4);
INSERT INTO vareihe_klasse (vareihe, klasse, laeufe, streichresultate)
    VALUES (2, 7, 15, 4);

INSERT INTO vareihe (vareihe, wertung, bezeichnung, kuerzel)
    VALUES (3, 1, 'OSK Staatsmeisterschaft 2012', 'OSK');
INSERT INTO vareihe_klasse (vareihe, klasse, laeufe, streichresultate)
    VALUES (3, 11, 8, 2);
INSERT INTO vareihe_klasse (vareihe, klasse, laeufe, streichresultate)
    VALUES (3, 12, 8, 2);
INSERT INTO vareihe_klasse (vareihe, klasse, laeufe, streichresultate)
    VALUES (3, 13, 8, 2);
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

sub features_aktualisieren($$) {
    my ($cfg, $features) = @_;

    my $f = { map { $_ => 1 } @{$cfg->{nennungsmaske_felder}} };
    foreach my $feature (keys %$features) {
	if ($features->{$feature}) {
	    $f->{$feature} = 1;
	} else {
	    delete $f->{$feature};
	}
    }
    $cfg->{nennungsmaske_felder} = [keys %$f];
}

sub in_datenbank_schreiben($$$$$) {
    my ($dbh, $id, $basename, $fahrer_nach_startnummer, $cfg) = @_;
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

    my @cfg_felder = qw(
	vierpunktewertung wertungsmodus punkte_sektion_auslassen
	wertungspunkte_234 ergebnisliste_feld wertungspunkte_markiert
	versicherung rand_links rand_oben ergebnislistenbreite
	punkteteilung cfg_mtime dat_mtime aktiv
    );
    $sth = $dbh->prepare(sprintf qq{
	INSERT INTO veranstaltung (id, datum, dateiname, %s)
	VALUES (?, ?, ?, %s)
    }, join(", ", @cfg_felder), join(", ", map { "?" } @cfg_felder));
    $sth->execute($id, $datum, $basename, (map { $cfg->{$_} } @cfg_felder));

    $sth = $dbh->prepare(qq{
	INSERT INTO veranstaltung_feature (id, feature)
	VALUES (?, ?)
    });
    foreach my $feature (@{$cfg->{nennungsmaske_felder}}) {
	$sth->execute($id, $feature);
    }

    $sth = $dbh->prepare(qq{
	INSERT INTO kartenfarbe (id, runde, farbe)
	VALUES (?, ?, ?)
    });
    for (my $n = 0; $n < @{$cfg->{kartenfarben}}; $n++) {
	my $farbe = $cfg->{kartenfarben}[$n];
	next unless defined $farbe;
	$sth->execute($id, $n + 1, $farbe);
    }

    $sth = $dbh->prepare(qq{
	INSERT INTO vareihe_veranstaltung(vareihe, id)
	VALUES (?, ?)
    });
    foreach my $vareihe (@{$cfg->{vareihen}}) {
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
    {
	# Gleiche Werte am Ende der Tabelle zusammenfassen: der letzte Wert
	# gilt für alle weiteren Plätze.
	my $n;
	for ($n = @{$cfg->{wertungspunkte}} - 1; $n > 0; $n--) {
	    last if $cfg->{wertungspunkte}[$n] != $cfg->{wertungspunkte}[$n - 1];
	}
	for (; $n >= 0; $n--) {
	    $sth->execute($id, $n + 1, $cfg->{wertungspunkte}[$n]);
	}
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
	INSERT INTO klasse (id, klasse, runden, bezeichnung, gestartet, farbe, fahrzeit)
	VALUES (?, ?, ?, ?, ?, ?, ?)
    });
    my $gestartete_klassen = gestartete_klassen($cfg);
    for (my $n = 0; $n < @{$cfg->{klassen}}; $n++) {
	my $farbe = defined $klassenfarben ? $klassenfarben->{$n + 1} : undef;
	$sth->execute($id, $n + 1, $cfg->{runden}[$n], $cfg->{klassen}[$n],
		      $gestartete_klassen->[$n], $farbe, $cfg->{fahrzeiten}[$n]);
    }
    my $neue_startnummern = $cfg->{neue_startnummern};
    if (%$neue_startnummern) {
	$sth = $dbh->prepare(qq{
	    INSERT INTO neue_startnummer (id, startnummer, neue_startnummer)
	    VALUES (?, ?, ?)
	});
	foreach my $startnummer (keys %$neue_startnummern) {
	    $sth->execute($id, $startnummer, $neue_startnummern->{$startnummer});
	}
    }

    my @dat_felder = qw(
	startnummer klasse helfer nenngeld bewerber nachname vorname strasse
	wohnort plz club fahrzeug telefon lizenznummer rahmennummer kennzeichen
	hubraum bemerkung land bundesland helfer_nummer startzeit zielzeit
	stechen nennungseingang papierabnahme versicherung runden ausfall
	zusatzpunkte punkte rang geburtsdatum s0 s1 s2 s3 s4
    );
    $sth = $dbh->prepare(sprintf qq{
	INSERT INTO fahrer (id, %s)
	VALUES (?, %s)
    }, join(", ", @dat_felder), join(", ", map { "?" } @dat_felder));
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
	INSERT INTO fahrer_wertung (id, startnummer, wertung, wertungsrang, wertungspunkte)
	VALUES (?, ?, ?, ?, ?)
    });
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	my $startnummer = $fahrer->{startnummer};
	for (my $n = 0; $n < 5; $n++) {
	    $fahrer->{"s$n"} = $fahrer->{s}[$n];
	}
	$sth->execute($id, (map { $fahrer->{$_} } @dat_felder));

	for (my $m = 0; $m < @{$fahrer->{punkte_pro_sektion}}; $m++) {
	    my $punkte = $fahrer->{punkte_pro_sektion}[$m];
	    for (my $n = 0; $n < @$punkte; $n++) {
		next unless defined $punkte->[$n];
		$sth2->execute($id, $startnummer, $m + 1, $n + 1,
			       $punkte->[$n]);
	    }
	    if ($m < ($fahrer->{runden} // 0)) {
		next unless defined $fahrer->{punkte_pro_runde}[$m];
		$sth3->execute($id, $startnummer, $m + 1,
			       $fahrer->{punkte_pro_runde}[$m]);
	   }
	}
	for (my $n = 0; $n < @{$fahrer->{wertungen}}; $n++) {
	    next unless $fahrer->{wertungen}[$n];
	    $sth4->execute($id, $startnummer, $n + 1,
			   $fahrer->{wertungsrang}[$n],
			   $fahrer->{wertungspunkte}[$n]);
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
	my @spaltennamen = force_utf8_on @{$von_sth->{NAME_lc}};
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

sub status($$) {
    my ($dbh, $dateiname) = @_;
    my $basename = basename($dateiname);
    my $sth;
    my @row;

    my $cfg_mtime = mtime_timestamp("$dateiname.cfg");
    my $dat_mtime = mtime_timestamp("$dateiname.dat");

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
    my $sql2;

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
	    $sql2 = "DELETE FROM $table WHERE " .
		   join(" AND ", map { "$_ = ?" } (@other_keys, "id"));
	    $sth2 = $dbh->prepare($sql2);
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
	    my @spaltennamen = force_utf8_on @{$sth->{NAME_lc}};
	    pop @spaltennamen;
	    $sql2 = "INSERT INTO $table (" . join(", ", @spaltennamen) . ") " .
		    "VALUES (" . join(", ", map { "?" } @spaltennamen) . ")";
	    $sth2 = $dbh->prepare($sql2);
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
		SELECT $old_nonkeys, $new_nonkeys
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
		SELECT $old_nonkeys, $new_nonkeys, $old_other_keys
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
	    my (@columns, @old, @new_values);
	    for (my ($i, $j) = (0, scalar @nonkeys);
		 $j < @row - @other_keys;
		 $i++, $j++) {
		unless ($row[$i] ~~ $row[$j]) {
		    push @columns, $nonkeys[$i];
		    push @old, "$nonkeys[$i] = " .
			 sql_value($row[$i]);
		    push @new_values, $row[$j];
		}
	    }
	    if (@columns) {
		print "    # UPDATE FROM " . join(", ", @old), "\n"
		   if $trace_sql;
		$sql2 = "UPDATE $table " .
			"SET " . join(", ", map { "$_ = ?" } @columns) . " " .
			"WHERE " .  join(" AND ",
				         map { "$_ = ?" } (@other_keys, "id"));
		my @args2 = (@new_values, @row[2 * @nonkeys .. $#row], $id);
		$dbh->do($sql2, undef, @args2);
	    } else {
		warn "There should be differences, but I don't see them\n";
	    }
	}
    }
}

sub tabellen_aktualisieren {
    my ($tmp_dbh, $dbh, $id, $tmp_id) = @_;

    foreach my $table (@tables) {
	tabelle_aktualisieren $table, $tmp_dbh, $dbh, $id, $tmp_id;
    }
}

# datensatz_aktualisieren  -  Datensatz aktualisieren
#
#  table: Tabellenname
#  keys: Namen der Schlüsselfelder
#  kval: Werte der Schlüsselfelder
#  nonkeys: Namen der weiteren Felder
#  old: Alte Werte (oder undef, wenn kein Datensatz)
#  new: Neue Werte (oder undef, wenn kein Datensatz)
#
# Abhängig von den alten und neuen Werten für die einzelnen Felder wird er alte
# Datensatz gelöscht, aktualisiert, oder ein neuer Datensatz eingefügt.
#
sub datensatz_aktualisieren($$$$$$$) {
    my ($dbh, $table, $keys, $kval, $nonkeys, $old, $new) = @_;
    my $sql;
    my @args;

    if (defined $old) {
	if (defined $new) {
	    my $modified_nonkeys = [];
	    my $modified_old;
	    my $modified_new;
	    for (my $n = 0; $n < @$nonkeys; $n++) {
		unless ($old->[$n] ~~ $new->[$n]) {
		    push @$modified_nonkeys, $nonkeys->[$n];
		    push @$modified_old, $old->[$n];
		    push @$modified_new, $new->[$n];
		}
	    }
	    $nonkeys = $modified_nonkeys;
	    $old = $modified_old;
	    $new = $modified_new;
	    return unless @$nonkeys;

	    my @from;
	    for (my $n = 0; $n < @$nonkeys; $n++) {
		push @from, $nonkeys->[$n] . " = " . sql_value($old->[$n]);
	    }
	    print "    # UPDATE FROM ".  join(", ", @from) . "\n"
		if $trace_sql;

	    $sql = "UPDATE $table " .
		"SET " . join(", ", map { "$_ = ?" } @$nonkeys) . " " .
		"WHERE " . join(" AND ", map { "$_ = ?" } @$keys);
	    @args = (@$new, @$kval);
	} else {
	    $sql = "DELETE FROM $table " .
		"WHERE " . join(" AND ", map { "$_ = ?" } @$keys);
	    @args = @$kval;
	}
    } elsif (defined $new) {
	$sql = "INSERT INTO $table (" . join(", ", @$keys, @$nonkeys) . ") " .
	    "VALUES (" . join(", ", map { "?" } (@$keys, @$nonkeys)) . ")";
	@args = (@$kval, @$new);
    }
    $dbh->do($sql, undef, @args)
	if defined $sql;
}

sub wertung_aktualisieren($$) {
    my ($dbh, $id) = @_;
    my ($cfg, $fahrer_nach_startnummer0, $fahrer_nach_startnummer1);

    $cfg = cfg_aus_datenbank($dbh, $id);
    $fahrer_nach_startnummer0 = wertung_aus_datenbank($dbh, $id);
    $fahrer_nach_startnummer1 = dclone $fahrer_nach_startnummer0;
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer1, $cfg;

    foreach my $fahrer (values %$fahrer_nach_startnummer1) {
	my $startnummer = $fahrer->{startnummer};
	my $fahrer0 = $fahrer_nach_startnummer0->{$startnummer};

	datensatz_aktualisieren(
	    $dbh, "fahrer",
	    [qw(id startnummer)],
	    [$id, $startnummer],
	    [qw(s0 s1 s2 s3 s4 punkte runden rang)],
	    [@{$fahrer0->{s}}[0 .. 4],
	     $fahrer0->{punkte}, $fahrer0->{runden}, $fahrer0->{rang}],
	    [@{$fahrer->{s}}[0 .. 4],
	     $fahrer->{punkte}, $fahrer->{runden}, $fahrer->{rang}]);

	for (my $idx = 0; $idx < 5; $idx++) {
	    my $punkte1 = $fahrer->{punkte_pro_runde}[$idx];
	    my $punkte0 = $fahrer0->{punkte_pro_runde}[$idx];
	    datensatz_aktualisieren(
		$dbh, "runde",
		[qw(id startnummer runde)],
		[$id, $startnummer, $idx + 1],
		[qw(punkte)],
		defined $punkte0 ? [$punkte0] : undef,
		defined $punkte1 ? [$punkte1] : undef);
	}

	my $eps = 1 / (1 << 13);
	for (my $idx = 0; $idx < 4; $idx++) {
	    my $wp1 = $fahrer->{wertungspunkte}[$idx];
	    my $wp0 = $fahrer0->{wertungspunkte}[$idx];
	    if (defined $wp1 && defined $wp0) {
		$wp1 = $wp0
		    if abs($wp1 - $wp0) < $eps;
	    }

	    datensatz_aktualisieren(
		$dbh, "fahrer_wertung",
		[qw(id startnummer wertung)],
		[$id, $startnummer, $idx + 1],
		[qw(wertungsrang wertungspunkte)],
		[$fahrer0->{wertungsrang}[$idx], $wp0],
		[$fahrer->{wertungsrang}[$idx], $wp1]);
	}
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

sub commit_or_rollback($) {
    my ($dbh) = @_;

    if ($dry_run) {
	$dbh->rollback;
    } else {
	$dbh->commit;
    }
}

my $create_tables;
my $temp_db = ':memory:';
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
			"trace-sql" => \$trace_sql,
			"trace-all-sql" => sub () { $trace_sql = 1; $trace_all_sql = 1; },
			"dry-run" => \$dry_run,
			"temp-db=s" => \$temp_db,
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
if (@$farben) {
    for (my $n = 0; $n < @$farben; $n++) {
	$klassenfarben->{$n + 1} = $farben->[$n]
	    if $farben->[$n] ne "";
    }
}

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

  --temp-db=dateiname
    Die intern verwendete SQLite-Datenbank in die angegebene Datei schreiben.
    Diese Option ist zur Fehlersuche gedacht.

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

my $tmp_dbh;

sub sql_value($) {
    my ($_) = @_;

    return "NULL"
	unless defined $_;
    return $_
	if looks_like_number $_;
    s/'/''/g;
    return "'$_'";
}

sub log_sql_statement($@) {
    my ($statement, @bind_values) = @_;
    $statement =~ s/^\s*(.*)\s*$/$1/;
    $statement =~ s/\?/sql_value shift @bind_values/ge;
    print "    $statement;\n";
}

do {
    eval {
	my $dbh = DBI->connect("DBI:$database", $username, $password,
			       { RaiseError => 1, AutoCommit => 1, db_utf8($database) })
	    or die "Could not connect to database: $DBI::errstr\n";

	if ($dbh->{Driver}->{Name} eq "mysql") {
	    $dbh->do("SET storage_engine=InnoDB");  # We need transactions!
	}

	if ($trace_sql) {
	    $dbh->{Callbacks} = {
		ChildCallbacks => {
		    execute => sub {
			my ($sth, @bind_values) = @_;
			log_sql_statement $sth->{Statement}, @bind_values
			    if $sth->{Statement} !~ /^\s*SELECT/i || $trace_all_sql;
			return;
		    },
		},
		do => sub {
		    my ($dbh, $statement, $attr, @bind_values) = @_;
		    log_sql_statement $statement, @bind_values
			    if $statement !~ /^\s*SELECT/i || $trace_all_sql;
		    return;
		},
	     };
	}

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
	    exit;
	}

	print "Connected to $database ...\n";

	if ($recalc) {
	    foreach my $id (@ARGV) {
		$dbh->begin_work;
		wertung_aktualisieren $dbh, $id;
		commit_or_rollback $dbh;
	    }
	    exit;
	}

	if ($create_tables) {
	    print "Creating tables ...\n";
	    $dbh->begin_work;
	    sql_ausfuehren $dbh, @create_veranstaltung_tables;
	    sql_ausfuehren $dbh, @create_reihen_tables;
	    commit_or_rollback $dbh;
	    undef $create_tables;
	}

	if (@ARGV) {
	    my $erster_check;
	    unless (defined $tmp_dbh) {
		$tmp_dbh = DBI->connect("DBI:SQLite:dbname=$temp_db",
					   { RaiseError => 1, AutoCommit => 1, sqlite_unicode => 1 })
		    or die "Could not create in-memory database: $DBI::errstr\n";
		sql_ausfuehren $tmp_dbh, @create_veranstaltung_tables;
		my $sth = $tmp_dbh->table_info(undef, undef, undef, "TABLE");
		while (my @row = $sth->fetchrow_array) {
		    push @tables, $row[2];
		}

		tabelle_kopieren "veranstaltung", $dbh, $tmp_dbh, undef, 0;
		tabelle_kopieren "vareihe_veranstaltung", $dbh, $tmp_dbh, undef, 0;
		$erster_check = 1;
	    }

	    if ($delete_id) {
		foreach my $id (@ARGV) {
		    veranstaltung_loeschen $dbh, $id, 1;
		}
		exit;
	    }

	    while ($erster_check || $neu_uebertragen || $poll_interval) {
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

		    # Wenn wir nicht laufend übertragen, die Zeitstempel der
		    # Dateien ignorieren und die Daten vergleichen.
		    $veraendert ||= !$poll_interval;

		    $tmp_dbh->begin_work;
		    veranstaltung_kopieren $dbh, $tmp_dbh, $id
			if defined $id && $erster_check &&
			   ($veraendert || $poll_interval) && !$neu_uebertragen;
		    $tmp_dbh->commit;

		    if ($neu_uebertragen || $veraendert) {
			my $cfg = cfg_datei_parsen("$dateiname.cfg");
			my $fahrer_nach_startnummer = dat_datei_parsen("$dateiname.dat", $nur_fahrer);
			neue_startnummern_von_fahrern $cfg, $fahrer_nach_startnummer;
			$cfg->{punkteteilung} = $punkteteilung;
			rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer, $cfg;

			$tmp_dbh->begin_work;
			my $tmp_id;
			$tmp_id = veranstaltung_umnummerieren $tmp_dbh, $id
			    if defined $id;
			$cfg->{cfg_mtime} = $cfg_mtime;
			$cfg->{dat_mtime} = $dat_mtime;
			$cfg->{aktiv} = $aktiv;
			$cfg->{vareihen} = $vareihe;
			features_aktualisieren $cfg, $features;
			$id = in_datenbank_schreiben $tmp_dbh, $id, $basename,
						     $fahrer_nach_startnummer,
						     $cfg;

			print "\n";
			eval {
			    $dbh->begin_work;
			    veranstaltung_loeschen $dbh, $id, 0
				if $neu_uebertragen;
			    tabellen_aktualisieren $tmp_dbh, $dbh, $id,
				defined $tmp_id ? $tmp_id : $id + 1;
			    commit_or_rollback $dbh;
			};
			if ($@) {
			    $tmp_dbh->rollback;
			    die $@;
			};
			veranstaltung_loeschen $tmp_dbh, $tmp_id, 1
			    if defined $tmp_id;
			commit_or_rollback $tmp_dbh;
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
	warn $@;
	if ($@ =~ /Duplicate entry .* for key/) {
	    # Der Datenstand am Server scheint nicht mehr mit dem lokal
	    # zwischengespeicherten Datenstand übereinzustimmen.
	    # Reparaturversuch über Neuübertragung der Daten vom Server.
	    undef $tmp_dbh;
	}
    }
    if ($reconnect_interval) {
	print "Waiting for $reconnect_interval seconds...\n";
	sleep $reconnect_interval;
	print "\n";
    }
} while ($reconnect_interval);
