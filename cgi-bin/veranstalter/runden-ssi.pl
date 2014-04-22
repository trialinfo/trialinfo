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
use Datenbank;
use Auswertung;
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
    SELECT id, titel, GROUP_CONCAT(kuerzel ORDER BY kuerzel SEPARATOR ', ') AS kuerzel
    FROM veranstaltung
    JOIN wertung USING (id)
    JOIN vareihe_veranstaltung USING (id)
    LEFT JOIN (
	SELECT DISTINCT id, vareihe.kuerzel
	FROM vareihe_veranstaltung
	JOIN vareihe USING (vareihe)
	WHERE vareihe != ?) AS _ USING (id)
    WHERE aktiv AND wertung = 1 AND vareihe = ?
    GROUP BY id
});
$sth->execute($vareihe, $vareihe);
while (my @row = $sth->fetchrow_array) {
    $veranstaltungstitel->{$row[0]} = $row[1];
    $veranstaltungstitel->{$row[0]} .= " ($row[2])"
	if defined $row[2];
}
my $titel_breite = 0;
foreach my $veranstaltungstitel (values %$veranstaltungstitel) {
    $titel_breite = max($titel_breite, length $veranstaltungstitel);
}

my ($runden, $min_runden, $max_runden);
$sth = $dbh->prepare(q{
    SELECT id, runden, COUNT(*)
    FROM fahrer
    JOIN veranstaltung USING (id)
    JOIN vareihe_veranstaltung USING (id)
    WHERE start AND vareihe = ?
    GROUP BY id, runden
});
$sth->execute($vareihe);
while (my @row = $sth->fetchrow_array) {
    $runden->{$row[0]}{$row[1]} = $row[2];
    $min_runden = $row[1]
	unless defined $min_runden && $row[1] > $min_runden;
    $max_runden = $row[1]
	unless defined $max_runden && $row[1] < $max_runden;
}

my $format = [ "l$titel_breite" ];
my $header = [ qw(Veranstaltung) ];
for (my $r = $min_runden; $r <= $max_runden; $r++) {
    push @$format, qw(r3);
    push @$header, $r;
}
#push @$format, qw(r3);
#push @$header, qw(Summe);

my $body;
foreach my $id (sort { $a <=> $b } keys %$runden) {
    my @r = ();
    for (my $r = $min_runden; $r <= $max_runden; $r++) {
	push @r, $runden->{$id}{$r};
    }
    push @$body, [ $veranstaltungstitel->{$id}, @r ];
}

my $summen;
foreach my $id (sort { $a <=> $b } keys %$runden) {
    for (my $r = $min_runden; $r <= $max_runden; $r++) {
	$summen->[$r] += $runden->{$id}{$r} // 0;
    }
}
push @$body, [ 'Summe', @$summen ];

doc_h2 "Gefahrene Runden";
doc_table header => $header, body => $body, format => $format;
