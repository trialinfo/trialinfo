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
use Datenbank;
use TrialToolkit;
use List::Util qw(max);
use strict;

sub summe(@) {
    my $summe = 0;
    foreach my $wert (@_) {
	$summe += $wert // 0;
    }
    return $summe;
}

binmode STDOUT, ':encoding(utf8)';
$RenderOutput::html = 1;

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $vareihe = $q->param('vareihe') // 1; # veranstaltungsreihe

my $sth;

print "Content-type: text/html; charset=utf-8\n\n";

my $vareihe_bezeichnung;
$sth = $dbh->prepare(q{
    SELECT bezeichnung
    FROM vareihe
    WHERE vareihe = ?
});
$sth->execute($vareihe);
if (my @row = $sth->fetchrow_array) {
    $vareihe_bezeichnung = $row[0];
} else {
    doc_h2 "Veranstaltungsreihe nicht gefunden.";
    exit;
}

doc_h1 "$vareihe_bezeichnung";

my $veranstaltungstitel;
$sth = $dbh->prepare(q{
    SELECT id, titel
    FROM veranstaltung
    JOIN wertung USING (id)
    JOIN vareihe_veranstaltung USING (id)
    WHERE wertung = 1 AND vareihe = ?
});
$sth->execute($vareihe);
while (my @row = $sth->fetchrow_array) {
    $veranstaltungstitel->{$row[0]} = $row[1];
}
my $titel_breite = 0;
foreach my $veranstaltungstitel (values %$veranstaltungstitel) {
    $titel_breite = max($titel_breite, length $veranstaltungstitel);
}

my $starter;
$sth = $dbh->prepare(q{
    SELECT id, klasse, count(*)
    FROM fahrer
    JOIN vareihe_veranstaltung USING (id)
    WHERE vareihe = ? AND papierabnahme
    GROUP BY id, klasse
});
$sth->execute($vareihe);
while (my @row = $sth->fetchrow_array) {
    $starter->{$row[0]}{$row[1]} = $row[2];
}

my $max_id = (sort { $b <=> $a } keys %$starter)[0];

my $klassenbezeichnung;
$sth = $dbh->prepare(q{
    SELECT klasse, bezeichnung
    FROM klasse
    WHERE id = ?
});
$sth->execute($max_id);
while (my @row = $sth->fetchrow_array) {
    $klassenbezeichnung->{$row[0]} = $row[1];
}

my $nummern;
$sth = $dbh->prepare(q{
    SELECT id, klasse, count(*)
    FROM fahrer
    JOIN vareihe_veranstaltung USING (id)
    WHERE vareihe = ? AND startnummer < 1000
    GROUP BY id, klasse
});
$sth->execute($vareihe);
while (my @row = $sth->fetchrow_array) {
    my ($klasse, $anzahl) = @row;
    $nummern->{$row[0]}{$row[1]} = $row[2];
}

my $klassen;
foreach my $veranstaltung (values %$starter) {
    foreach my $klasse (keys %$veranstaltung) {
	$klassen->{$klasse}++;
    }
}
$klassen = [ sort { $a <=> $b } keys %$klassen ];

my $format = [ "l$titel_breite" ];
my $header = [ qw(Veranstaltung) ];
foreach my $klasse (@$klassen) {
    push @$format, qw(r3);
    push @$header, $klasse;
}
push @$format, qw(r3);
push @$header, qw(Summe);

my $body;
foreach my $id (sort { $a <=> $b } keys %$starter) {
    my @k = ();
    for (my $n = 0; $n < @$klassen; $n++) {
	my $klasse = $klassen->[$n];
	push @k, $starter->{$id}{$klasse};
    }
    push @$body, [ $veranstaltungstitel->{$id}, @k, summe(@k) ];
}

doc_h2 "Starterzahlen";
doc_table $header, $body, undef, $format;

$body = [];
foreach my $id (sort { $a <=> $b } keys %$starter) {
    my @k = ();
    for (my $n = 0; $n < @$klassen; $n++) {
	my $klasse = $klassen->[$n];
	push @k, $nummern->{$id}{$klasse};
    }
    push @$body, [ $veranstaltungstitel->{$id}, summe(@k) ];
}

doc_h2 "Vergebene Startnummern";
doc_table [ "Veranstaltung", "" ], $body, undef, $format;

$body = [];
foreach my $klasse (@$klassen) {
    push @$body, [ $klasse, $klassenbezeichnung->{$klasse} ];
}
doc_h2 "Klassen";
doc_table [ qw(Kl. Bezeichnung) ], $body, undef, [ qw(r2 l) ];
