#! /usr/bin/perl -w -I../../lib

# Copyright 2013-2014  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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
use strict;

binmode STDOUT, ':encoding(utf8)';
$RenderOutput::html = 1;

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $vareihe = $q->param('vareihe');
my @nicht = $q->param('nicht');

my @spalten = $q->param('spalte');
my $spalten = @spalten ? join("", map { "&spalte=$_" } @spalten) : "";
my $mit_kuerzel = $q->param('kuerzel');

my $url = $q->param('url') // 'tageswertung.shtml';

print "Content-type: text/html; charset=utf-8\n\n";

my $sth = $dbh->prepare(q{
    SELECT bezeichnung, wertung, COUNT(wertungsklasse) AS klassen
    FROM vareihe
    LEFT JOIN vareihe_klasse USING (vareihe)
    WHERE vareihe = ?
});
$sth->execute($vareihe);
if (my @row = $sth->fetchrow_array) {
    my ($bezeichnung, $wertung, $klassen) = @row;
    $wertung //= 1;
    #doc_h1 $bezeichnung;
    my $sth2 = $dbh->prepare(q{
	SELECT id, titel,
	       GROUP_CONCAT(kuerzel ORDER BY kuerzel SEPARATOR ', ') AS kuerzel
	FROM vareihe_veranstaltung
	JOIN wertung USING (id)
	JOIN veranstaltung USING (id)} .
	($klassen ? q{
	  JOIN (
	    SELECT DISTINCT id, vareihe
	    FROM vareihe_klasse JOIN klasse USING (wertungsklasse)
	  ) AS _1 USING (vareihe, id)
	} : q{}) . q{
	LEFT JOIN (
	    SELECT id, kuerzel FROM (
		SELECT DISTINCT id, vareihe, kuerzel
		FROM vareihe_veranstaltung
		JOIN vareihe USING (vareihe)
		WHERE vareihe NOT IN (
		  SELECT vareihe from vareihe_klasse
		)

		UNION

		SELECT DISTINCT id, vareihe, kuerzel
		FROM vareihe_veranstaltung
		JOIN vareihe USING (vareihe)
		JOIN vareihe_klasse USING (vareihe)
		JOIN klasse USING (id, wertungsklasse)
	    ) AS _3} .
	    (@nicht ? q{
	    WHERE vareihe NOT IN (} . join(', ', map { '?' } @nicht) . q{)} : q{}) .
	q{) AS _4 USING (id)
	WHERE aktiv AND vareihe = ? AND wertung = ?
	GROUP BY id
	ORDER BY datum;
    });
    $sth2->execute(@nicht, $vareihe, $wertung);
    print "<p>\n";
    while (my @row = $sth2->fetchrow_array) {
	my ($id, $titel, $kuerzel) = @row;
	print "<a href=\"$url?id=$id$spalten\">$titel</a>";
	print " ($kuerzel)"
	    if defined $kuerzel && defined $mit_kuerzel;
	print "<br>\n";
    }
    print "</p>\n";
    print "\n";
} else {
    doc_h2 "Veranstaltungsreihe nicht gefunden.";
}
