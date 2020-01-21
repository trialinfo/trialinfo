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
my @klassen = $q->multi_param('klasse');

my $bezeichnung;
my $laeufe;
my $streichresultate;
my $wertung = 1;
my $mtime;
my $abgeschlossen;
my $fahrer_nach_startnummer;
my $klassenfarben;
my $sth;

print "Content-type: text/html; charset=utf-8\n\n";

$sth = $dbh->prepare(q{
    SELECT name, closed
    FROM series
    WHERE serie = ?
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
    SELECT DISTINCT id, date, title, subtitle, events.mtime, split_score, type,
		    country, hide_country
    FROM series_events
    JOIN series USING (serie)
    JOIN events USING (id)
    WHERE serie = ? AND enabled
    ORDER BY date
});
$sth->execute($vareihe);
my $veranstaltungen;
my $n = 1;
my $letzte_id;
while (my @row = $sth->fetchrow_array) {
    my $cfg;
    my $id = $row[0];
    $cfg->{id} = $id;
    if ($row[1] =~ /^(\d{4})-0*(\d+)-0*(\d+)$/) {
	$cfg->{label} = "$3.<br>$2.";
	$cfg->{label2} = "$3.$2.";
    } else {
	$cfg->{label} = $n;
    }
    $n++;
    $cfg->{wertungen}[$wertung - 1] = { titel => $row[2], subtitel => $row[3] };
    $veranstaltungen->{$id}{cfg} = $cfg;
    $mtime = max_timestamp($mtime, $row[4])
	unless defined $row[1] && !same_day($row[1]);
    $cfg->{punkteteilung} = $row[5];
    $cfg->{art} = $row[6];
    $cfg->{land} = $row[7];
    $cfg->{land_verbergen} = $row[8];
    push @$veranstaltungen_reihenfolge, $row[0];
    $letzte_id = $row[0];
}

my @spalten;
my @db_spalten;
if ($letzte_id) {
    my $features;
    $sth = $dbh->prepare(q{
	SELECT feature
	FROM event_features
	WHERE id = ?

	UNION

	SELECT CONCAT('ranking', ranking) AS feature
	FROM rankings
	WHERE id = ?
    });
    $sth->execute($letzte_id, $letzte_id);
    while (my @row = $sth->fetchrow_array) {
	$features->{$features_map->{$row[0]}} = 1
	    if exists $features_map->{$row[0]};
    }

    $sth = $dbh->prepare(q{
	SELECT name
	FROM result_columns
	WHERE id = ?
	ORDER BY n
    });
    $sth->execute($letzte_id);
    while (my @row = $sth->fetchrow_array) {
	my $spalte = $result_columns_map->{$row[0]}
	   or die "Invalid column name\n";
	if ($spalte eq 'lbl') {
	   next unless $features->{land} || $features->{bundesland};
	} else {
	   next unless $features->{$spalte};
	}
	push @spalten, $spalte;
    }

    @db_spalten =
      map { "$spalten_map->{$_} AS $_" }
	map { /^lbl$/ ? ('land', 'bundesland') : $_ } @spalten;
}

$sth = $dbh->prepare(q{
    SELECT id, class AS klasse, number AS startnummer,
	   first_name AS vorname, last_name AS nachname,
	   score AS wertungspunkte, rider_rankings.rank AS wertungsrang
    } . ( @db_spalten ? ", " . join(", ", @db_spalten) : "") . q{
    FROM rider_rankings
    JOIN riders USING (id, number)
    JOIN classes USING (id, class)
    JOIN series_events USING (id)
    JOIN series USING (serie)
    JOIN series_classes USING (serie, ranking, ranking_class)
    JOIN events USING (id)
    WHERE enabled AND series_events.serie = ? AND ranking = ?
});
$sth->execute($vareihe, $wertung);
while (my $fahrer = $sth->fetchrow_hashref) {
    my $id = $fahrer->{id};
    delete $fahrer->{id};

    next unless defined($fahrer->{wertungsrang});

    $fahrer->{wertungen}[$wertung - 1] = {
	    punkte => $fahrer->{wertungspunkte},
	    rang => $fahrer->{wertungsrang},
	};
    delete $fahrer->{wertungspunkte};
    delete $fahrer->{wertungsrang};

    my $veranstaltung = $veranstaltungen->{$id};
    if ($veranstaltung) {
	$fahrer->{land} = undef
	    if defined $fahrer->{land} &&
	       $fahrer->{land} eq $veranstaltung->{cfg}{land} &&
	       $veranstaltung->{cfg}{land_verbergen};

	my $startnummer = $fahrer->{startnummer};
	$veranstaltung->{fahrer}{$startnummer} = $fahrer;
    }
}

