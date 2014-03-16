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

my $wertung = 1;

my $url = $q->param('url') // '../cgi-bin/veranstalter/export.pl';

print "Content-type: text/html; charset=utf-8\n\n";

if (defined $vareihe) {
    my $sth = $dbh->prepare(q{
	SELECT bezeichnung
	FROM vareihe
	WHERE vareihe = ?
    });
    $sth->execute($vareihe);
    unless ($sth->fetchrow_array) {
	doc_h2 "Veranstaltungsreihe nicht gefunden.";
	exit;
    }
}

my $sth;
if (defined $vareihe) {
$sth = $dbh->prepare(q{
    SELECT id, titel
    FROM vareihe_veranstaltung
    JOIN veranstaltung USING (id)
    JOIN wertung USING (id)
    WHERE vareihe = ? AND wertung = ?
    ORDER BY datum;
});
$sth->execute($vareihe, $wertung);
} else {
$sth = $dbh->prepare(q{
    SELECT id, titel
    FROM veranstaltung
    JOIN wertung USING (id)
    WHERE wertung = ?
    ORDER BY datum;
});
$sth->execute($wertung);
}
print "<p>\n";
while (my@row = $sth->fetchrow_array) {
my ($id, $titel) = @row;
print "$titel: <a href=\"$url?id=$id&type=cfg\">cfg</a>, " .
      "<a href=\"$url?id=$id&type=dat\">dat</a><br>\n";
}
print "</p>\n";
print "\n";
