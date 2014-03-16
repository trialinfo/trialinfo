#! /usr/bin/perl -w -I../../lib

# Copyright 2012-2014  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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
use CGI;
#use CGI::Carp qw(warningsToBrowser fatalsToBrowser);
use DBI;
use RenderOutput;
use Wertungen;
use Datenbank;
use Auswertung;
use strict;

binmode STDOUT, ':encoding(utf8)';
$RenderOutput::html = 1;

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

trace_sql $dbh, 2, \*STDERR
  if $cgi_verbose;

my $q = CGI->new;
my $id = $q->param('id'); # veranstaltung
my $vareihe = $q->param('vareihe');
my $animiert = defined $q->param('animiert');
my $wertung = $q->param('wertung') || 1;
my @klassen = $q->param('klasse');

my @spalten =  $q->param('spalte');
map {
    /^(club|fahrzeug|lizenznummer|bewerber|geburtsdatum|bundesland|land|lbl)$/
	or die "Invalid column name\n";
} @spalten;

my @db_spalten = map { /^lbl$/ ? ('land', 'bundesland') : $_ } @spalten;

my $bezeichnung;
my $zeit;
my $cfg;
my $fahrer_nach_startnummer;
my $sth;
my $klassenfarben;
my $alle_punkte = 1;  # Punkte in den Sektionen als ToolTip
my $nach_relevanz = 1;  # Rundenergebnis und Statistik ausgrauen, wenn für Ergebnis egal

print "Content-type: text/html; charset=utf-8\n\n";

if (defined $vareihe) {
    $sth = $dbh->prepare(q{
	SELECT id, vareihe.bezeichnung, wertung, titel, dat_mtime, cfg_mtime,
	       wertungsmodus, vierpunktewertung, punkteteilung
	FROM wertung
	JOIN vareihe_veranstaltung USING (id)
	JOIN vareihe USING (vareihe, wertung)
	JOIN veranstaltung USING (id)
	WHERE id = ? AND vareihe = ?
    });
    $sth->execute($id, $vareihe);
} elsif (defined $id) {
    $sth = $dbh->prepare(q{
	SELECT id, NULL, wertung, titel, dat_mtime, cfg_mtime,
	       wertungsmodus, vierpunktewertung, punkteteilung
	FROM wertung
	JOIN veranstaltung USING (id)
	WHERE id = ? AND wertung = ?
    });
    $sth->execute($id, $wertung);
} else {
    # FIXME: Stattdessen eine Liste der Veranstaltungen; Parameter
    # durchschleifen. Veranstalter-Link zu animiertem Ergebnis?
    $sth = $dbh->prepare(q{
	SELECT id, NULL, wertung, titel, mtime,
	       wertungsmodus, vierpunktewertung, punkteteilung
	FROM wertung
	JOIN veranstaltung USING (id)
	WHERE wertung = ?
        ORDER BY datum DESC
	LIMIT 1
    });
    $sth->execute($wertung);
}
if (my @row = $sth->fetchrow_array) {
    $id = $row[0];
    $bezeichnung = $row[1];
    $wertung = $row[2];
    $cfg->{wertungen}[$wertung - 1] = { titel => $row[3] };
    $zeit = $row[4];
    $cfg->{wertungsmodus} = $row[6];
    $cfg->{vierpunktewertung} = $row[7];
    $cfg->{punkteteilung} = $row[8];
}

unless (defined $cfg) {
    doc_h2 "Veranstaltung nicht gefunden.";
    exit;
}

if (defined $vareihe) {
    $sth = $dbh->prepare(q{
	SELECT klasse, runden, bezeichnung, farbe, wertungsklasse
	FROM klasse
	JOIN vareihe_klasse USING (wertungsklasse)
	WHERE id = ? AND vareihe = ?
	ORDER BY klasse
    });
    $sth->execute($id, $vareihe);
} else {
    $sth = $dbh->prepare(q{
	SELECT klasse, runden, bezeichnung, farbe, wertungsklasse
	FROM klasse
	WHERE id = ?
	ORDER BY klasse
    });
    $sth->execute($id);
}
while (my $row = $sth->fetchrow_hashref) {
    my $klasse = $row->{klasse};
    delete $row->{klasse};
    $cfg->{klassen}[$klasse - 1] = $row;
}