$sth = $dbh->prepare(q{
    SELECT id, `number`, new_number
    FROM series_events
    /* JOIN series USING (serie) */
    JOIN new_numbers USING (serie, id)
    JOIN events USING (id)
    WHERE enabled AND serie = ?
});
$sth->execute($vareihe);
while (my @row = $sth->fetchrow_array) {
    $veranstaltungen->{$row[0]}{cfg}{neue_startnummern}{$row[1]} = $row[2]
	unless defined $row[2] && $row[1] == $row[2];
}

$sth = $dbh->prepare(q{
    SELECT id, class AS klasse, ranking_class AS wertungsklasse, rounds AS runden, no_ranking1 AS keine_wertung1
    FROM classes
    JOIN series_events USING (id)
    JOIN series_classes USING (ranking_class, serie)
    WHERE serie = ?
});
$sth->execute($vareihe);
while (my $row = $sth->fetchrow_hashref) {
    my $id = $row->{id};
    delete $row->{id};
    my $klasse = $row->{klasse};
    delete $row->{klasse};
    my $veranstaltung = $veranstaltungen->{$id};
    if ($veranstaltung) {
	my $cfg = $veranstaltung->{cfg};
	$cfg->{klassen}[$klasse - 1] = $row;
    }
}

$sth = $dbh->prepare(q{
    SELECT id, class, zone
    FROM zones
    JOIN classes USING (id, class)
    JOIN series_events USING (id)
    JOIN series_classes USING (ranking_class, serie)
    WHERE serie = ?
});
$sth->execute($vareihe);
while (my @row = $sth->fetchrow_array) {
    my $veranstaltung = $veranstaltungen->{$row[0]};
    if ($veranstaltung) {
	my $cfg = $veranstaltung->{cfg};
	push @{$cfg->{sektionen}[$row[1] - 1]}, $row[2];
    }
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
    SELECT class, name, color, max_events, drop_events
    FROM classes
    JOIN series_classes USING (ranking_class)
    WHERE serie = ? AND id = ?
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
    SELECT name
    FROM rankings
    WHERE id = ? AND ranking = ?
});
$sth->execute($letzte_cfg->{id}, $wertung);
if (my @row = $sth->fetchrow_array) {
    $letzte_cfg->{wertungen}[$wertung - 1]{bezeichnung} = $row[0];
}

my $tie_break = {};
$sth = $dbh->prepare(q{
    SELECT number, tie_break
    FROM series_tie_break
    WHERE serie = ?
});
$sth->execute($vareihe);
while (my @row = $sth->fetchrow_array) {
    $tie_break->{$row[0]} = $row[1];
}

doc_h1 "$bezeichnung";
doc_h2 "Jahreswertung";
my $w = jahreswertung veranstaltungen => $veranstaltungen,
	      wertung => $wertung,
	      laeufe_gesamt => $laeufe,
	      streichresultate => $streichresultate,
	      $klassenfarben ? (klassenfarben => $klassenfarben) : (),
	      spalten => [ @spalten ],
	      nach_relevanz => 1,
	      @klassen ? (klassen => \@klassen ) : (),
	      tie_break => $tie_break;

if ($ENV{DUMP}) {
    $sth = $dbh->prepare(q{
	DELETE FROM series_scores
	WHERE serie = ?
    });
    $sth->execute($vareihe);
    $sth = $dbh->prepare(q{
	INSERT INTO series_scores
	SET serie = ?, ranking = ?, ranking_class = ?, number = ?, last_id = ?, rank = ?, drop_score = ?, score = ?, ranked = 1
    });
    foreach my $klasse (keys %$w) {
	my $klassenwertung = $w->{$klasse};
	foreach my $startnummer (keys %$klassenwertung) {
	    my $fahrerwertung = $klassenwertung->{$startnummer};
	    $sth->execute($vareihe, $wertung, $klasse, $startnummer, $fahrerwertung->{letzte_id}, $fahrerwertung->{rang}, $fahrerwertung->{streichpunkte}, $fahrerwertung->{gesamtpunkte});
	}
    }
    $sth = $dbh->prepare(q{
	UPDATE series
	SET mtime = NULL
	WHERE serie = ?
    });
    $sth->execute($vareihe);
}

print "<p>Letzte Änderung: $mtime</p>\n"
    if $mtime;
