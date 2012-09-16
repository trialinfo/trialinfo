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
use DatenbankAuswertung;
use strict;

if ($database =~ /^mysql:/) {
    # Make sure that strings form the database have Perl's utf8 flag set
    $database .= ';mysql_enable_utf8=1';
}

my $dbh = DBI->connect("DBI:$database", $username, $password)
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $id = $q->param('id'); # veranstaltung
my $gestartet;

print $q->header(-type=>'text/comma-separated-values', -charset=>'utf-8',
		 -Content_Disposition=>'attachment; filename="fahrerliste.csv"');

if (defined $id) {
    $gestartet = 1;
} else {
    my $sth = $dbh->prepare(q{
	SELECT id
	FROM veranstaltung
	WHERE datum = (SELECT MAX(datum) FROM veranstaltung)
    });
    $sth->execute;
    ($id) = $sth->fetchrow_array;
    $gestartet = 0;
}

my $sth = $dbh->prepare(q{
    SELECT startnummer, klasse, vorname, nachname, strasse, plz AS PLZ,
	   wohnort AS ort, land, club, geburtsdatum, telefon, lizenznummer,
	   fahrzeug, hubraum, bemerkung AS 'E-Mail'
    FROM fahrer
    WHERE id = ?
	  } . ($gestartet ? "AND papierabnahme" : "") . q{
    ORDER BY startnummer
});
my ($header, $body);
$sth->execute($id);
while (my @row = $sth->fetchrow_array) {
    push @$header, map { ucfirst } @{$sth->{NAME}}
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
