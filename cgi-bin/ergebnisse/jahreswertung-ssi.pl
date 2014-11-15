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
#use CGI::Carp qw(warningsToBrowser fatalsToBrowser);
use DBI;
use RenderOutput;
use Jahreswertung;
use Datenbank;
use Auswertung;
use Timestamp;
use strict;

binmode STDOUT, ':encoding(utf8)';
$RenderOutput::html = 1;

my $dbh = DBI->connect("DBI:$database", $username, $password, { db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

trace_sql $dbh, 2, \*STDERR
  if $cgi_verbose;

my $q = CGI->new;
my $vareihe = $q->param('vareihe');
my @klassen = $q->param('klasse');

my $bezeichnung;
my $laeufe;
my $streichresultate;
my $wertung;
my $zeit;
my $abgeschlossen;
my $fahrer_nach_startnummer;
my $klassenfarben;
my $sth;

print "Content-type: text/html; charset=utf-8\n\n";

$sth = $dbh->prepare(q{
    SELECT bezeichnung, abgeschlossen
    FROM vareihe
    WHERE vareihe = ?
});
$sth->execute($vareihe);
if (my @row = $sth->fetchrow_array) {
    ($bezeichnung, $abgeschlossen) = @row;
} else {
    doc_h2 "Veranstaltungsreihe nicht gefunden.\n";
    exit;
}

my $veranstaltungen_reihenfolge = [];

$sth = $dbh->prepare(q{
    SELECT id, datum, wertung, titel, subtitel, mtime, punkteteilung
    FROM wertung
    JOIN vareihe_veranstaltung USING (id)
    JOIN vareihe USING (vareihe, wertung)
    JOIN veranstaltung USING (id)
    WHERE aktiv AND vareihe = ?
    ORDER BY datum
});
$sth->execute($vareihe);
my $veranstaltungen;
my $n = 1;
my $letzte_id;
while (my @row = $sth->fetchrow_array) {
    my $cfg;
    my $id = $row[0];
    $wertung = $row[2];
    $cfg->{id} = $id;
    if ($row[1] =~ /^(\d{4})-0*(\d+)-0*(\d+)$/) {
	$cfg->{label} = "$3.<br>$2.";
	$cfg->{label2} = "$3.$2.";
    } else {
	$cfg->{label} = $n;
    }
    $n++;
    $cfg->{wertungen}[$wertung - 1] = { titel => $row[3], subtitel => $row[4] };
    $veranstaltungen->{$id}{cfg} = $cfg;
    $zeit = max_timestamp($zeit, $row[5]);
    $cfg->{punkteteilung} = $row[6];
    push @$veranstaltungen_reihenfolge, $row[0];
    $letzte_id = $row[0];
}

my @spalten;
my @db_spalten;
if ($letzte_id) {
    my $features;
    $sth = $dbh->prepare(q{
	SELECT feature
	FROM veranstaltung_feature
	WHERE id = ?
    });
    $sth->execute($letzte_id);
    while (my @row = $sth->fetchrow_array) {
	$features->{$row[0]} = 1;
    }

    foreach my $spalte ($q->param('spalte')) {
	$spalte =~ /^(club|fahrzeug|lizenznummer|bewerber|geburtsdatum|bundesland|land|lbl)$/
	   or die "Invalid column name\n";
	if ($spalte eq 'lbl') {
	   next unless $features->{land} || $features->{bundesland};
	} else {
	   next unless $features->{$spalte};
	}
	push @spalten, $spalte;
    }

    @db_spalten = map { /^lbl$/ ? ('land', 'bundesland') : $_ } @spalten;
}

$sth = $dbh->prepare(q{
    SELECT id, klasse, startnummer,
	   vorname, nachname,
	   wertungspunkte, wertungsrang
    } . ( @db_spalten ? ", " . join(", ", @db_spalten) : "") . q{
    FROM fahrer_wertung
    JOIN fahrer USING (id, startnummer)
    JOIN klasse USING (id, klasse)
    JOIN vareihe_veranstaltung USING (id)
    /* JOIN vareihe USING (vareihe) */
    JOIN vareihe_klasse USING (vareihe, wertungsklasse)
    JOIN veranstaltung USING (id)
    WHERE aktiv AND vareihe_veranstaltung.vareihe = ?
});
$sth->execute($vareihe);
while (my $fahrer = $sth->fetchrow_hashref) {
    my $id = $fahrer->{id};
    delete $fahrer->{id};

    $fahrer->{wertungen}[$wertung - 1] = {
	    punkte => $fahrer->{wertungspunkte},
	    rang => $fahrer->{wertungsrang},
	};
    delete $fahrer->{wertungspunkte};
    delete $fahrer->{wertungsrang};

    my $startnummer = $fahrer->{startnummer};
    $veranstaltungen->{$id}{fahrer}{$startnummer} = $fahrer;
}

$sth = $dbh->prepare(q{
    SELECT id, startnummer, neue_startnummer
    FROM vareihe_veranstaltung
    /* JOIN vareihe USING (vareihe) */
    JOIN neue_startnummer USING (vareihe, id)
    JOIN veranstaltung USING (id)
    WHERE aktiv AND vareihe = ?
});
$sth->execute($vareihe);
while (my @row = $sth->fetchrow_array) {
    $veranstaltungen->{$row[0]}{cfg}{neue_startnummern}{$row[1]} = $row[2]
	unless defined $row[2] && $row[1] == $row[2];
}

$sth = $dbh->prepare(q{
    SELECT id, klasse, wertungsklasse
    FROM klasse
    JOIN vareihe_klasse USING (wertungsklasse)
    WHERE vareihe = ?
});
$sth->execute($vareihe);
while (my @row = $sth->fetchrow_array) {
    my $cfg = $veranstaltungen->{$row[0]}{cfg};
    $cfg->{klassen}[$row[1] - 1]{wertungsklasse} = $row[2];
}

foreach my $id (keys %$veranstaltungen) {
    delete $veranstaltungen->{$id}
	unless exists $veranstaltungen->{$id}{fahrer};
}

unless (%$veranstaltungen) {
    doc_p "Für diese Veranstaltungreihe sind keine Ergebnisse vorhanden.";
    exit;
}

$veranstaltungen = [ map { exists $veranstaltungen->{$_} ?
			   [ $veranstaltungen->{$_}{cfg},
			     $veranstaltungen->{$_}{fahrer} ] : () }
			 @$veranstaltungen_reihenfolge ];

my $letzte_cfg = $veranstaltungen->[@$veranstaltungen - 1][0];

$sth = $dbh->prepare(q{
    SELECT klasse, bezeichnung, farbe, laeufe, streichresultate
    FROM klasse
    JOIN vareihe_klasse USING (wertungsklasse)
    WHERE vareihe = ? AND id = ?
});
$sth->execute($vareihe, $letzte_cfg->{id});
while (my @row = $sth->fetchrow_array) {
    my $klasse = $letzte_cfg->{klassen}[$row[0] - 1];
    $klasse->{bezeichnung} = $row[1];
    $klasse->{farbe} = $row[2];

    $klassenfarben->{$row[0]} = $row[2]
	if defined $row[2];
    $laeufe->{$row[0]} = $row[3];
    $streichresultate->{$row[0]} = $row[4];
}

$sth = $dbh->prepare(q{
    SELECT bezeichnung
    FROM wertung
    WHERE id = ? AND wertung = ?
});
$sth->execute($letzte_cfg->{id}, $wertung);
if (my @row = $sth->fetchrow_array) {
    $letzte_cfg->{wertungen}[$wertung - 1]{bezeichnung} = $row[0];
}

doc_h1 "$bezeichnung";
doc_h2 "Jahreswertung";
jahreswertung veranstaltungen => $veranstaltungen,
	      wertung => $wertung,
	      laeufe_gesamt => $laeufe,
	      streichresultate => $streichresultate,
	      $klassenfarben ? (klassenfarben => $klassenfarben) : (),
	      spalten => [ @spalten ],
	      nach_relevanz => 1,
	      @klassen ? (klassen => \@klassen ) : ();

print "<p>Letzte Änderung: $zeit</p>\n"
    unless $abgeschlossen;
