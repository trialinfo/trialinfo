#! /usr/bin/perl -w -I../../lib

use utf8;
use CGI qw(:cgi header);
#use CGI::Carp qw(warningsToBrowser fatalsToBrowser);
use CGI::Carp qw(fatalsToBrowser);
use JSON;
use JSON_bool;
use Datenbank;
use Auswertung;
use strict;
use Compress::Zlib;
#use Data::Dumper;

my $trace_sql = $cgi_verbose;

binmode STDOUT, ':encoding(utf8)';

# Brauchen wir "mysql_bind_type_guessing" für die Abfrageparameter, damit mysql
# seine Indizes ordentlich verwendet?

my $dbh = DBI->connect("DBI:$database", $username, $password, { PrintError => 1, RaiseError => 1,
								AutoCommit => 1, db_utf8($database) })
    or die "Could not connect to database: $DBI::errstr\n";

trace_sql $dbh, $trace_sql, \*STDERR
    if $trace_sql;

my $q = CGI->new;
my $op = ($q->request_method() // 'GET') . '/' . $q->url_param('op')
    or die "Keine Operation angegeben.\n";

sub parameter($@) {
    my $q = shift;
    my @params;
    foreach my $name (@_) {
	my $value = $q->url_param($name);
	die "Parameter $name nicht angegeben.\n"
	    unless defined $value;
	push @params, $value;
    }
    return @params;
}

my $result;
my $status = '200 OK';
my $json = JSON->new;
if ($op eq "GET/veranstaltung/auswertung") {
    my ($id) = parameter($q, qw(id));

    my $sth = $dbh->prepare(q{
	SELECT startnummer, gruppe, wertungsklasse AS klasse, nachname, vorname,
	       geburtsdatum, wohnort, club, fahrzeug, land, bundesland, lizenznummer,
	       bewerber, rang, fahrer.runden, ausfall,
	       fahrer.ausser_konkurrenz OR klasse.ausser_konkurrenz as ausser_konkurrenz,
	       zusatzpunkte, punkte, s0, s1, s2, s3, s4, s5
	FROM fahrer
	LEFT JOIN (
	    SELECT klasse.klasse, klasse.wertungsklasse, klasse.ausser_konkurrenz
	    FROM klasse
	    JOIN (
		SELECT DISTINCT klasse
		FROM sektion
		WHERE id = ?) AS _ ON wertungsklasse = _.klasse
	    WHERE id = ?) AS klasse USING (klasse)
	WHERE start AND (gruppe OR klasse IS NOT NULL) AND id = ?
    });
    $sth->execute($id, $id, $id);
    my $fahrer_nach_startnummer = {};
    my $fahrer_in_klassen = [];
    my $gruppen = [];
    while (my $row = $sth->fetchrow_hashref) {
	fixup_hashref($sth, $row);
	$row->{wertungen} = [];
	$row->{punkte_pro_sektion} = [];
	$row->{punkte_pro_runde} = [];
	$row->{punkteverteilung} = [];
	for (my $n = 0; $n <= 5; $n++) {
	    push @{$row->{punkteverteilung}}, $row->{"s$n"};
	    delete $row->{"s$n"};
	}
	my $startnummer = $row->{startnummer};
	$fahrer_nach_startnummer->{$startnummer} = $row;

        if ($row->{gruppe}) {
	    $row->{fahrer} = [];
	    push @$gruppen, $row;
	} else {
	    my $klasse = $row->{klasse};
	    push @{$fahrer_in_klassen->[$klasse - 1]}, $row;
	}
	delete $row->{gruppe};
    }

    if (@$gruppen) {
	my $sth = $dbh->prepare(q{
	    SELECT gruppe.startnummer, fahrer_gruppe.startnummer
	    FROM fahrer AS gruppe
	    JOIN fahrer_gruppe
		ON gruppe.id = fahrer_gruppe.id AND
		   gruppe.startnummer = fahrer_gruppe.gruppe_startnummer
	    WHERE gruppe.id = ?
	});
	$sth->execute($id);
	while (my @row = $sth->fetchrow_array) {
	    fixup_arrayref($sth, \@row);
	    my $gruppe = $fahrer_nach_startnummer->{$row[0]};
	    push @{$gruppe->{fahrer}}, $row[1];
	}
    }

    $sth = $dbh->prepare(q{
	SELECT startnummer, wertung, wertungsrang, wertungspunkte
	FROM fahrer_wertung
	WHERE id = ? AND wertungsrang IS NOT NULL
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	fixup_arrayref($sth, \@row);
	my $startnummer = $row[0];
	next unless exists $fahrer_nach_startnummer->{$startnummer};

	$fahrer_nach_startnummer->{$startnummer}{wertungen}[$row[1] - 1] = {
	    rang => $row[2],
	    punkte => $row[3],
	}
    }

    $sth = $dbh->prepare(q{
	SELECT startnummer, runde, sektion, punkte
	FROM punkte
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	fixup_arrayref($sth, \@row);
	my $startnummer = $row[0];
	next unless exists $fahrer_nach_startnummer->{$startnummer};

	$fahrer_nach_startnummer->{$startnummer}{punkte_pro_sektion}
	    [$row[1] - 1][$row[2] - 1] = $row[3];
    }

    $sth = $dbh->prepare(q{
	SELECT startnummer, runde, punkte
	FROM runde
	WHERE id = ?
    });
    $sth->execute($id);
    while (my @row = $sth->fetchrow_array) {
	fixup_arrayref($sth, \@row);
	my $startnummer = $row[0];
	next unless exists $fahrer_nach_startnummer->{$startnummer};

	$fahrer_nach_startnummer->{$startnummer}{punkte_pro_runde}
	    [$row[1] - 1] = $row[2];
    }

    $sth = $dbh->prepare(q{
	SELECT datum, mtime, vierpunktewertung, wertungsmodus, punkteteilung
	FROM veranstaltung
	WHERE id = ?
    });
    $sth->execute($id);
    my $veranstaltung = $sth->fetchrow_hashref
	or die "Veranstaltung nicht gefunden\n";
    fixup_hashref($sth, $veranstaltung);

    $sth = $dbh->prepare(q{
	SELECT klasse, runden, farbe, bezeichnung
	FROM klasse
	WHERE id = ?
    });
    $sth->execute($id);
    $veranstaltung->{klassen} = [];
    while (my $row = $sth->fetchrow_hashref) {
	fixup_hashref($sth, $row);
	my $klasse = $row->{klasse};
	next unless $fahrer_in_klassen->[$klasse - 1];

	delete $row->{klasse};
	$row->{gruppen} = json_bool(0);
	$veranstaltung->{klassen}[$klasse - 1] = $row;
    }

    $veranstaltung->{wertungen} =
	veranstaltung_wertungen_aus_datenbank($dbh, $id);

    $sth = $dbh->prepare(q{
	SELECT klasse, sektion
	FROM sektion
	WHERE id = ?
	ORDER BY sektion
    });
    $sth->execute($id);
    $veranstaltung->{sektionen} = [];
    while (my @row = $sth->fetchrow_array) {
	fixup_arrayref($sth, \@row);
	my $klasse = $row[0];
	next unless $fahrer_in_klassen->[$klasse - 1];

	push @{$veranstaltung->{sektionen}[$klasse - 1]}, $row[1];
    }

    $sth = $dbh->prepare(q{
	SELECT klasse, runde, sektion
	FROM sektion_aus_wertung
	WHERE id = ?
	ORDER BY sektion
    });
    $sth->execute($id);
    $veranstaltung->{sektionen_aus_wertung} = [];
    while (my @row = $sth->fetchrow_array) {
	fixup_arrayref($sth, \@row);
	my $klasse = $row[0];
	next unless $fahrer_in_klassen->[$klasse - 1];

	push @{$veranstaltung->{sektionen_aus_wertung}[$klasse - 1][$row[1] - 1]}, $row[2];
    }

    if (@$gruppen) {
	push @$fahrer_in_klassen, $gruppen;

	my $klassen = {};
	foreach my $gruppe (@$gruppen) {
	    foreach my $startnummer (@{$gruppe->{fahrer}}) {
		    my $fahrer = $fahrer_nach_startnummer->{$startnummer};
		    $klassen->{$fahrer->{klasse}} = 1;
	    }
	}

	my $gruppen_klasse = {
		bezeichnung => 'Gruppen',
		gruppen => json_bool(1),
	};
	if (length keys %$klassen == 1) {
	    # Wenn alle Fahrer in allen Gruppen in der selben Klasse sind,
	    # duplizieren wir diese Klasse.
	    my $klasse = (values %$klassen)[0];
	    $gruppen_klasse->{runden} =
		    $veranstaltung->{klassen}[$klasse - 1]{runden};
	    push @{$veranstaltung->{sektionen}}, $veranstaltung->{sektionen}[$klasse - 1];
	} else {
	    # Wenn nicht, erzeugen wir für die Gruppen eine eigene Pseudo-Klasse
	    # mit der maximalen Anzahl an Runden und allen enthaltenen Sektionen.

	    my $runden = undef;
	    my $sektionen = {};
	    foreach my $klasse (values %$klassen) {
		    my $klasse_runden = $veranstaltung->{klassen}[$klasse - 1]{runden};
		    $runden = $klasse_runden
			    if !defined $runden || $klasse_runden > $runden;

		    my $klasse_sektionen = $veranstaltung->{sektionen}[$klasse - 1];
		    foreach my $sektion (@$klasse_sektionen) {
			    $sektionen->{$sektion + ''} = $sektion;
		    }
	    }

	    $gruppen_klasse->{runden} = $runden;
	    push @{$veranstaltung->{sektionen}}, [ sort { $a <=> $b } values %$sektionen ];
	}
	push @{$veranstaltung->{klassen}}, $gruppen_klasse;

	# Ergebnisse in Sektionen aus der Wertung werden in der Gruppenwertung
	# nicht berücksichtigt, es braucht für die Gruppen also auch keine
	# eigenen Sektionen aus der Wertung.
    }

    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	delete $fahrer->{klasse};
    }

    $sth = $dbh->prepare(q{
	SELECT feature
	FROM veranstaltung_feature
	WHERE id = ?
    });
    $sth->execute($id);
    $veranstaltung->{features} = [];
    while (my @row = $sth->fetchrow_array) {
	fixup_arrayref($sth, \@row);
	push @{$veranstaltung->{features}}, $row[0];
    }
    $result = { veranstaltung => $veranstaltung,
		fahrer => $fahrer_in_klassen };
} else {
    $status = "404 Not Found";
    $result->{error} = "Operation '$op' not defined";
}

# Note: The result must be a list or an object to be valid JSON!
$result = $result ? $json->encode($result) : '{}';
$result = Encode::encode_utf8($result);

my $headers = {
    type => 'application/json',
    charset => 'utf-8',
    status => $status
};
if (($ENV{HTTP_ACCEPT_ENCODING} // '') =~ /\bgzip\b/) {
    $headers->{'Content-Encoding'} = 'gzip';
    $result = Compress::Zlib::memGzip($result);
}
$headers->{'Content-Length'} = length($result);

print header($headers);
binmode STDOUT;
print $result;
