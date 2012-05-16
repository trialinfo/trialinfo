#! /usr/bin/perl -w -I..

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
use DBI;
use RenderOutput;
use Wertungen qw(tageswertung);
use strict;

$RenderOutput::html = 1;

my $database = 'mysql:mydb;mysql_enable_utf8=1';
my $username = 'auswertung';
my $password = '3tAw4oSs';

my $dbh = DBI->connect("DBI:$database", $username, $password)
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $id = $q->param('id'); # veranstaltung
my $nach_sektionen = defined $q->param('nach_sektionen');

sub x($) {
    my ($punkte) = @_;

    #print STDERR "**", join(" ", @$punkte), "**\n";

    my @x = (0, 0, 0, 0, undef, 0);
    my $y = 0;
    foreach my $p (@$punkte) {
	$x[$p]++;
	$y += $p;
    }
    my $n;
    if (@$punkte) {
	$n = 1 / @$punkte;
    } else {
	$n = 0;
    }

    return ($x[0], $x[1], $x[2], $x[3], $x[5],
	    sprintf("%.1f", $y * $n));
}

my $wertung = 0;
my $titel;
my $klassen;
my $sth;

print "Content-type: text/html; charset=utf-8\n\n";

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
    doc_h1 "Veranstaltung nicht gefunden.";
    exit;
}

$sth = $dbh->prepare(q{
    SELECT klasse, sektion, punkte.punkte
    FROM punkte
    JOIN fahrer USING (id, startnummer)
    WHERE id = ?
});
$sth->execute($id);
while (my @row = $sth->fetchrow_array) {
    my ($klasse, $sektion, $punkte) = @row;
    push @{$klassen->{$klasse}{$sektion}}, $punkte;
}

$sth = $dbh->prepare(q{
    SELECT klasse, bezeichnung
    FROM klasse
    WHERE id = ?
});
$sth->execute($id);
my $cfg;
while (my @row = $sth->fetchrow_array) {
    $cfg->{klassen}[$row[0] - 1] = $row[1];
}

if ($nach_sektionen) {
    doc_h1 "Punktestatistik nach Sektionen";
    doc_h2 $titel;
    my $format = [ qw(r3 r3 r3 r3 r3 r3 r) ];
    my $header = [ qw(Sektion 0 1 2 3 5 ⌀) ];
    foreach my $n (sort { $a <=> $b } keys $klassen) {
	my $klasse = $klassen->{$n};
	my $alle_punkte;

	doc_h3 $cfg->{klassen}[$n - 1];
	my $body;
	foreach my $sektion (sort { $a <=> $b } keys $klasse) {
	    my $punkte = $klasse->{$sektion};
	    push @$alle_punkte, @$punkte;
	    my $row;
	    push @$row, $sektion, x($punkte);
	    push @$body, $row;
	}
	my $footer = [ "", x($alle_punkte) ];
	doc_table $header, $body, $footer, $format;
    }
} else {
    doc_h1 "Punktestatistik";
    doc_h2 $titel;
    my $format = [ qw(r3 r3 r3 r3 r3 r3 r) ];
    my $header = [ qw(Klasse 0 1 2 3 5 ⌀) ];
    my $body;
    my $alle_punkte;
    foreach my $n (sort { $a <=> $b } keys $klassen) {
	my $klasse = $klassen->{$n};
	my $punkte;

	foreach my $sektion (sort { $a <=> $b } keys $klasse) {
	    push @$punkte, @{$klasse->{$sektion}};
	}
	push @$alle_punkte, @$punkte;
	push @$body, [ $n, x($punkte) ];
    }
    my $footer = [ "", x($alle_punkte) ];
    doc_table $header, $body, $footer, $format;

    print "<p><a href=\"statistik.shtml?id=$id&nach_sektionen\">Nach Sektionen</a></p>\n";
}
