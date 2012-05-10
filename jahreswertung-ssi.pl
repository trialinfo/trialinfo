#! /usr/bin/perl -w

use CGI;
use DBI;
use RenderOutput;
use Wertungen qw(jahreswertung);
use strict;

my $database = 'mysql:mydb;mysql_enable_utf8=1';
my $username = 'auswertung';
my $password = '3tAw4oSs';

my $dbh = DBI->connect("DBI:$database", $username, $password)
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;
my $wereihe = $q->param('wertungsreihe');

my $bezeichnung;
my $vareihe;
my $streichresultate;
my $wertung;
my $fahrer_nach_startnummer;
my $sth;

print "Content-type: text/html; charset=utf-8\n\n";

$sth = $dbh->prepare(q{
    SELECT vareihe, bezeichnung, streichresultate
    FROM wereihe
    WHERE wereihe = ?
});
$sth->execute($wereihe);
if (my @row =  $sth->fetchrow_array) {
    ($vareihe, $bezeichnung, $streichresultate) = @row;
} else {
    doc_h1 "Wertungsreihe nicht gefunden.\n";
    exit;
}

$sth = $dbh->prepare(q{
    SELECT id, wertung, titel, subtitel
    FROM wertung
    JOIN vareihe_veranstaltung USING (id)
    JOIN wereihe USING (vareihe, wertung)
    WHERE wereihe = ?
});
$sth->execute($wereihe);
my $veranstaltungen;
while (my @row = $sth->fetchrow_array) {
    my $cfg;
    my $id = $row[0];
    $wertung = $row[1] - 1;
    $cfg->{id} = $id;
    $cfg->{titel}[$wertung] = $row[2];
    $cfg->{subtitel}[$wertung] = $row[3];
    $veranstaltungen->{$id}{cfg} = $cfg;
}

$sth = $dbh->prepare(q{
    SELECT id, klasse, startnummer, vorname, nachname, wertungspunkte
    FROM fahrer_wertung
    JOIN fahrer USING (id, startnummer)
    JOIN vareihe_veranstaltung USING (id)
    JOIN wereihe USING (vareihe)
    JOIN wereihe_klasse USING (wereihe, klasse)
    WHERE wereihe = ?;
});
$sth->execute($wereihe);
while (my @row = $sth->fetchrow_array) {
    my $fahrer;
    my $id = $row[0];
    $fahrer->{klasse} = $row[1];
    $fahrer->{startnummer} = $row[2];
    $fahrer->{vorname} = $row[3];
    $fahrer->{nachname} = $row[4];
    $fahrer->{wertungspunkte}[$wertung] = $row[5];
    my $startnummer = $fahrer->{startnummer};
    $veranstaltungen->{$id}{fahrer}{$startnummer} = $fahrer;
}

foreach my $id (keys %$veranstaltungen) {
    delete $veranstaltungen->{$id}
	unless exists $veranstaltungen->{$id}{fahrer};
}

$veranstaltungen = [ map { [ $_->{cfg}, $_->{fahrer} ] }
			 sort { $a->{cfg}{id} <=> $b->{cfg}{id} }
			      values %$veranstaltungen ];

my $letzte_cfg = $veranstaltungen->[@$veranstaltungen - 1][0];

$sth = $dbh->prepare(q{
    SELECT klasse, bezeichnung
    FROM klasse
    JOIN wereihe_klasse USING (klasse)
    WHERE wereihe = ? AND id = ?
});
$sth->execute($wereihe, $letzte_cfg->{id});
while (my @row = $sth->fetchrow_array) {
    $letzte_cfg->{klassen}[$row[0] - 1] = $row[1];
}

$sth = $dbh->prepare(q{
    SELECT bezeichnung
    FROM wertung
    WHERE id = ? AND wertung = ?
});
$sth->execute($letzte_cfg->{id}, $wertung + 1);
if (my @row = $sth->fetchrow_array) {
    $letzte_cfg->{wertungen}[$wertung] = $row[0];
}

$RenderOutput::html = 1;

doc_h1 "$bezeichnung";
if ($streichresultate) {
    if ($streichresultate == 1) {
	doc_h2 "Mit $streichresultate Streichresultat";
    } else {
	doc_h2 "Mit $streichresultate Streichresultaten";
    }
}
jahreswertung $veranstaltungen, $wertung, $streichresultate;
