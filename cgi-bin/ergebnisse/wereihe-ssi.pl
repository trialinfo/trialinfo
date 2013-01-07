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
use strict;

binmode STDOUT, ':encoding(utf8)';
$RenderOutput::html = 1;

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $wereihe = $q->param('wereihe');

my @spalten = $q->param('spalte');
my $spalten = @spalten ? join("", map { "&spalte=$_" } @spalten) : "";

my $url = $q->param('url') // 'tageswertung.shtml';

print "Content-type: text/html; charset=utf-8\n\n";

my $sth = $dbh->prepare(q{
    SELECT bezeichnung
    FROM wereihe
    WHERE wereihe = ?
});
$sth->execute($wereihe);
if (my @row = $sth->fetchrow_array) {
    my ($bezeichnung) = @row;
    doc_h1 $bezeichnung;
    my $sth2 = $dbh->prepare(q{
	SELECT id, titel
	FROM wereihe
	JOIN vareihe_veranstaltung USING (vareihe)
	JOIN wertung USING (id, wertung)
	JOIN veranstaltung USING (id)
	WHERE aktiv AND wereihe = ? AND EXISTS (
	    SELECT *
	    FROM klasse
	    JOIN wereihe_klasse USING (klasse)
	    WHERE wereihe = wereihe.wereihe AND gestartet AND id = wertung.id
	)
	ORDER BY datum;
    });
    $sth2->execute($wereihe);
    print "<p>\n";
    while (my@row = $sth2->fetchrow_array) {
	my ($id, $titel) = @row;
	print "<a href=\"$url?wereihe=$wereihe&id=$id$spalten\">$titel</a><br>\n";
    }
    print "</p>\n";
    print "\n";
} else {
    doc_h2 "Wertungsreihe nicht gefunden.";
}
