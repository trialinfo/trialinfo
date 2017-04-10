DROP TABLE IF EXISTS riders;
ALTER TABLE fahrer
	RENAME riders,
	-- version INT NOT NULL DEFAULT 1,
	-- id INT,
	CHANGE startnummer `number` INT,
	CHANGE gruppe `group` BOOLEAN,
	CHANGE klasse class INT,
	CHANGE helfer minder INT,
	CHANGE bewerber applicant VARCHAR(40),
	CHANGE nenngeld entry_fee VARCHAR(10),
	CHANGE nachname last_name VARCHAR(30),
	CHANGE vorname first_name VARCHAR(30),
	ADD COLUMN guardian varchar(40) DEFAULT NULL AFTER first_name,
	CHANGE strasse street VARCHAR(30),
	CHANGE wohnort city VARCHAR(40),
	CHANGE plz zip VARCHAR(5),
	-- club VARCHAR(40),
	CHANGE fahrzeug vehicle VARCHAR(30),
	CHANGE geburtsdatum date_of_birth DATE,
	CHANGE telefon phone VARCHAR(20),
	ADD COLUMN emergency_phone varchar(20) DEFAULT NULL AFTER phone,
	CHANGE lizenznummer license VARCHAR(20),
	CHANGE rahmennummer frame_number VARCHAR(20),
	CHANGE kennzeichen registration VARCHAR(15),
	CHANGE hubraum displacement VARCHAR(10),
	-- email VARCHAR(60),
	CHANGE bemerkung `comment` VARCHAR(150),
	ADD COLUMN rider_comment varchar(150) DEFAULT NULL AFTER comment,
	CHANGE land country VARCHAR(15),
	CHANGE bundesland province VARCHAR(20),
	CHANGE helfer_nummer minding VARCHAR(8),
	CHANGE startzeit start_time TIME,
	CHANGE zielzeit finish_time TIME,
	CHANGE stechen tie_break INT DEFAULT 0,
	CHANGE nennungseingang registered BOOLEAN,
	-- start BOOLEAN,
	CHANGE start_morgen start_tomorrow BOOLEAN,
	CHANGE versicherung insurance INT,
	CHANGE runden rounds INT,
	-- s0 INT,
	-- s1 INT,
	-- s2 INT,
	-- s3 INT,
	-- s4 INT,
	-- s5 INT,
	CHANGE ausser_konkurrenz non_competing BOOLEAN,
	CHANGE ausfall failure INT DEFAULT 0,
	CHANGE zusatzpunkte additional_marks INT,
	CHANGE punkte marks INT,
	CHANGE rang rank INT,
	ADD COLUMN user_tag CHAR(16),
	ADD COLUMN verified BOOLEAN DEFAULT 1;

UPDATE riders
	SET country = NULL
	WHERE country = '';

DROP TABLE IF EXISTS riders_groups;
ALTER TABLE fahrer_gruppe
	RENAME riders_groups,
	-- id INT,
	CHANGE gruppe_startnummer group_number INT,
	CHANGE startnummer number INT;

DROP TABLE IF EXISTS rider_rankings;
ALTER TABLE fahrer_wertung
	RENAME rider_rankings,
	-- id INT,
	CHANGE startnummer number INT,
	CHANGE wertung ranking INT,
	CHANGE wertungsrang rank INT,
	CHANGE wertungspunkte score REAL;

DROP TABLE IF EXISTS classes;
ALTER TABLE klasse
	RENAME classes,
	-- id INT,
	CHANGE klasse class INT,
	CHANGE runden rounds INT,
	CHANGE bezeichnung name VARCHAR(60),
	CHANGE gestartet started BOOLEAN,
	CHANGE farbe color VARCHAR(20),
	CHANGE fahrzeit riding_time TIME,
	CHANGE wertungsklasse ranking_class INT NOT NULL,
	CHANGE keine_wertung1 no_ranking1 BOOLEAN,
	CHANGE ausser_konkurrenz non_competing BOOLEAN;

