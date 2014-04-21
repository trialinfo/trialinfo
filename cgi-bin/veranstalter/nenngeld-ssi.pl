#! /usr/bin/perl -w -I../../lib

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
use CGI::Carp qw(warningsToBrowser fatalsToBrowser);
use DBI;
use RenderOutput;
use Datenbank;
use Auswertung;
use strict;

binmode STDOUT, ':encoding(utf8)';
$RenderOutput::html = 1;

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $id = $q->param('id'); # veranstaltung

my $wertung = 1;
my $titel;
my $sth;

print "Content-type: text/html; charset=utf-8\n\n";

unless (defined $id) {
    my $vareihe = $q->param('vareihe');
    if ($vareihe) {
	$sth = $dbh->prepare(q{
	    SELECT id, titel
	    FROM veranstaltung
	    JOIN wertung USING (id)
	    JOIN vareihe_veranstaltung USING (id)
	    WHERE vareihe = ? AND wertung = ?
	    ORDER BY datum
	});
	$sth->execute($vareihe, $wertung);
    } else {
	$sth = $dbh->prepare(q{
	    SELECT id, titel
	    FROM veranstaltung
	    JOIN wertung USING (id)
	    WHERE wertung = ?
	    ORDER BY datum
	});
	$sth->execute($wertung);
    }
    print "<p>\n";
    while (my @row = $sth->fetchrow_array) {
	my ($id, $titel) = @row;
	print "<a href=\"nenngeld.shtml?id=$id\">$titel</a><br>\n";
    }
    print "</p>\n";
    exit;
}

$sth = $dbh->prepare(q{
    SELECT titel
    FROM veranstaltung
    JOIN wertung USING (id)
    WHERE id = ? AND wertung = ?
});
$sth->execute($id, $wertung);
if (my @row = $sth->fetchrow_array) {
    $titel = $row[0];
} else {
    doc_h2 "Veranstaltung nicht gefunden.";
    exit;
}

$sth = $dbh->prepare(q{
    SELECT startnummer AS 'Nr.',
	   CASE WHEN klasse IN (11, 12, 13) AND
		     (lizenznummer = '' OR
		     lizenznummer IS NULL)
		THEN CONCAT('(', klasse, ')')
		ELSE klasse END AS klasse,
	   CONCAT(nachname, ' ', vorname) AS name,
	   YEAR(geburtsdatum) AS geburtsjahr,
	   CASE WHEN YEAR(datum) - YEAR(geburtsdatum) < 18 THEN 20
		ELSE 30 END AS 'Nenngeld',
	   CASE WHEN YEAR(datum) - YEAR(geburtsdatum) < 18 THEN NULL
		ELSE 5 END AS 'ÖTSV',
	   GROUP_CONCAT(wertung.bezeichnung ORDER BY wertung SEPARATOR ", ") AS "Wertungen"
    FROM fahrer
    LEFT JOIN fahrer_wertung USING (id, startnummer)
    LEFT JOIN wertung USING (id, wertung)
    JOIN veranstaltung USING (id)
    WHERE id = ? AND start
    GROUP BY id, startnummer
    ORDER BY startnummer;
});
$sth->execute($id);
my ($header, $body);
my $format = [ qw(r r l r r r r) ];
my ($starter, $ueber_18);
while (my @row = $sth->fetchrow_array) {
    push @$header, map { ucfirst } force_utf8_on @{$sth->{NAME}}
	unless defined $header;
    push @$body, [ @row ];
    $starter++;
    $ueber_18++ unless
	$row[4] eq 15;
}

my ($nenngeld, $otsv);
foreach my $row (@$body) {
    $nenngeld += $row->[4];
    $otsv += $row->[5]
	if defined $row->[5];
}
foreach my $row (@$body) {
    $row->[4] = "€$row->[4]"
	if defined $row->[4];
    $row->[5] = "€$row->[5]"
	if defined $row->[5];
}
$nenngeld = "€$nenngeld"
    if defined $nenngeld;
$otsv = "€$otsv"
    if defined $otsv;
my $footer = [ [ "Summen:", "r4" ], $nenngeld, $otsv ]
    if defined $nenngeld || defined $otsv;

doc_h2 "$titel";
doc_table header => $header, body => $body, footer => $footer, format => $format;
printf "<p>%s Starter, davon %s über 18 Jahre und %s unter 18 Jahre</p>\n",
       $starter // 0, $ueber_18 // 0, ($starter - $ueber_18) // 0;
