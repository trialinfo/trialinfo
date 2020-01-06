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
my @nicht = $q->multi_param('nicht');

my @spalten = $q->multi_param('spalte');
my $spalten = @spalten ? join("", map { "&spalte=$_" } @spalten) : "";
my $mit_kuerzel = $q->param('kuerzel');

my $url = $q->param('url') // 'tageswertung.shtml';

print "Content-type: text/html; charset=utf-8\n\n";

my $sth = $dbh->prepare(q{
    SELECT name, ranking, COUNT(ranking_class) AS classes
    FROM series
    LEFT JOIN series_classes USING (serie)
    WHERE serie = ?
});
$sth->execute($vareihe);
if (my @row = $sth->fetchrow_array) {
    my ($bezeichnung, $wertung, $klassen) = @row;
    $wertung //= 1;
    #doc_h1 $bezeichnung;
    my $sth2 = $dbh->prepare(q{
	SELECT id, title,
	       GROUP_CONCAT(abbreviation ORDER BY abbreviation SEPARATOR ', ') AS abbreviation
	FROM series_events
	JOIN rankings USING (id)
	JOIN events USING (id)} .
	($klassen ? q{
	  JOIN (
	    SELECT DISTINCT id, serie
	    FROM series_classes JOIN classes USING (ranking_class)
	  ) AS _1 USING (serie, id)
	} : q{}) . q{
	LEFT JOIN (
	    SELECT id, abbreviation FROM (
		SELECT DISTINCT id, serie, abbreviation
		FROM series_events
		JOIN series USING (serie)
		WHERE serie NOT IN (
		  SELECT serie FROM series_classes
		)

		UNION

		SELECT DISTINCT id, serie, abbreviation
		FROM series_events
		JOIN series USING (serie)
		JOIN series_classes USING (serie)
		JOIN classes USING (id, ranking_class)
	    ) AS _3} .
	    (@nicht ? q{
	    WHERE serie NOT IN (} . join(', ', map { '?' } @nicht) . q{)} : q{}) .
	q{) AS _4 USING (id)
	WHERE enabled AND serie = ? AND ranking = ?
	GROUP BY id
	ORDER BY date;
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
