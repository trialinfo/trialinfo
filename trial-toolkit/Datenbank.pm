# Trialtool: Datenbankfunktionen

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

package Datenbank;

use Encode qw(_utf8_on);
use POSIX qw(mktime);

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(cfg_aus_datenbank fahrer_aus_datenbank db_utf8 force_utf8_on);

sub cfg_aus_datenbank($$;$$) {
    my ($dbh, $id, $cfg_mtime, $dat_mtime) = @_;
    my $cfg;

    my $sth = $dbh->prepare(q{
	SELECT vierpunktewertung, wertungsmodus, punkte_sektion_auslassen,
	       wertungspunkte_234, rand_links, rand_oben,
	       wertungspunkte_markiert, versicherung, ergebnislistenbreite,
	       ergebnisliste_feld, dat_mtime, cfg_mtime
	FROM veranstaltung
	WHERE id = ?
    });
    $sth->execute($id);
    unless ($cfg = $sth->fetchrow_hashref) {
	return undef;
    }

    my $re = '^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$';
    if (defined $cfg_mtime && $cfg->{cfg_mtime} =~ $re) {
	$$cfg_mtime = mktime($6, $5, $4, $3, $2 - 1, $1 - 1900);
    }
    delete $cfg->{cfg_mtime};
    if (defined $dat_mtime && $cfg->{dat_mtime} =~ $re) {
	$$dat_mtime = mktime($6, $5, $4, $3, $2 - 1, $1 - 1900);
    }
    delete $cfg->{dat_mtime};

    $sth = $dbh->prepare(q{
	SELECT wertung, titel, subtitel, bezeichnung
	FROM wertung
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	my $n = $row[0] - 1;
	$cfg->{titel}[$n] = $row[1];
	$cfg->{subtitel}[$n] = $row[2];
	$cfg->{wertungen}[$n] = $row[3];
    }

    $sth = $dbh->prepare(q{
	SELECT klasse, bezeichnung, fahrzeit, runden
	FROM klasse
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	my $n = $row[0] - 1;
	$cfg->{klassen}[$n] = $row[1];
	$cfg->{fahrzeiten}[$n] = $row[2];
	$cfg->{runden}[$n] = $row[3];
    }

    $cfg->{sektionen} = [];
    for (my $n = 0; $n < 15; $n++) {
	push @{$cfg->{sektionen}}, 'N' x 15;
    }
    $sth = $dbh->prepare(q{
	SELECT klasse, sektion
	FROM sektion
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	substr($cfg->{sektionen}[$row[0] - 1], $row[1] - 1, 1) = 'J';
    }

    $sth = $dbh->prepare(q{
	SELECT runde, farbe
	FROM kartenfarbe
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	$cfg->{kartenfarben}[$row[0] - 1] = $row[1];
    }

    $sth = $dbh->prepare(q{
	SELECT rang, punkte
	FROM wertungspunkte
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	$cfg->{wertungspunkte}[$row[0] - 1] = $row[1];
    }
    push @{$cfg->{wertungspunkte}}, 0
	unless @{$cfg->{wertungspunkte}};

    $sth = $dbh->prepare(q{
	SELECT feature
	FROM veranstaltung_feature
	WHERE id = ?
    });
    $sth->execute($id);
    $cfg->{nennungsmaske_felder} = [];
    while (my @row = $sth->fetchrow_array) {
	push @{$cfg->{nennungsmaske_felder}}, $row[0];
    }
    return $cfg;
}

sub fahrer_aus_datenbank($$) {
    my ($dbh, $id) = @_;
    my $fahrer_nach_startnummer;

    my $sth = $dbh->prepare(q{
	SELECT startnummer, klasse, helfer, nenngeld, bewerber, nachname,
	       vorname, strasse, wohnort, plz, club, fahrzeug, geburtsdatum,
	       telefon, lizenznummer, rahmennummer, kennzeichen, hubraum,
	       bemerkung, bundesland, land, helfer_nummer, startzeit, zielzeit,
	       stechen, papierabnahme, versicherung, runden, zusatzpunkte,
	       punkte, ausfall, nennungseingang
	FROM fahrer
	WHERE id = ?
    });
    $sth->execute($id);
    while (my $fahrer = $sth->fetchrow_hashref) {
	my $startnummer = $fahrer->{startnummer};
	$fahrer_nach_startnummer->{$startnummer} = $fahrer;
    }

    $sth = $dbh->prepare(q{
	SELECT startnummer, runde, sektion, punkte
	FROM punkte
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	my $startnummer = $row[0];
	$fahrer_nach_startnummer->{$startnummer}{punkte_pro_sektion}
	    [$row[1] - 1][$row[2] - 1] = $row[3];
	$fahrer_nach_startnummer->{$startnummer}{punkte_pro_runde}
	    [$row[1] - 1] += $row[3];
	if ($row[3] < 5) {
	    $fahrer_nach_startnummer->{$startnummer}{s}
		[$row[3]]++;
	}
    }

    $sth = $dbh->prepare(q{
	SELECT startnummer, wertung
	FROM fahrer_wertung
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	my $startnummer = $row[0];
	$fahrer_nach_startnummer->{$startnummer}{wertungen}
	    [$row[1] - 1] = 1;
    }
    return $fahrer_nach_startnummer;
}

sub db_utf8($) {
    my ($database) = @_;

    if ($database =~ /^(DBI:)?mysql:/) {
	return mysql_enable_utf8 => 1;
    } elsif ($database = ~ /^(DBI:)?SQLite:/) {
	return sqlite_unicode => 1;
    }
    return ();
}

# DBI seems to leave the utf8 flags of some strings like $sth->{NAME} and
# $sth->{NAME_lc} turned off by accident even if the database (MySQL) is
# configured to use utf8.  Fix this up.
sub force_utf8_on(@) {
    my @l = @_;
    map { _utf8_on  $_ } @l;
    return @l;
}
