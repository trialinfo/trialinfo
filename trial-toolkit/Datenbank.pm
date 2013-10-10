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
use DBI qw(looks_like_number);
use Storable qw(dclone);
use Wertungen;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(cfg_aus_datenbank fahrer_aus_datenbank wertung_aus_datenbank
	     db_utf8 force_utf8_on sql_value log_sql_statement trace_sql);
use strict;

sub wertungspunkte_aus_datenbank($$) {
    my ($dbh, $id) = @_;
    my $wertungspunkte = [];

    my $sth = $dbh->prepare(q{
	SELECT rang, punkte
	FROM wertungspunkte
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	$wertungspunkte->[$row[0] - 1] = $row[1];
    }
    return $wertungspunkte;
}

sub sektionen_aus_datenbank($$) {
    my ($dbh, $id) = @_;
    my $sektionen = [];

    for (my $n = 0; $n < 15; $n++) {
	push @$sektionen, 'N' x 15;
    }
    my $sth = $dbh->prepare(q{
	SELECT klasse, sektion
	FROM sektion
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	substr($sektionen->[$row[0] - 1], $row[1] - 1, 1) = 'J';
    }
    return $sektionen;
}

sub cfg_aus_datenbank($$) {
    my ($dbh, $id) = @_;
    my $cfg;

    my $sth = $dbh->prepare(q{
	SELECT version, dateiname, datum, aktiv, vierpunktewertung, wertungsmodus,
	       punkte_sektion_auslassen, wertungspunkte_234, rand_links,
	       rand_oben, wertung1_markiert, versicherung,
	       ergebnislistenbreite, ergebnisliste_feld, dat_mtime, cfg_mtime,
	       punkteteilung
	FROM veranstaltung
	WHERE id = ?
    });
    $sth->execute($id);
    unless ($cfg = $sth->fetchrow_hashref) {
	return undef;
    }

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
	SELECT klasse, bezeichnung, fahrzeit, runden, farbe
	FROM klasse
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	my $n = $row[0] - 1;
	$cfg->{klassen}[$n] = $row[1];
	$cfg->{fahrzeiten}[$n] = $row[2];
	$cfg->{runden}[$n] = $row[3];
	$cfg->{klassenfarben}[$n] = $row[4];
    }

    $cfg->{sektionen} = sektionen_aus_datenbank($dbh, $id);

    $sth = $dbh->prepare(q{
	SELECT runde, farbe
	FROM kartenfarbe
	WHERE id = ?
    });
    $sth->execute($id);
    $cfg->{kartenfarben} = [];
    while (my @row = $sth->fetchrow_array) {
	$cfg->{kartenfarben}[$row[0] - 1] = $row[1];
    }

    $cfg->{wertungspunkte} = wertungspunkte_aus_datenbank($dbh, $id);
    $cfg->{neue_startnummern} = neue_startnummern_aus_datenbank($dbh, $id);

    $sth = $dbh->prepare(q{
	SELECT feature
	FROM veranstaltung_feature
	WHERE id = ?
    });
    $sth->execute($id);
    $cfg->{features} = [];
    while (my @row = $sth->fetchrow_array) {
	push @{$cfg->{features}}, $row[0];
    }

    $sth = $dbh->prepare(q{
	SELECT vareihe
	FROM vareihe_veranstaltung
	WHERE id = ?
    });
    $sth->execute($id);
    $cfg->{vareihen} = [];
    while (my @row = $sth->fetchrow_array) {
	push @{$cfg->{vareihen}}, $row[0];
    }

    return $cfg;
}

sub fahrer_wertungen_aus_datenbank($$$) {
    my ($dbh, $id, $fahrer_nach_startnummer) = @_;

    my $sth = $dbh->prepare(q{
	SELECT startnummer, wertung, wertungsrang, wertungspunkte
	FROM fahrer_wertung
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	my $startnummer = $row[0];
	my $fahrer = \$fahrer_nach_startnummer->{$startnummer};
	$$fahrer->{startnummer} = $startnummer;
	$$fahrer->{wertungen}[$row[1] - 1] = 1;
	$$fahrer->{wertungsrang}[$row[1] - 1] = $row[2];
	$$fahrer->{wertungspunkte}[$row[1] - 1] = $row[3];
    }
}

sub punkte_aus_datenbank($$$) {
    my ($dbh, $id, $fahrer_nach_startnummer) = @_;

    my $sth = $dbh->prepare(q{
	SELECT startnummer, runde, sektion, punkte
	FROM punkte
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	my $startnummer = $row[0];
	my $fahrer = \$fahrer_nach_startnummer->{$startnummer};
	$$fahrer->{startnummer} = $startnummer;
	$$fahrer->{punkte_pro_sektion}[$row[1] - 1][$row[2] - 1] = $row[3];
    }
}

sub runden_aus_datenbank($$$) {
    my ($dbh, $id, $fahrer_nach_startnummer) = @_;

    my $sth = $dbh->prepare(q{
	SELECT startnummer, runde, punkte
	FROM runde
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	my $startnummer = $row[0];
	my $fahrer = \$fahrer_nach_startnummer->{$startnummer};
	$$fahrer->{startnummer} = $startnummer;
	$$fahrer->{punkte_pro_runde}[$row[1] - 1] = $row[2];
    }
}

sub neue_startnummern_aus_datenbank($$$) {
    my ($dbh, $id, $cfg) = @_;

    my $sth = $dbh->prepare(q{
	SELECT startnummer, neue_startnummer
	FROM neue_startnummer
	WHERE id = ?
    });
    $sth->execute($id);
    my $neue_startnummern = {};
    while (my @row = $sth->fetchrow_array) {
	$neue_startnummern->{$row[0]} = $row[1]
	    unless $row[0] ~~ $row[1];
    }
    return $neue_startnummern;
}

sub punkteverteilung_umwandeln($) {
    my ($fahrer) = @_;
    my $s;
    for (my $n = 0; $n < 5; $n++) {
	push @$s, $fahrer->{"s$n"};
	delete $fahrer->{"s$n"};
    }
    $fahrer->{s} = $s;
}

sub fahrer_aus_datenbank($$) {
    my ($dbh, $id) = @_;
    my $fahrer_nach_startnummer;

    my $sth = $dbh->prepare(q{
	SELECT version, startnummer, klasse, helfer, nenngeld, bewerber, nachname,
	       vorname, strasse, wohnort, plz, club, fahrzeug, geburtsdatum,
	       telefon, lizenznummer, rahmennummer, kennzeichen, hubraum,
	       bemerkung, bundesland, land, helfer_nummer, startzeit, zielzeit,
	       stechen, papierabnahme, versicherung, runden, zusatzpunkte,
	       punkte, ausfall, nennungseingang, s0, s1, s2, s3, s4, rang
	FROM fahrer
	WHERE id = ?
    });
    $sth->execute($id);
    while (my $fahrer = $sth->fetchrow_hashref) {
	punkteverteilung_umwandeln $fahrer;
	my $startnummer = $fahrer->{startnummer};
	$fahrer_nach_startnummer->{$startnummer} = $fahrer;
    }

    punkte_aus_datenbank $dbh, $id, $fahrer_nach_startnummer;
    runden_aus_datenbank $dbh, $id, $fahrer_nach_startnummer;
    fahrer_wertungen_aus_datenbank $dbh, $id, $fahrer_nach_startnummer;

    return $fahrer_nach_startnummer;
}

sub wertung_aus_datenbank($$) {
    my ($dbh, $id) = @_;
    my $fahrer_nach_startnummer;

    my $sth = $dbh->prepare(q{
	SELECT startnummer, klasse, stechen, papierabnahme, ausfall,
	       zusatzpunkte, s0, s1, s2, s3, s4, punkte, runden, rang
	FROM fahrer
	WHERE id = ? /* and papierabnahme */
    });
    $sth->execute($id);
    while (my $fahrer = $sth->fetchrow_hashref) {
	punkteverteilung_umwandeln $fahrer;
	my $startnummer = $fahrer->{startnummer};
	$fahrer_nach_startnummer->{$startnummer} = $fahrer;
    }

    punkte_aus_datenbank $dbh, $id, $fahrer_nach_startnummer;
    runden_aus_datenbank $dbh, $id, $fahrer_nach_startnummer;
    fahrer_wertungen_aus_datenbank $dbh, $id, $fahrer_nach_startnummer;

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
    my ($fh, $statement, @bind_values) = @_;
    $statement =~ s/^\s*(.*?)\s*$/$1/s;
    $statement =~ s/^/    /mg;
    $statement =~ s/\?/sql_value shift @bind_values/ge;
    print $fh "$statement;\n";
}

sub trace_sql($$$) {
    my ($dbh, $trace_sql, $fh) = @_;

    $dbh->{Callbacks} = {
	ChildCallbacks => {
	    execute => sub {
		my ($sth, @bind_values) = @_;
		log_sql_statement $fh, $sth->{Statement}, @bind_values
		    if $sth->{Statement} !~ /^\s*SELECT/i || $trace_sql > 1;
		return;
	    },
	},
	do => sub {
	    my ($dbh, $statement, $attr, @bind_values) = @_;
	    log_sql_statement $fh, $statement, @bind_values
		    if $statement !~ /^\s*SELECT/i || $trace_sql > 1;
	    return;
	},
     };
}
