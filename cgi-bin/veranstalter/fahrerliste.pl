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
use Datenbank;
use TrialToolkit;
use strict;

binmode STDOUT, ':encoding(utf8)';

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $id = $q->param('id'); # veranstaltung
my $gestartet = $q->param('gestartet') || 0;

unless (defined $id) {
    my $sth = $dbh->prepare(q{
	SELECT id, titel
	FROM veranstaltung
	JOIN wertung USING (id)
	WHERE wertung = 1
	ORDER BY datum
    });
    $sth->execute;
    print $q->header(-type=>'text/html', -charset=>'utf-8');
    print "<h1>Fahrerliste</h1>\n";
    print "<p>Format CSV, Zeichensatz UTF-8</p>";
    print "<p>\n";
    while (my @row = $sth->fetchrow_array) {
	my ($id, $titel) = @row;
	print "<a href=\"?id=$id\">$titel</a> " .
	      "(<a href=\"?id=$id&gestartet=1\">Starter</a>)<br>\n";
    }
    print "</p>\n";
    exit;
}

print $q->header(-type=>'text/comma-separated-values', -charset=>'utf-8',
		 -Content_Disposition=>'attachment; filename="fahrerliste.csv"');

my $sth = $dbh->prepare(q{
    SELECT startnummer, klasse, vorname, nachname, strasse, plz AS PLZ,
	   wohnort AS ort, land, club, geburtsdatum, telefon, lizenznummer,
	   fahrzeug, hubraum, bemerkung AS 'E-Mail'
    FROM fahrer
    WHERE id = ? AND startnummer > 0
	  } . ($gestartet ? "AND start" : "") . q{
    ORDER BY startnummer
});
my ($header, $body);
$sth->execute($id);
while (my @row = $sth->fetchrow_array) {
    push @$header, map { ucfirst } force_utf8_on @{$sth->{NAME}}
	unless defined $header;
    push @$body, [ @row ];
}

sub csv_field($) {
    my ($field) = @_;

    if (defined $field) {
	if ($field =~ /["; \n]/s) {
	    $field =~ s/"/""/g;
	    return "\"$field\"";
	} else {
	    return $field;
	}
    } else {
	return "";
    }
}

sub csv_row(@) {
    my ($row) = @_;

    return join(",", map { csv_field $_ } @$row), "\r\n";
}

print csv_row($header);
foreach my $row (@$body) {
    print csv_row($row);
}
