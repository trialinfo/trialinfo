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
use Tageswertung;
use Datenbank;
use Auswertung;
use Timestamp;
use strict;

binmode STDOUT, ':encoding(utf8)';
$RenderOutput::html = 1;

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

trace_sql $dbh, 2, \*STDERR
  if $cgi_verbose;

my $q = CGI->new;
my $id = $q->param('id'); # veranstaltung
my $wertung = $q->param('wertung') || 1;
my @klassen = $q->param('klasse');

my $bezeichnung;
my $mtime;
my $cfg;
my $fahrer_nach_startnummer;
my $sth;
my $klassenfarben;
my $alle_punkte = 1;  # Punkte in den Sektionen als ToolTip
my $nach_relevanz = 1;  # Rundenergebnis und Statistik ausgrauen, wenn für Ergebnis egal

print "Content-type: text/html; charset=utf-8\n\n";

$sth = $dbh->prepare(q{
    SELECT id, NULL, ranking, title, date, mtime,
	   equal_marks_resolution, four_marks, split_score
    FROM rankings
    JOIN events USING (id)
    WHERE id = ? AND ranking = ?
});
$sth->execute($id, $wertung);
if (my @row = $sth->fetchrow_array) {
    $id = $row[0];
    $bezeichnung = $row[1];
    $wertung = $row[2];
    $cfg->{wertungen}[$wertung - 1] = { titel => $row[3] };
    $mtime = $row[5]
	if !defined($row[4]) || same_day($row[4]);
    $cfg->{wertungsmodus} = $row[6];
    $cfg->{vierpunktewertung} = $row[7];
    $cfg->{punkteteilung} = $row[8];
}

unless (defined $cfg) {
    doc_h2 "Veranstaltung nicht gefunden.";
    exit;
}

my $features;
$sth = $dbh->prepare(q{
    SELECT feature
    FROM event_features
    WHERE id = ?
});
$sth->execute($id);
while (my @row = $sth->fetchrow_array) {
    $features->{$features_map->{$row[0]}} = 1;
}

my @spalten;
foreach my $spalte ($q->param('spalte')) {
    $spalte =~ /^(club|fahrzeug|lizenznummer|bewerber|geburtsdatum|bundesland|land|lbl)$/
	or die "Invalid column name\n";
    if ($spalte eq 'lbl') {
	next unless $features->{land} || $features->{bundesland};
    } else {
	next unless $features->{$spalte};
    }
    push @spalten, $spalte;
}
my @db_spalten =
    map { "$spalten_map->{$_} AS $_" }
        map { /^lbl$/ ? ('land', 'bundesland') : $_ } @spalten;

$sth = $dbh->prepare(q{
    SELECT class AS klasse, rounds AS runden, name AS bezeichnung,
	   color AS farbe, ranking_class AS wertungsklasse,
	   non_competing AS ausser_konkurrenz
    FROM classes
    WHERE id = ?
    ORDER BY class
});
$sth->execute($id);
while (my $row = $sth->fetchrow_hashref) {
    my $klasse = $row->{klasse};
    delete $row->{klasse};
    $klassenfarben->{$klasse} = $row->{farbe}
	if defined $row->{farbe};
    $cfg->{klassen}[$klasse - 1] = $row;
}

$sth = $dbh->prepare(q{
    SELECT class AS klasse, } . ($wertung == 1 ? "riders.rank AS rang" : "rider_rankings.rank AS rang") . ", " . q{
	   number AS startnummer, last_name AS nachname, first_name AS vorname, additional_marks AS zusatzpunkte,
	   } . ( @db_spalten ? join(", ", @db_spalten) . ", " : "") . q{
	   s0, s1, s2, s3, s4, s5, marks AS punkte, score AS wertungspunkte, riders.rounds AS
	   runden, riders.non_competing AS ausser_konkurrenz, failure AS ausfall, start
    FROM riders} . "\n" .
    ($wertung == 1 ? "LEFT JOIN" : "JOIN") . " " .
    q{(SELECT * FROM rider_rankings WHERE ranking = ?) AS rider_rankings USING (id, number)
    WHERE id = ?} .
    ($features->{verifiziert} ? ' AND verified' : ''));
$sth->execute($wertung, $id);
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

$sth = $dbh->prepare(q{
    SELECT number, `round`, rounds.marks
    FROM rounds
    JOIN riders USING (id, number)
    WHERE id = ?
});
$sth->execute($id);
while (my @row = $sth->fetchrow_array) {
    my $fahrer = $fahrer_nach_startnummer->{$row[0]};
    $fahrer->{punkte_pro_runde}[$row[1] - 1] = $row[2]
      if $fahrer;
}

if ($alle_punkte) {
    $sth = $dbh->prepare(q{
	SELECT class, zone
	FROM zones
	WHERE id = ?
	ORDER BY zone
    });
    $sth->execute($id);
    my $sektionen;
    while (my @row = $sth->fetchrow_array) {
	push @{$sektionen->[$row[0] - 1]}, $row[1];
    }
    $cfg->{sektionen} = $sektionen;

    $sth = $dbh->prepare(q{
	SELECT number, `round`, zone, marks.marks
	FROM riders
	JOIN marks USING (id, number)
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	$fahrer_nach_startnummer->{$row[0]}
				  {punkte_pro_sektion}
				  [$row[1] - 1]
				  [$row[2] - 1] = $row[3]
	    if exists $fahrer_nach_startnummer->{$row[0]};
    }
}

doc_h1 "$bezeichnung"
    if defined $bezeichnung;
doc_h2 "$cfg->{wertungen}[$wertung - 1]{titel}";

tageswertung cfg => $cfg,
	     fahrer_nach_startnummer => $fahrer_nach_startnummer,
	     wertung => $wertung,
	     spalten => [ @spalten ],
	     $klassenfarben ? (klassenfarben => $klassenfarben) : (),
	     alle_punkte => $alle_punkte,
	     nach_relevanz => $nach_relevanz,
	     @klassen ? (klassen => \@klassen) : (),
	     statistik_gesamt => 1,
	     statistik_pro_klasse => 0,
	     features => $features;

print "<p>Letzte Änderung: $mtime</p>\n"
    if defined $mtime;
