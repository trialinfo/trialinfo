#! /usr/bin/perl -w

#
# TODO:
# * UTF-8-Codierung im Dateinamen in der Datenbank ist kaputt
# * Änderungen erkennen und nur Änderungen schicken
# * "Daemon" mode
# * Logfile?
# * Web-Auswertung: PHP?

use DBI;
use Trialtool;
#use Data::Compare;
use POSIX qw(strftime);
use File::stat;
use strict;

my $pfx = "";  # Präfix für die Tabellennamen

sub sync_to_db($$$$) {
    my ($dbh, $dateiname, $fahrer_nach_startnummer, $cfg) = @_;
    my $sth;
    my $id;  # Identifier der Veranstaltung

    my $cfg_st = stat("$dateiname.cfg")
	or die "$dateiname.cfg: $!\n";
    my $dat_st = stat("$dateiname.dat")
	or die "$dateiname.dat: $!\n";
    my $cfg_mtime = strftime("%Y-%m-%d %H:%M:%S", localtime($cfg_st->mtime));
    my $dat_mtime = strftime("%Y-%m-%d %H:%M:%S", localtime($dat_st->mtime));

    $dbh->begin_work;
    $sth = $dbh->prepare(qq{
	SELECT id, cfg_mtime, dat_mtime
	FROM ${pfx}veranstaltung
	WHERE dateiname = ?
    });
    $sth->execute($dateiname);
    my @ids = $sth->fetchrow_array;
    if (@ids) {
	if ($ids[1] eq $cfg_mtime && $ids[2] eq $dat_mtime) {
	    $dbh->rollback;
	    return;
	}
	$id = $ids[0];
	$sth = $dbh->prepare(qq{
	    UPDATE ${pfx}veranstaltung
	    SET cfg_mtime = ?, dat_mtime = ?
	    WHERE id = ?
	});
	$sth->execute($cfg_mtime, $dat_mtime, $id);
	foreach my $tabelle (qw(wertung fahrer klasse punkte runde sektion
				wertungspunkte)) {
	    $sth = $dbh->do(qq{DELETE FROM $tabelle WHERE veranstaltung = ?},
			    undef, $id);
	}
    } else {
	$sth = $dbh->prepare(qq{
	    SELECT MAX(id) + 1
	    FROM ${pfx}veranstaltung
	});
	$sth->execute;
	@ids = $sth->fetchrow_array;
	$id = (@ids && defined $ids[0]) ? $ids[0] : 1;
	$sth = $dbh->prepare(qq{
	    INSERT INTO ${pfx}veranstaltung (id, dateiname, cfg_mtime,
					     dat_mtime)
	    VALUES (?, ?, ?, ?)
	});
	$sth->execute($id, $dateiname, $cfg_mtime, $dat_mtime);
    }
    $sth = $dbh->prepare(qq{
	INSERT INTO ${pfx}wertung (veranstaltung, nummer, titel, subtitel,
			     bezeichnung)
	VALUES (?, ?, ?, ?, ?)
    });
    for (my $n = 0; $n < @{$cfg->{titel}}; $n++) {
	next if $cfg->{titel}[$n] eq "" && $cfg->{subtitel}[$n] eq "";
	$sth->execute($id, $n + 1, $cfg->{titel}[$n], $cfg->{subtitel}[$n],
		      $cfg->{wertungen}[$n]);
    }
    $sth = $dbh->prepare(qq{
	INSERT INTO ${pfx}wertungspunkte (veranstaltung, rang, punkte)
	VALUES (?, ?, ?)
    });
    for (my $n = 0; $n < @{$cfg->{wertungspunkte}}; $n++) {
	next unless $cfg->{wertungspunkte}[$n] != 0;
	$sth->execute($id, $n + 1, $cfg->{wertungspunkte}[$n]);
    }
    $sth = $dbh->prepare(qq{
	INSERT INTO ${pfx}sektion (veranstaltung, klasse, sektion)
	VALUES (?, ?, ?)
    });
    for (my $m = 0; $m < @{$cfg->{sektionen}}; $m++) {
	for (my $n = 0; $n < length $cfg->{sektionen}[$m]; $n++) {
	    next if substr($cfg->{sektionen}[$m], $n, 1) eq "N";
	    $sth->execute($id, $m + 1, $n + 1);
	}
    }
    $sth = $dbh->prepare(qq{
	INSERT INTO ${pfx}klasse (veranstaltung, nummer, bezeichnung)
	VALUES (?, ?, ?)
    });
    for (my $n = 0; $n < @{$cfg->{klassen}}; $n++) {
	next if $cfg->{klassen}[$n] eq "";
	$sth->execute($id, $n + 1, $cfg->{klassen}[$n]);
    }

    # FIXME: Irgendwie das Feld klasse.jahreswertung setzen ... oder das pro
    # fahrer machen und gleich die ganzen wertungen unterstützen?

    my @felder = qw(
	startnummer klasse nachname vorname strasse wohnort plz club fahrzeug
	telefon lizenznummer rahmennummer kennzeichen hubraum bemerkung land
	startzeit zielzeit stechen nennungseingang papierabnahme runden ausfall
	punkte wertungspunkte rang
    );
    $sth = $dbh->prepare(sprintf qq{
	INSERT INTO ${pfx}fahrer (veranstaltung, %s, geburtsdatum, s0, s1, s2, s3)
	VALUES (?, %s, ?, ?, ?, ?, ?)
    }, join(", ", @felder), join(", ", map { "?" } @felder));
    my $sth2 = $dbh->prepare(qq{
	INSERT INTO ${pfx}punkte (veranstaltung, startnummer, runde, sektion,
				  punkte)
	VALUES (?, ?, ?, ?, ?)
    });
    my $sth3 = $dbh->prepare(qq{
	INSERT INTO ${pfx}runde (veranstaltung, startnummer, runde, punkte)
	VALUES (?, ?, ?, ?)
    });
    # FIXME: Zusatzpunkte?
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	my $geburtsdatum;
	$geburtsdatum = "$3-$2-$1"
	    if (exists $fahrer->{geburtsdatum} &&
		$fahrer->{geburtsdatum} =~ /^(\d\d)\.(\d\d)\.(\d\d\d\d)$/);
	$sth->execute($id, (map { $fahrer->{$_} } @felder), $geburtsdatum,
		      $fahrer->{os_1s_2s_3s}[0], $fahrer->{os_1s_2s_3s}[1],
		      $fahrer->{os_1s_2s_3s}[2], $fahrer->{os_1s_2s_3s}[3]);

	for (my $m = 0; $m < @{$fahrer->{punkte_pro_sektion}}; $m++) {
	    my $punkte = $fahrer->{punkte_pro_sektion}[$m];
	    for (my $n = 0; $n < @$punkte; $n++) {
		next if $punkte->[$n] == 6;
		$sth2->execute($id, $fahrer->{startnummer}, $m + 1, $n + 1,
			       $punkte->[$n]);
	    }
	    if ($m < $fahrer->{runden}) {
		$sth3->execute($id, $fahrer->{startnummer}, $m + 1,
			       $fahrer->{punkte_pro_runde}[$m]);
	   }
	}
    }
    $dbh->commit;
}

my $dateiname = $ARGV[0];
$dateiname =~ s/\.(cfg|dat)$//i;
print "Datei $dateiname.cfg nicht gefunden\n"
    unless -e "$dateiname.cfg";
print "Datei $dateiname.dat nicht gefunden\n"
    unless -e "$dateiname.dat";

my $cfg = cfg_datei_parsen("$dateiname.cfg");
my $fahrer_nach_startnummer = dat_datei_parsen("$dateiname.dat");
wertungspunkte_einfuegen $fahrer_nach_startnummer, $cfg;

# 'DBI:mysql:databasename;host=db.example.com'
my $dbh = DBI->connect('DBI:mysql:mydb', 'agruen', '76KILcxM',
		       { RaiseError => 1, AutoCommit => 1 })
    or die "Could not connect to database: $DBI::errstr\n";

sync_to_db $dbh, $dateiname, $fahrer_nach_startnummer, $cfg;