DROP TABLE IF EXISTS marks;
ALTER TABLE punkte
	RENAME marks,
	-- id INT,
	CHANGE startnummer number INT,
	CHANGE runde `round` INT,
	CHANGE sektion zone INT,
	CHANGE punkte marks INT NOT NULL;

DROP TABLE IF EXISTS rounds;
ALTER TABLE runde
	RENAME rounds,
	-- id INT,
	CHANGE startnummer number INT,
	CHANGE runde `round` INT,
	CHANGE punkte marks INT NOT NULL;

DROP TABLE IF EXISTS zones;
ALTER TABLE sektion
	RENAME zones,
	-- id INT,
	CHANGE klasse class INT,
	CHANGE sektion zone INT;

DROP TABLE IF EXISTS skipped_zones;
ALTER TABLE sektion_aus_wertung
	RENAME skipped_zones,
	-- id INT,
	CHANGE klasse class INT,
	CHANGE runde `round` INT,
	CHANGE sektion zone INT;

DROP TABLE IF EXISTS events;
ALTER TABLE veranstaltung
	RENAME events,
	-- tag CHAR(16) NOT NULL,
	-- version INT NOT NULL DEFAULT 1,
	-- id INT,
	CHANGE basis base CHAR(16),
	CHANGE datum `date` DATE,
	-- mtime TIMESTAMP NULL,
	DROP COLUMN dateiname,
	CHANGE art `type` VARCHAR(20),
	CHANGE aktiv enabled BOOLEAN,
	CHANGE vierpunktewertung four_marks BOOLEAN,
	CHANGE wertungsmodus equal_marks_resolution INT,
	CHANGE punkteteilung split_score BOOLEAN,
	CHANGE punkte_sektion_auslassen marks_skipped_zone INT,
	CHANGE wertungspunkte_234 score_234 BOOLEAN,
	DROP COLUMN ergebnisliste_feld,
	CHANGE wertung1_markiert ranking1_enabled BOOLEAN,
	CHANGE versicherung insurance INT,
	DROP COLUMN rand_links,
	DROP COLUMN rand_oben,
	DROP COLUMN ergebnislistenbreite,
	DROP COLUMN sync_erlaubt,
	ADD COLUMN registration_ends TIMESTAMP NULL DEFAULT NULL,
	ADD COLUMN `registration_email` VARCHAR(60) NULL DEFAULT NULL;

DROP TABLE IF EXISTS event_features;
ALTER TABLE veranstaltung_feature
	RENAME event_features;
	-- id INT,
	-- feature VARCHAR(30),

DROP TABLE IF EXISTS card_colors;
ALTER TABLE kartenfarbe
	RENAME card_colors,
	CHANGE runde `round` INT,
	CHANGE farbe color VARCHAR(20);

DROP TABLE IF EXISTS rankings;
ALTER TABLE wertung
	RENAME rankings,
	-- id INT,
	CHANGE wertung ranking INT,
	CHANGE titel title VARCHAR(70),
	CHANGE subtitel subtitle VARCHAR(70),
	CHANGE bezeichnung name VARCHAR(20);

DROP TABLE IF EXISTS scores;
ALTER TABLE wertungspunkte
	RENAME scores,
	-- id INT,
	CHANGE rang rank INT,
	CHANGE punkte score INT NOT NULL;

DROP TABLE IF EXISTS new_numbers;
ALTER TABLE neue_startnummer
	RENAME new_numbers,
	CHANGE vareihe serie INT,
	-- id INT,
	CHANGE startnummer `number` INT,
	CHANGE neue_startnummer new_number INT;

DROP TABLE IF EXISTS series_events;
ALTER TABLE vareihe_veranstaltung
	RENAME series_events,
	CHANGE vareihe serie INT;
	-- id INT,

