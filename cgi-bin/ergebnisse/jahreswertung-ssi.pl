#! /usr/bin/perl -w -I../../trial-toolkit

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
use CGI;
#use CGI::Carp qw(warningsToBrowser fatalsToBrowser);
use DBI;
use RenderOutput;
use Wertungen;
use Datenbank;
use TrialToolkit;
use strict;

binmode STDOUT, ':encoding(utf8)';
$RenderOutput::html = 1;

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $vareihe = $q->param('vareihe');
my @klassen = $q->param('klasse');

my @spalten = $q->param('spalte');

map {
    /^(club|fahrzeug|lizenznummer|bewerber|geburtsdatum|bundesland|land|lbl)$/
	or die die "Invalid column name\n";
} @spalten;

my @db_spalten = map { /^lbl$/ ? ('land', 'bundesland') : $_ } @spalten;

my $bezeichnung;
my $laeufe;
my $streichresultate;
my $wertung;
my $zeit;
my $fahrer_nach_startnummer;
my $klassenfarben;
my $sth;

print "Content-type: text/html; charset=utf-8\n\n";

$sth = $dbh->prepare(q{
    SELECT bezeichnung
    FROM vareihe
    WHERE vareihe = ?
});
$sth->execute($vareihe);
if (my @row =  $sth->fetchrow_array) {
    ($bezeichnung) = @row;
} else {
    doc_h2 "Veranstaltungsreihe nicht gefunden.\n";
    exit;
}

my $veranstaltungen_reihenfolge = [];

$sth = $dbh->prepare(q{
    SELECT id, datum, wertung, titel, subtitel, dat_mtime, cfg_mtime, punkteteilung
    FROM wertung
    JOIN vareihe_veranstaltung USING (id)
    JOIN vareihe USING (vareihe, wertung)
    JOIN veranstaltung USING (id)
    WHERE aktiv AND vareihe = ?
    ORDER BY datum
});
$sth->execute($vareihe);
my $veranstaltungen;
my $n = 1;
while (my @row = $sth->fetchrow_array) {
    my $cfg;
    my $id = $row[0];
    $wertung = $row[2];
    $cfg->{id} = $id;
    if ($row[1] =~ /^(\d{4})-0*(\d+)-0*(\d+)$/) {
	$cfg->{label} = "$3.<br>$2.";
	$cfg->{label2} = "$3.$2.";
    } else {
	$cfg->{label} = $n;
    }
    $n++;
    $cfg->{titel}[$wertung - 1] = $row[3];
    $cfg->{subtitel}[$wertung - 1] = $row[4];
    $veranstaltungen->{$id}{cfg} = $cfg;
    $zeit = max_time($zeit, $row[5]);
    $zeit = max_time($zeit, $row[6]);
    $cfg->{punkteteilung} = $row[7];
    push @$veranstaltungen_reihenfolge, $row[0];
}

$sth = $dbh->prepare(q{
    SELECT id, klasse, startnummer,
	   CASE WHEN definiert THEN neue_startnummer ELSE startnummer END as neue_startnummer,
	   vorname, nachname,
	   wertungspunkte, wertungsrang
    } . ( @db_spalten ? ", " . join(", ", @db_spalten) : "") . q{
    FROM fahrer_wertung
    JOIN fahrer USING (id, startnummer)
    JOIN vareihe_veranstaltung USING (id)
    /* JOIN vareihe USING (vareihe) */
    JOIN vareihe_klasse USING (vareihe, klasse)
    LEFT JOIN (SELECT *, 1 AS definiert FROM neue_startnummer) AS neue_startnummer USING (id, startnummer)
    JOIN veranstaltung USING (id)
    WHERE aktiv AND vareihe = ?
});
$sth->execute($vareihe);
while (my $fahrer = $sth->fetchrow_hashref) {
    my $id = $fahrer->{id};
    delete $fahrer->{id};

    my $wertungspunkte = $fahrer->{wertungspunkte};
    $fahrer->{wertungspunkte} = [];
    $fahrer->{wertungspunkte}[$wertung - 1] = $wertungspunkte;

    my $wertungsrang = $fahrer->{wertungsrang};
    $fahrer->{wertungsrang} = [];
    $fahrer->{wertungsrang}[$wertung - 1] = $wertungsrang;

    delete $fahrer->{neue_startnummer}
	if defined $fahrer->{neue_startnummer} &&
	   $fahrer->{startnummer} == $fahrer->{neue_startnummer};

    my $startnummer = $fahrer->{startnummer};
    $veranstaltungen->{$id}{fahrer}{$startnummer} = $fahrer;
}

foreach my $id (keys %$veranstaltungen) {
    delete $veranstaltungen->{$id}
	unless exists $veranstaltungen->{$id}{fahrer};
}

unless (%$veranstaltungen) {
    doc_p "Für diese Veranstaltungreihe sind keine Ergebnisse vorhanden.";
    exit;
}

$veranstaltungen = [ map { [ $veranstaltungen->{$_}{cfg},
			     $veranstaltungen->{$_}{fahrer} ] }
			 @$veranstaltungen_reihenfolge ];

my $letzte_cfg = $veranstaltungen->[@$veranstaltungen - 1][0];

$sth = $dbh->prepare(q{
    SELECT klasse, bezeichnung, farbe, laeufe, streichresultate
    FROM klasse
    JOIN vareihe_klasse USING (klasse)
    WHERE vareihe = ? AND id = ?
});
$sth->execute($vareihe, $letzte_cfg->{id});
while (my @row = $sth->fetchrow_array) {
    $letzte_cfg->{klassen}[$row[0] - 1] = $row[1];
    $klassenfarben->{$row[0]} = $row[2]
	if defined $row[2];
    $laeufe->{$row[0]} = $row[3];
    $streichresultate->{$row[0]} = $row[4];
}

$sth = $dbh->prepare(q{
    SELECT bezeichnung
    FROM wertung
    WHERE id = ? AND wertung = ?
});
$sth->execute($letzte_cfg->{id}, $wertung);
if (my @row = $sth->fetchrow_array) {
    $letzte_cfg->{wertungen}[$wertung - 1] = $row[0];
}

doc_h1 "$bezeichnung";
doc_h2 "Jahreswertung";
jahreswertung veranstaltungen => $veranstaltungen,
	      wertung => $wertung,
	      laeufe_gesamt => $laeufe,
	      streichresultate => $streichresultate,
	      $klassenfarben ? (klassenfarben => $klassenfarben) : (),
	      spalten => [ @spalten ],
	      nach_relevanz => 1,
	      @klassen ? (klassen => \@klassen ) : ();

print "<p>Letzte Änderung: $zeit</p>\n";
