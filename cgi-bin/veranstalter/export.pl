#! /usr/bin/perl -w -I../../lib

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

use utf8;
use CGI;
use CGI::Carp qw(warningsToBrowser fatalsToBrowser);
use DBI;
use Datenbank;
use Auswertung;
use Trialtool qw(cfg_datei_daten dat_datei_daten);
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

my $cfg = cfg_aus_datenbank($dbh, $id);
$dateiname = dateiname($dbh, $id, $cfg)
    unless $dateiname;

if ($type eq 'cfg') {
    print $q->header(-type => 'application/octet-stream',
		     -Content_Disposition => 'attachment; ' .
			 "filename=\"$dateiname.cfg\"");
    binmode STDOUT, ":bytes";
    print cfg_datei_daten($cfg);
} else {
    my $fahrer_nach_startnummer = fahrer_aus_datenbank($dbh, $id);
    print $q->header(-type => 'application/octet-stream',
		     -Content_Disposition => 'attachment; ' .
			 "filename=\"$dateiname.dat\"");
    binmode STDOUT, ":bytes";
    print dat_datei_daten($cfg, $fahrer_nach_startnummer);
}
