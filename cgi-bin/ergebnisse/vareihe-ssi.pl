#! /usr/bin/perl -w -I../../trial-toolkit

# Copyright (C) 2013  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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
use strict;

binmode STDOUT, ':encoding(utf8)';
$RenderOutput::html = 1;

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $vareihe = $q->param('vareihe');
my $wertung = $q->param('wertung') // 1;

my @spalten = $q->param('spalte');
my $spalten = @spalten ? join("", map { "&spalte=$_" } @spalten) : "";
my $mit_kuerzel = $q->param('kuerzel');

my $url = $q->param('url') // 'tageswertung.shtml';

print "Content-type: text/html; charset=utf-8\n\n";

my $sth = $dbh->prepare(q{
    SELECT bezeichnung
    FROM vareihe
    WHERE vareihe = ?
});
$sth->execute($vareihe);
if (my @row = $sth->fetchrow_array) {
    my ($bezeichnung) = @row;
    #doc_h1 $bezeichnung;
    my $sth2 = $dbh->prepare(q{
	SELECT id, titel,
	       GROUP_CONCAT(kuerzel ORDER BY kuerzel SEPARATOR ', ') AS kuerzel
	FROM vareihe_veranstaltung
	JOIN wertung USING (id)
	JOIN veranstaltung USING (id)
	LEFT JOIN (
	    SELECT DISTINCT id, vareihe.kuerzel
	    FROM vareihe_veranstaltung
	    JOIN vareihe USING (vareihe)
	    JOIN vareihe_klasse USING (vareihe)
	    JOIN klasse USING (id, klasse)
	    WHERE klasse.gestartet) AS _ USING (id)
	WHERE aktiv AND vareihe = ? AND wertung = ?
	GROUP BY id
	ORDER BY datum;
    });
    $sth2->execute($vareihe, $wertung);
    print "<p>\n";
    while (my@row = $sth2->fetchrow_array) {
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
