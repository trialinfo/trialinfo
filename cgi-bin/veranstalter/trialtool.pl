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
use CGI::Carp qw(warningsToBrowser fatalsToBrowser);
use DBI;
use Datenbank;
use Datenbank;
use TrialToolkit;
use Trialtool;
use strict;

binmode STDOUT, ':encoding(utf8)';

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $id = $q->param('id'); # veranstaltung
my $type = $q->param('type');  # cfg oder dat
my $dateiname;

if ($type !~ /^(cfg|dat)$/) {
    die "Invalid type specified\n";
}

my $sth = $dbh->prepare(q{
    SELECT dateiname
    FROM veranstaltung
    WHERE id = ?
});
$sth->execute($id);
if (my @row = $sth->fetchrow_array) {
    $dateiname = $row[0];
} else {
    die "Keine Veranstaltung mit dieser id gefunden\n";
}

if ($type eq 'cfg') {
    my $cfg = cfg_aus_datenbank($dbh, $id);
    print $q->header(-type => 'application/octet-stream',
		     -Content_Disposition => 'attachment; ' .
			 "filename=\"$dateiname.cfg\"");
    cfg_datei_schreiben(\*STDOUT, $cfg);
} else {
    #use Data::Dumper;
    #print $q->header(-type => 'text/plain', -charset=>'utf-8');
    #print Dumper($cfg), "\n";
    #exit;

    my $fahrer_nach_startnummer = fahrer_aus_datenbank($dbh, $id);
    print $q->header(-type => 'application/octet-stream',
		     -Content_Disposition => 'attachment; ' .
			 "filename=\"$dateiname.dat\"");
    dat_datei_schreiben(\*STDOUT, $fahrer_nach_startnummer);
}
