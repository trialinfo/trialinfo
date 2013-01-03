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
my $vareihe = $q->param('vareihe');
my $sth;

print "Content-type: text/html; charset=utf-8\n\n";

if (defined $vareihe) {
    $sth = $dbh->prepare(q{
	SELECT bezeichnung
	FROM vareihe
	WHERE vareihe = ?
    });
    $sth->execute($vareihe);
    if (my @row = $sth->fetchrow_array) {
	doc_h2 $row[0];
    } else {
	doc_p "Veranstaltungsreihe nicht gefunden";
	exit;
    }
    $sth = $dbh->prepare(q{
	SELECT wereihe, bezeichnung
	FROM wereihe
	WHERE vareihe = ?
	ORDER BY wereihe
    });
    $sth->execute($vareihe);
} else {
    $sth = $dbh->prepare(q{
	SELECT wereihe, bezeichnung
	FROM wereihe
	ORDER BY wereihe
    });
    $sth->execute;
}

print "<p>\n";
while (my @row =  $sth->fetchrow_array) {
    my ($wereihe, $bezeichnung) = @row;
    print "<a href=\"wereihe.shtml?wereihe=$wereihe&spalte=fahrzeug\">$bezeichnung</a><br>\n";
}
print "</p>\n";