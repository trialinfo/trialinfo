#! /usr/bin/perl -w -I..

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

use CGI;
use DBI;
use RenderOutput;
use Wertungen qw(jahreswertung);
use strict;

$RenderOutput::html = 1;

my $database = 'mysql:mydb;mysql_enable_utf8=1';
my $username = 'auswertung';
my $password = '3tAw4oSs';

# club fahrzeug lizenznummer geburtsdatum
my $spalten = undef; # [ 'fahrzeug' ]

my $dbh = DBI->connect("DBI:$database", $username, $password)
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $wereihe = $q->param('wertungsreihe');

my $bezeichnung;
my $vareihe;
my $streichresultate;
my $wertung;
my $fahrer_nach_startnummer;
my $sth;

print "Content-type: text/html; charset=utf-8\n\n";

$sth = $dbh->prepare(q{
    SELECT vareihe, bezeichnung
    FROM wereihe
    WHERE wereihe = ?
});
$sth->execute($wereihe);
if (my @row =  $sth->fetchrow_array) {
    ($vareihe, $bezeichnung) = @row;
} else {
    doc_h1 "Wertungsreihe nicht gefunden.\n";
    exit;
}

$sth = $dbh->prepare(q{
    SELECT klasse, streichresultate
    FROM wereihe_klasse
    WHERE wereihe = ?
});
$sth->execute($wereihe);
while (my @row = $sth->fetchrow_array) {
    $streichresultate->[$row[0] - 1] = $row[1];
}

$sth = $dbh->prepare(q{
    SELECT id, wertung, titel, subtitel
    FROM wertung
    JOIN vareihe_veranstaltung USING (id)
    JOIN wereihe USING (vareihe, wertung)
    WHERE wereihe = ?
});
$sth->execute($wereihe);
my $veranstaltungen;
while (my @row = $sth->fetchrow_array) {
    my $cfg;
    my $id = $row[0];
    $wertung = $row[1] - 1;
    $cfg->{id} = $id;
    $cfg->{titel}[$wertung] = $row[2];
    $cfg->{subtitel}[$wertung] = $row[3];
    $veranstaltungen->{$id}{cfg} = $cfg;
}

$sth = $dbh->prepare(q{
    SELECT id, klasse, startnummer, vorname, nachname, wertungspunkte
    } . ( $spalten ? ", " . join(", ", @$spalten) : "") . q{
    FROM fahrer_wertung
    JOIN fahrer USING (id, startnummer)
    JOIN vareihe_veranstaltung USING (id)
    JOIN wereihe USING (vareihe)
    JOIN wereihe_klasse USING (wereihe, klasse)
    WHERE wereihe = ?;
});
$sth->execute($wereihe);
while (my $fahrer = $sth->fetchrow_hashref) {
    my $id = $fahrer->{id};
    delete $fahrer->{id};
    my $wertungspunkte = $fahrer->{wertungspunkte};
    $fahrer->{wertungspunkte} = [];
    $fahrer->{wertungspunkte}[$wertung] = $wertungspunkte;
    my $startnummer = $fahrer->{startnummer};
    $veranstaltungen->{$id}{fahrer}{$startnummer} = $fahrer;
}

foreach my $id (keys %$veranstaltungen) {
    delete $veranstaltungen->{$id}
	unless exists $veranstaltungen->{$id}{fahrer};
}

$veranstaltungen = [ map { [ $_->{cfg}, $_->{fahrer} ] }
			 sort { $a->{cfg}{id} <=> $b->{cfg}{id} }
			      values %$veranstaltungen ];

my $letzte_cfg = $veranstaltungen->[@$veranstaltungen - 1][0];

$sth = $dbh->prepare(q{
    SELECT klasse, bezeichnung
    FROM klasse
    JOIN wereihe_klasse USING (klasse)
    WHERE wereihe = ? AND id = ?
});
$sth->execute($wereihe, $letzte_cfg->{id});
while (my @row = $sth->fetchrow_array) {
    $letzte_cfg->{klassen}[$row[0] - 1] = $row[1];
}

$sth = $dbh->prepare(q{
    SELECT bezeichnung
    FROM wertung
    WHERE id = ? AND wertung = ?
});
$sth->execute($letzte_cfg->{id}, $wertung + 1);
if (my @row = $sth->fetchrow_array) {
    $letzte_cfg->{wertungen}[$wertung] = $row[0];
}

doc_h1 "$bezeichnung";
doc_h2 "Jahreswertung";
jahreswertung $veranstaltungen, $wertung, $streichresultate, $spalten;