$sth = $dbh->prepare(q{
    SELECT klasse, } . ($wertung == 1 ? "rang" : "wertungsrang AS rang") . ", " . q{
	   startnummer, nachname, vorname, zusatzpunkte,
	   } . ( @db_spalten ? join(", ", @db_spalten) . ", " : "") . q{
	   s0, s1, s2, s3, s4, s5, punkte, wertungspunkte, fahrer.runden AS
	   runden, ausser_konkurrenz, ausfall, start
    FROM fahrer} . (defined $vareihe ? q{
    JOIN klasse USING (id, klasse)
    JOIN vareihe_klasse USING (wertungsklasse)} : "") . "\n" .
    ($wertung == 1 ? "LEFT JOIN" : "JOIN") . " " .
    q{(SELECT * FROM fahrer_wertung WHERE wertung = ?) AS fahrer_wertung USING (id, startnummer)
    WHERE start AND id = ?} . (defined $vareihe ? " AND vareihe = ?" : ""));
$sth->execute($wertung, $id, defined $vareihe ? $vareihe : ());
while (my $fahrer = $sth->fetchrow_hashref) {
    for (my $n = 0; $n <= 5; $n++) {
	$fahrer->{punkteverteilung}[$n] = $fahrer->{"s$n"};
	delete $fahrer->{"s$n"};
    }
    my $startnummer = $fahrer->{startnummer};
    $fahrer->{wertungen} = [];
    $fahrer->{wertungen}[$wertung - 1] = { punkte => $fahrer->{wertungspunkte} }
	if defined $fahrer->{wertungspunkte};
    $fahrer_nach_startnummer->{$startnummer} = $fahrer;
}

if (defined $vareihe) {
    $sth = $dbh->prepare(q{
	SELECT startnummer, runde, runde.punkte
	FROM runde
	JOIN fahrer USING (id, startnummer)
	JOIN klasse USING (id, klasse)
	JOIN vareihe_veranstaltung USING (id)
	JOIN vareihe_klasse USING (vareihe, wertungsklasse)
	WHERE id = ? and vareihe = ?
    });
    $sth->execute($id, $vareihe);
} else {
    $sth = $dbh->prepare(q{
	SELECT startnummer, runde, runde.punkte
	FROM runde
	JOIN fahrer USING (id, startnummer)
	WHERE id = ?
    });
    $sth->execute($id);
}
while (my @row = $sth->fetchrow_array) {
    my $fahrer = $fahrer_nach_startnummer->{$row[0]};
    $fahrer->{punkte_pro_runde}[$row[1] - 1] = $row[2];
}

if ($alle_punkte) {
    $sth = $dbh->prepare(q{
	SELECT klasse, sektion
	FROM sektion
	WHERE id = ?
	ORDER BY sektion
    });
    $sth->execute($id);
    my $sektionen;
    while (my @row = $sth->fetchrow_array) {
	push @{$sektionen->[$row[0] - 1]}, $row[1];
    }
    $cfg->{sektionen} = $sektionen;

    if (defined $vareihe) {
	$sth = $dbh->prepare(q{
	    SELECT startnummer, runde, sektion, punkte.punkte
	    FROM vareihe_klasse
	    JOIN klasse USING (wertungsklasse)
	    JOIN fahrer USING (id, klasse)
	    JOIN punkte USING (id, startnummer)
	    WHERE id = ? AND vareihe = ?
	});
	$sth->execute($id, $vareihe);
    } else {
	$sth = $dbh->prepare(q{
	    SELECT startnummer, runde, sektion, punkte.punkte
	    FROM fahrer
	    JOIN punkte USING (id, startnummer)
	    WHERE id = ?
	});
	$sth->execute($id);
    }
    while (my @row = $sth->fetchrow_array) {
	$fahrer_nach_startnummer->{$row[0]}
				  {punkte_pro_sektion}
				  [$row[1] - 1]
				  [$row[2] - 1] = $row[3]
	    if exists $fahrer_nach_startnummer->{$row[0]};
    }
}

#use Data::Dumper;
#print Dumper($cfg, $fahrer_nach_startnummer);

unless ($animiert) {
    doc_h1 "$bezeichnung"
	if defined $bezeichnung;
    doc_h2 "$cfg->{wertungen}[$wertung - 1]{titel}";
} else {
    if (defined $bezeichnung) {
	doc_h2 "$bezeichnung – $cfg->{wertungen}[$wertung - 1]{titel}";
    } else {
	doc_h2 "$cfg->{wertungen}[$wertung - 1]{titel}";
    }
}

tageswertung cfg => $cfg,
	     fahrer_nach_startnummer => $fahrer_nach_startnummer,
	     wertung => $wertung,
	     spalten => [ @spalten ],
	     $klassenfarben ? (klassenfarben => $klassenfarben) : (),
	     alle_punkte => $alle_punkte,
	     nach_relevanz => $nach_relevanz,
	     @klassen ? (klassen => \@klassen) : (),
	     statistik_gesamt => !$animiert,
	     statistik_pro_klasse => $animiert;

print "<p>Letzte Änderung: $zeit</p>\n"
    unless $animiert;
