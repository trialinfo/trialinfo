#! /usr/bin/perl -w -I../../trialtool-plus

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
#use CGI::Carp qw(warningsToBrowser fatalsToBrowser);
use DBI;
use RenderOutput;
use DatenbankAuswertung;
use strict;

$RenderOutput::html = 1;

my $dbh = DBI->connect("DBI:$database", $username, $password)
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $id = $q->param('id'); # veranstaltung

my $wertung = 0;
my $titel;
my $sth;

print "Content-type: text/html; charset=utf-8\n\n";

unless (defined $id) {
    doc_h2 "Nenngeldlisten";
    $sth = $dbh->prepare(q{
	SELECT id, titel
	FROM veranstaltung
	JOIN wertung USING (id)
	WHERE wertung = ?
	ORDER BY datum
    });
    $sth->execute($wertung + 1);
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
$sth->execute($id, $wertung + 1);
if (my @row = $sth->fetchrow_array) {
    $titel = $row[0];
} else {
    doc_h2 "Veranstaltung nicht gefunden.";
    exit;
}

$sth = $dbh->prepare(q{
    SELECT startnummer AS 'Nr.', klasse,
	   CONCAT(nachname, ', ', vorname) AS name,
	   YEAR(geburtsdatum) AS geburtsjahr,
	   CASE WHEN klasse IN (11, 12, 13) AND ausfall != 4 THEN
		CASE WHEN geburtsdatum IS NULL THEN 25
		     WHEN YEAR(datum) - YEAR(geburtsdatum) < 18 THEN 15
		     ELSE 25 END
	   END AS 'OSK',
	   CASE WHEN NOT (klasse IN (11, 12, 13) AND ausfall != 4) THEN
		CASE WHEN geburtsdatum IS NULL THEN 25
		     WHEN YEAR(datum) - YEAR(geburtsdatum) < 18 THEN 15
		     ELSE 25 END
	   END AS 'ÖTSV'
    FROM fahrer
    JOIN veranstaltung USING (id)
    WHERE id = ? AND papierabnahme
    ORDER BY startnummer;
});
$sth->execute($id);
my ($header, $body);
my $format = [ qw(r r l r r r) ];
while (my @row = $sth->fetchrow_array) {
    push @$header, map { ucfirst } @{$sth->{NAME}}
	unless defined $header;
    push @$body, [ @row ];
}

my ($osk, $otsv);
foreach my $row (@$body) {
    $osk += $row->[4]
	if defined $row->[4];
    $otsv += $row->[5]
	if defined $row->[5];
}
foreach my $row (@$body) {
    $row->[4] = "€$row->[4]"
	if defined $row->[4];
    $row->[5] = "€$row->[5]"
	if defined $row->[5];
}
$osk = "€$osk"
    if defined $osk;
$otsv = "€$otsv"
    if defined $otsv;
my $footer = [ [ "Summen", "r4" ], $osk, $otsv ];

doc_h2 "Nenngeldliste – $titel";
doc_table $header, $body, $footer, $format;