DROP TABLE IF EXISTS series;
ALTER TABLE vareihe
	RENAME series,
	-- tag CHAR(16) NOT NULL,
	-- version INT NOT NULL DEFAULT 1,
	CHANGE vareihe serie INT,
	CHANGE wertung ranking INT,
	CHANGE bezeichnung name VARCHAR(40),
	CHANGE kuerzel abbreviation VARCHAR(10),
	CHANGE abgeschlossen closed BOOL;

DROP TABLE IF EXISTS series_classes;
ALTER TABLE vareihe_klasse
	RENAME series_classes,
	CHANGE vareihe serie INT,
	CHANGE wertungsklasse ranking_class INT,
	CHANGE laeufe events INT,
	CHANGE streichresultate drop_events INT;

DROP TABLE IF EXISTS users;
ALTER TABLE benutzer
	RENAME users,
	CHANGE benutzer `user` INT,
	CHANGE name email VARCHAR(60) NOT NULL,
	ADD secret_expires TIMESTAMP NULL DEFAULT NULL AFTER password,
	ADD secret CHAR(16) AFTER password,
	ADD user_tag CHAR(16) NOT NULL AFTER password,
	CHANGE admin super_admin BOOLEAN NOT NULL DEFAULT '0',
	ADD COLUMN admin BOOLEAN NOT NULL DEFAULT '0' after secret_expires,
	CHANGE password password VARCHAR(40) NULL;
	-- admin BOOL,

UPDATE users
	SET admin = 1;

CREATE UNIQUE INDEX email ON users (email);

UPDATE users
	SET user_tag = REPLACE(REPLACE(SUBSTRING(TO_BASE64(SHA1(RAND())), 1, 16), '/', '_'), '+', '-')
	WHERE user_tag IS NULL OR user_tag = '';
CREATE UNIQUE INDEX user_tag ON users (user_tag);

DROP TABLE IF EXISTS groups;
ALTER TABLE gruppe
	RENAME groups,
	CHANGE gruppe `group` INT,
	CHANGE name groupname VARCHAR(30) NOT NULL;

