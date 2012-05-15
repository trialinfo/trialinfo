#! /usr/bin/perl -w -I..

use CGI;
use DBI;
use RenderOutput;
use Wertungen qw(jahreswertung);
use strict;

$RenderOutput::html = 1;

my $database = 'mysql:mydb;mysql_enable_utf8=1';
my $username = 'auswertung';
my $password = '3tAw4oSs';

my $dbh = DBI->connect("DBI:$database", $username, $password)
    or die "Could not connect to database: $DBI::errstr\n";

my $q = CGI->new;

print "Content-type: text/html; charset=utf-8\n\n";

doc_h1 "Veranstaltungsergebnisse";
my $sth = $dbh->prepare(q{
    SELECT wereihe, bezeichnung
    FROM wereihe
    ORDER BY wereihe
});
$sth->execute;
while (my @row =  $sth->fetchrow_array) {
    my ($wereihe, $bezeichnung) = @row;
    doc_h2 $bezeichnung;
    my $sth2 = $dbh->prepare(q{
	SELECT id, titel
	FROM wereihe
	JOIN vareihe_veranstaltung USING (vareihe)
	JOIN wertung USING (id, wertung)
	WHERE wereihe = ? AND EXISTS (
	    SELECT *
	    FROM klasse
	    JOIN wereihe_klasse USING (klasse)
	    WHERE wereihe = wereihe.wereihe AND gestartet AND id = wertung.id
	)
	ORDER BY id;
    });
    $sth2->execute($wereihe);
    print "<p>\n";
    while (my@row = $sth2->fetchrow_array) {
	my ($id, $titel) = @row;
	print "<a href=\"tageswertung.shtml?wertungsreihe=$wereihe&id=$id\">$titel</a><br>\n";
    }
    print "</p>\n";
    print "<p>\n";
    print "<a href=\"jahreswertung.shtml?wertungsreihe=$wereihe\">Jahreswertung</a><br>\n";
    print "</p>\n";
    print "\n";
}

doc_h1 "Punktestatistiken";
my $sth = $dbh->prepare(q{
    SELECT DISTINCT id, titel
    FROM veranstaltung
    JOIN wertung USING (id)
    JOIN vareihe_veranstaltung USING (id)
    JOIN wereihe USING (vareihe, wertung)
    ORDER BY id;
});
$sth->execute;
print "<p>\n";
while (my @row =  $sth->fetchrow_array) {
    my ($id, $titel) = @row;
    print "<a href=\"statistik.shtml?id=$id\">$titel</a><br>\n";
}
print "</p>\n";
