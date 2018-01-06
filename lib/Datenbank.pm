# Trialtool: Datenbankfunktionen

# Copyright 2012-2014  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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

package Datenbank;

use Encode qw(_utf8_on);
use POSIX qw(mktime);
use DBI qw(:sql_types looks_like_number);
use Storable qw(dclone);
use JSON_bool;
use Berechnung;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(db_utf8 force_utf8_on sql_value log_sql_statement trace_sql
	     $features_map $spalten_map $result_columns_map);
use strict;

sub db_utf8($) {
    my ($database) = @_;

    if ($database =~ /^(DBI:)?mysql:/) {
	return mysql_enable_utf8 => 1;
    } elsif ($database = ~ /^(DBI:)?SQLite:/) {
	return sqlite_unicode => 1;
    }
    return ();
}

# DBI seems to leave the utf8 flags of some strings like $sth->{NAME} and
# $sth->{NAME_lc} turned off by accident even if the database (MySQL) is
# configured to use utf8.  Fix this up.
sub force_utf8_on(@) {
    my @l = @_;
    map { _utf8_on  $_ } @l;
    return @l;
}

sub sql_value($) {
    local ($_) = @_;

    return "NULL"
	unless defined $_;
    return $_
	if looks_like_number $_;
    s/'/''/g;
    return "'$_'";
}

sub log_sql_statement($@) {
    my ($fh, $statement, @bind_values) = @_;
    $statement =~ s/^\s*(.*?)\s*$/$1/s;
    $statement =~ s/^/    /mg;
    $statement =~ s/\?/sql_value shift @bind_values/ge;
    print $fh "$statement;\n";
}

sub trace_sql($$$) {
    my ($dbh, $trace_sql, $fh) = @_;

    $dbh->{Callbacks} = {
	ChildCallbacks => {
	    execute => sub {
		my ($sth, @bind_values) = @_;
		log_sql_statement $fh, $sth->{Statement}, @bind_values
		    if $sth->{Statement} !~ /^\s*SELECT/i || $trace_sql > 1;
		return;
	    },
	},
	do => sub {
	    my ($dbh, $statement, $attr, @bind_values) = @_;
	    log_sql_statement $fh, $statement, @bind_values
		    if $statement !~ /^\s*SELECT/i || $trace_sql > 1;
	    return;
	},
     };
}

our $features_map = {
  comment => 'bemerkung',
  email => 'email',
  vehicle => 'fahrzeug',
  date_of_birth => 'geburtsdatum',
  displacement => 'hubraum',
  class => 'klasse',
  country => 'land',
  license => 'lizenznummer',
  last_name => 'nachname',
  entry_fee => 'nenngeld',
  new_numbers => 'neue_startnummer',
  zip => 'plz',
  start => 'start',
  number => 'startnummer',
  street => 'strasse',
  first_name => 'vorname',
  ranking1 => 'wertung1',
  city => 'wohnort',
  club => 'club',
  phone => 'telefon',
  start_time => 'startzeit',
  finish_time => 'zielzeit',
  applicant => 'bewerber',
  registration => 'kennzeichen',
  frame_number => 'rahmennummer',
  insurance => 'versicherung',
  ranking2 => 'wertung2',
  ranking3 => 'wertung3',
  ranking4 => 'wertung4',
  province => 'bundesland',
  start_tomorrow => 'start_morgen',
  registered => 'registriert',
  skipped_zones => 'sektion_aus_wertung',
  verified => 'verifiziert',
};

our $spalten_map = {
  club => 'club',
  fahrzeug => 'vehicle',
  lizenznummer => 'license',
  bewerber => 'applicant',
  geburtsdatum => 'date_of_birth',
  bundesland => 'province',
  land => 'country',
};

our $result_columns_map = {
  vehicle => 'fahrzeug',
  license => 'lizenznummer',
  applicant => 'bewerber',
  date_of_birth => 'geburtsdatum',
  province => 'bundesland',
  country => 'land',
  country_province => 'lbl',
  club => 'club',
};

1;