DROP TABLE IF EXISTS events_admins_inherit;
CREATE TABLE events_admins_inherit (
	id INT,
	`user` INT,
	read_only BOOL,
	PRIMARY KEY (`id`,`user`,`read_only`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO events_admins_inherit
SELECT id, benutzer AS `user`, nur_lesen AS read_only
FROM veranstaltung_benutzer
WHERE vererben;

DROP TABLE IF EXISTS events_admins;
ALTER TABLE veranstaltung_benutzer
	RENAME events_admins,
	-- id INT,
	CHANGE benutzer `user` INT,
	CHANGE nur_lesen read_only BOOL,
	DROP vererben,
	DROP PRIMARY KEY,
	ADD PRIMARY KEY (id, user);

DROP TABLE IF EXISTS events_groups_inherit;
CREATE TABLE events_groups_inherit (
	id INT,
	`group` INT,
	read_only BOOL,
	PRIMARY KEY (`id`,`group`,`read_only`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO events_groups_inherit
SELECT id, gruppe AS `group`, nur_lesen AS read_only
FROM veranstaltung_gruppe
WHERE vererben;

DROP TABLE IF EXISTS events_groups;
ALTER TABLE veranstaltung_gruppe
	RENAME events_groups,
	-- id INT,
	CHANGE gruppe `group` INT,
	CHANGE nur_lesen read_only BOOL,
	DROP vererben;

DROP TABLE IF EXISTS series_admins;
ALTER TABLE vareihe_benutzer
	RENAME series_admins,
	CHANGE vareihe serie INT,
	CHANGE benutzer `user` INT,
	CHANGE nur_lesen read_only BOOL;

DROP TABLE IF EXISTS series_groups;
ALTER TABLE vareihe_gruppe
	RENAME series_groups,
	CHANGE vareihe serie INT,
	CHANGE gruppe `group` INT,
	CHANGE nur_lesen read_only BOOL;

DROP TABLE IF EXISTS admins_groups;
ALTER TABLE benutzer_gruppe
	RENAME admins_groups,
	CHANGE benutzer `user` INT,
	CHANGE gruppe `group` INT;

DROP VIEW IF EXISTS veranstaltung_alle_benutzer;
DROP VIEW IF EXISTS events_all_admins;
CREATE VIEW events_all_admins AS
  SELECT DISTINCT id, email, password, 0 AS read_only
  FROM events, users
  WHERE password IS NOT NULL AND admin AND super_admin
UNION
  SELECT id, email, password, read_only
  FROM events_admins
  JOIN users USING (`user`)
  WHERE password IS NOT NULL AND admin
UNION
  SELECT id, email, password, read_only
  FROM events_groups
  JOIN groups USING (`group`)
  JOIN admins_groups USING (`group`)
  JOIN users USING (`user`)
  WHERE password IS NOT NULL AND admin;

DROP VIEW IF EXISTS vareihe_alle_benutzer;
DROP VIEW IF EXISTS series_all_admins;
CREATE VIEW series_all_admins AS
  SELECT DISTINCT serie, email, password, 0 AS read_only
  FROM series, users
  WHERE password IS NOT NULL AND admin AND super_admin
UNION
  SELECT serie, email, password, read_only
  FROM series_admins
  JOIN users USING (`user`)
  WHERE password IS NOT NULL AND admin
UNION
  SELECT serie, email, password, read_only
  FROM series_groups
  JOIN groups USING (`group`)
  JOIN admins_groups USING (`group`)
  JOIN users USING (`user`)
  WHERE password IS NOT NULL AND admin;

UPDATE event_features SET feature = 'comment' WHERE feature = 'bemerkung';
-- email
UPDATE event_features SET feature = 'vehicle' WHERE feature = 'fahrzeug';
UPDATE event_features SET feature = 'date_of_birth' WHERE feature = 'geburtsdatum';
UPDATE event_features SET feature = 'displacement' WHERE feature = 'hubraum';
UPDATE event_features SET feature = 'class' WHERE feature = 'klasse';
UPDATE event_features SET feature = 'country' WHERE feature = 'land';
UPDATE event_features SET feature = 'license' WHERE feature = 'lizenznummer';
UPDATE event_features SET feature = 'last_name' WHERE feature = 'nachname';
UPDATE event_features SET feature = 'entry_fee' WHERE feature = 'nenngeld';
UPDATE event_features SET feature = 'new_numbers' WHERE feature = 'neue_startnummer';
UPDATE event_features SET feature = 'zip' WHERE feature = 'plz';
-- start
UPDATE event_features SET feature = 'number' WHERE feature = 'startnummer';
UPDATE event_features SET feature = 'street' WHERE feature = 'strasse';
UPDATE event_features SET feature = 'first_name' WHERE feature = 'vorname';
UPDATE event_features SET feature = 'ranking1' WHERE feature = 'wertung1';
UPDATE event_features SET feature = 'city' WHERE feature = 'wohnort';
-- club
UPDATE event_features SET feature = 'phone' WHERE feature = 'telefon';
UPDATE event_features SET feature = 'start_time' WHERE feature = 'startzeit';
UPDATE event_features SET feature = 'finish_time' WHERE feature = 'zielzeit';
UPDATE event_features SET feature = 'applicant' WHERE feature = 'bewerber';
UPDATE event_features SET feature = 'registration' WHERE feature = 'kennzeichen';
UPDATE event_features SET feature = 'frame_number' WHERE feature = 'rahmennummer';
UPDATE event_features SET feature = 'insurance' WHERE feature = 'versicherung';
UPDATE event_features SET feature = 'ranking2' WHERE feature = 'wertung2';
UPDATE event_features SET feature = 'ranking3' WHERE feature = 'wertung3';
UPDATE event_features SET feature = 'ranking4' WHERE feature = 'wertung4';
UPDATE event_features SET feature = 'province' WHERE feature = 'bundesland';
UPDATE event_features SET feature = 'start_tomorrow' WHERE feature = 'start_morgen';
UPDATE event_features SET feature = 'skipped_zones' WHERE feature = 'sektionen_aus_wertung';
