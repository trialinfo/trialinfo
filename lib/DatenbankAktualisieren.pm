# Trialtool: Datenbankfunktionen

# Copyright 2013-2014  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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

package DatenbankAktualisieren;
use Trialtool qw(gestartete_klassen);
use Datenbank qw(cfg_aus_datenbank wertung_aus_datenbank equal);
use Berechnung qw(rang_und_wertungspunkte_berechnen);
use Storable qw(dclone);
use JSON_bool;
use Tag;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(einen_fahrer_aktualisieren fahrer_aktualisieren
	     veranstaltung_aktualisieren wertung_aktualisieren
	     veranstaltung_duplizieren vareihe_aktualisieren);
use strict;

# datensatz_aktualisieren
#
# Abhängig von den alten und neuen Werten für die einzelnen Felder wird er alte
# Datensatz gelöscht, aktualisiert, oder ein neuer Datensatz eingefügt.
#
# $versionierung ist -1, wenn eine Tabelle keine Version hat, 0, wenn die
# Version überprüft werden soll, und 1, wenn die Version immer erhöht werden
# soll.
#
sub datensatz_aktualisieren($$$$$$$$$) {
    my ($callback, $tabelle, $changed, $versionierung, $keys, $nonkeys, $kval, $alt, $neu) = @_;
    my ($sql, $args, $davor);

    #map { $_ = json_unbool($_) } @$kval;
    map { $_ = json_unbool($_) } @$alt
	if defined $alt;
    map { $_ = json_unbool($_) } @$neu
	if defined $neu;

    if (defined $alt) {
	if (defined $neu) {
	    my $modified_nonkeys = [];
	    my $modified_old = [];
	    my $modified_new = [];
	    for (my $n = 0; $n < @$nonkeys; $n++) {
		unless (equal($alt->[$n], $neu->[$n])) {
		    push @$modified_nonkeys, $nonkeys->[$n];
		    push @$modified_old, $alt->[$n];
		    push @$modified_new, $neu->[$n];
		}
	    }
	    if (($changed && $versionierung > 0) || @$modified_nonkeys) {
		if ($versionierung >= 0) {
		    push @$keys, 'version';
		    push @$kval, $alt->[0];
		}
		if ($versionierung > 0) {
		    if (!@$modified_nonkeys ||
			$modified_nonkeys->[0] ne 'version') {
			$neu->[0]++;
			unshift @$modified_nonkeys, 'version';
			unshift @$modified_old, $alt->[0];
			unshift @$modified_new, $neu->[0];
		    }
		}
		$nonkeys = $modified_nonkeys;
		$alt = $modified_old;
		$neu = $modified_new;
		for (my $n = 0; $n < @$nonkeys; $n++) {
		    push @$davor, [ $nonkeys->[$n], $alt->[$n] ];
		}
		$sql = "UPDATE $tabelle " .
		    "SET " . join(", ", map { "$_ = ?" } @$nonkeys) . " " .
		    "WHERE " . join(" AND ", map { "$_ = ?" } @$keys);
		$args = [@$neu, @$kval];
	    }
	} else {
	    if ($versionierung >= 0) {
		push @$keys, 'version';
		push @$kval, $alt->[0];
	    }
	    $sql = "DELETE FROM $tabelle " .
		"WHERE " . join(" AND ", map { "$_ = ?" } @$keys);
	    $args = $kval;
	    # FIXME: Gibt es eine vernünftige Möglichkeit festzustellen, ob der
	    # Datensatz mit einer anderen Version existiert?
	}
    } elsif (defined $neu) {
	if ($versionierung >= 0) {
	    $neu->[0] = 1
		unless $neu->[0];
	}
	$sql = "INSERT INTO $tabelle (" . join(", ", @$keys, @$nonkeys) . ") " .
	    "VALUES (" . join(", ", map { "?" } (@$keys, @$nonkeys)) . ")";
	$args = [@$kval, @$neu];
    }
    if (defined $sql) {
	my $affected_rows = &$callback($sql, $args, $davor);
	if ($affected_rows != 1) {
	    die "'$sql': $affected_rows statt 1 Datensatz betroffen" .
		($neu ? "" : "; Version vermutlich ungültig") . "\n";
	}
	return 1;
    }
    return undef;
}

sub deletes_updates_inserts($$) {
    my ($alt, $neu) = @_;
    my ($deletes, $updates, $inserts) = ([], [], []);

    foreach my $key (keys %$alt) {
	if (exists $neu->{$key}) {
	    push @$updates, $key;
	} else {
	    push @$deletes, $key;
	}
    }
    foreach my $key (keys %$neu) {
	push @$inserts, $key
	    unless exists $alt->{$key};
    }
    return ([sort @$deletes], [sort @$updates], [sort @$inserts]);
}

sub hash_aktualisieren($$$$$$$) {
    my ($callback, $tabelle, $keys, $nonkeys, $const_keys, $alt, $neu) = @_;
    my $changed;

    my ($deletes, $updates, $inserts) = deletes_updates_inserts($alt, $neu);
    foreach my $hashkey (@$deletes) {
	datensatz_aktualisieren $callback, $tabelle,
		undef, -1,
		$keys, $nonkeys,
		[@$const_keys, split(/:/, $hashkey)],
		$alt->{$hashkey},
		undef
	    and $changed = 1;
    }
    foreach my $hashkey (@$updates) {
	datensatz_aktualisieren $callback, $tabelle,
		undef, -1,
		$keys, $nonkeys,
		[@$const_keys, split(/:/, $hashkey)],
		$alt->{$hashkey},
		$neu->{$hashkey}
	    and $changed = 1;
    }
    foreach my $hashkey (@$inserts) {
	datensatz_aktualisieren $callback, $tabelle,
		undef, -1,
		$keys, $nonkeys,
		[@$const_keys, split(/:/, $hashkey)],
		undef,
		$neu->{$hashkey}
	    and $changed = 1;
    }
    return $changed;
}

sub punkte_pro_sektion_hash($) {
    my ($fahrer) = @_;

    my $hash = {};
    if ($fahrer) {
	my $punkte_pro_sektion = $fahrer->{punkte_pro_sektion} // [];
	for (my $runde = 0; $runde < @$punkte_pro_sektion; $runde++) {
	    my $punkte_in_runde = $punkte_pro_sektion->[$runde];
	    if ($punkte_in_runde) {
		for (my $sektion = 0; $sektion < @$punkte_in_runde; $sektion++) {
		    my $punkte = $punkte_in_runde->[$sektion];
		    next unless defined $punkte;
		    $hash->{($runde + 1) . ':' . ($sektion + 1)} = [ $punkte ];
		}
	    }
	}
    }
    return $hash;
}

sub punkte_pro_runde_hash($) {
    my ($fahrer) = @_;

    my $hash = {};
    if ($fahrer) {
	my $punkte_pro_runde = $fahrer->{punkte_pro_runde} // [];
	for (my $runde = 0; $runde < @$punkte_pro_runde; $runde++) {
	    $hash->{$runde + 1} = [ $punkte_pro_runde->[$runde] ];
	}
    }
    return $hash;
}

sub fahrer_wertungen_hash($) {
    my ($fahrer) = @_;

    my $hash = {};
    if ($fahrer) {
	my $wertungen = $fahrer->{wertungen} // [];
	for (my $n = 0; $n < @$wertungen; $n++) {
	    my $wertung = $wertungen->[$n];
	    next unless $wertung && $wertung->{aktiv};
	    $hash->{$n + 1} = [ $wertung->{rang},
				$wertung->{punkte} ];
	}
    }
    return $hash;
}

sub startnummer_aendern($$$$) {
    my ($callback, $id, $alt, $neu) = @_;

    foreach my $tabelle (qw(fahrer fahrer_wertung punkte runde neue_startnummer)) {
	&$callback(qq{
	    UPDATE $tabelle
	    SET startnummer = ?
	    WHERE id = ? AND startnummer = ?
	}, [$neu, $id, $alt], undef);
    }
}

sub einen_fahrer_aktualisieren($$$$$) {
    my ($callback, $id, $alt, $neu, $versionierung) = @_;
    my $changed;

    if ($alt && $neu && $alt->{startnummer} != $neu->{startnummer}) {
	startnummer_aendern $callback, $id, $alt->{startnummer},
			    $neu->{startnummer};
	$alt->{startnummer} = $neu->{startnummer};
	$changed = 1;
    }

    my $startnummer = $alt ? $alt->{startnummer} : $neu->{startnummer};
    if (!$neu || exists $neu->{punkte_pro_sektion}) {
	hash_aktualisieren $callback, 'punkte',
		[qw(id startnummer runde sektion)], [qw(punkte)],
		[$id, $startnummer],
		punkte_pro_sektion_hash($alt),
		punkte_pro_sektion_hash($neu)
	    and $changed = 1;
    }
    if (!$neu || exists $neu->{punkte_pro_runde}) {
	hash_aktualisieren $callback, 'runde',
		[qw(id startnummer runde)], [qw(punkte)],
		[$id, $startnummer],
		punkte_pro_runde_hash($alt),
		punkte_pro_runde_hash($neu)
	    and $changed = 1;
    }
    if (!$neu || exists $neu->{wertungen}) {
	if ($alt && $neu) {
	    # Die Datenbank speichert Fließkommazahlen wahrscheinlich nicht mit
	    # derselben Genauigkeit, die Perl für die Berechnung verwendet.
	    my $eps = 1 / (1 << 13);
	    my $w_alt = $alt->{wertungen};
	    my $w_neu = $neu->{wertungen};
	    for (my $wertung = 1; $wertung <= @$w_neu; $wertung++) {
		if (defined $w_alt->[$wertung - 1]{punkte} &&
		    defined $w_neu->[$wertung - 1]{punkte} &&
		    abs($w_alt->[$wertung - 1]{punkte} -
			$w_neu->[$wertung - 1]{punkte}) < $eps) {
		    $w_alt->[$wertung - 1]{punkte} =
			$w_neu->[$wertung - 1]{punkte};
		}
	    }
	}

	hash_aktualisieren $callback, 'fahrer_wertung',
		[qw(id startnummer wertung)], [qw(wertungsrang wertungspunkte)],
		[$id, $startnummer],
		fahrer_wertungen_hash($alt),
		fahrer_wertungen_hash($neu)
	    and $changed = 1;
    }

    my $felder = [];
    my $felder_alt = $alt ? [] : undef;
    my $felder_neu = $neu ? [] : undef;
    if ($neu) {
	foreach my $feld (qw(
	    klasse helfer bewerber nenngeld nachname vorname strasse wohnort
	    plz club fahrzeug geburtsdatum telefon lizenznummer rahmennummer
	    kennzeichen hubraum email bemerkung land bundesland helfer_nummer
	    startzeit zielzeit stechen nennungseingang start
	    start_morgen versicherung runden ausser_konkurrenz ausfall
	    zusatzpunkte punkte rang)) {
	    if (exists $neu->{$feld}) {
		push @$felder, $feld;
		push @$felder_alt, $alt->{$feld}
		    if $alt;
		push @$felder_neu, $neu->{$feld};
	    }
	}
	if (exists $neu->{punkteverteilung}) {
	    for (my $n = 0; $n <= 5; $n++) {
		push @$felder, "s$n";
		push @$felder_alt, $alt->{punkteverteilung}[$n]
		    if $alt;
		push @$felder_neu, $neu->{punkteverteilung}[$n];
	    }
	}
    }

    if ($versionierung >= 0) {
	unshift @$felder, 'version';
	unshift @$felder_alt, $alt->{version}
	    if $alt;
	unshift @$felder_neu, $neu->{version}
	    if $neu;
    }

    datensatz_aktualisieren $callback, 'fahrer',
	    $changed, $versionierung,
	    [qw(id startnummer)], $felder,
	    [$id, $startnummer],
	    $felder_alt,
	    $felder_neu
	and $changed = 1;
    $neu->{version} = $felder_neu->[0]
	if $versionierung > 0 && $neu;
    return $changed;
}

sub fahrer_aktualisieren($$$$$) {
    my ($callback, $id, $alt, $neu, $versionierung) = @_;
    my $changed;

    my ($deletes, $updates, $inserts) =
	deletes_updates_inserts($alt, $neu);
    if (@$deletes) {
	foreach my $startnummer (@$deletes) {
	    einen_fahrer_aktualisieren $callback, $id, $alt->{$startnummer},
		    undef, $versionierung
		and $changed = 1;
	}
    }
    if (@$updates) {
	foreach my $startnummer (@$updates) {
	    einen_fahrer_aktualisieren $callback, $id, $alt->{$startnummer},
		    $neu->{$startnummer}, $versionierung
		and $changed = 1;
	}
    }
    if (@$inserts) {
	foreach my $startnummer (@$inserts) {
	    einen_fahrer_aktualisieren $callback, $id, undef,
		    $neu->{$startnummer}, $versionierung
		and $changed = 1;
	}
    }
    return $changed;
}

sub veranstaltung_wertungen_hash($) {
    my ($cfg) = @_;

    my $hash = {};
    if ($cfg && $cfg->{wertungen}) {
	for (my $n = 0; $n < @{$cfg->{wertungen}}; $n++) {
	    my $wertung = $cfg->{wertungen}[$n];
	    next unless $wertung;
	    next if ($wertung->{titel} // "") eq "" &&
		    ($wertung->{subtitel} // "") eq "" &&
		    ($wertung->{bezeichnung} // "") eq "";
	    $hash->{$n + 1} = [$wertung->{titel},
			       $wertung->{subtitel},
			       $wertung->{bezeichnung}];
	}
    }
    return $hash;
}

sub wertungspunkte_hash($$) {
    my ($cfg, $minimieren) = @_;

    my $hash = {};
    if ($cfg && $cfg->{wertungspunkte}) {
	my $n = @{$cfg->{wertungspunkte}} - 1;
	if ($minimieren) {
	    # Gleiche Werte am Ende der Tabelle zusammenfassen: der letzte Wert
	    # gilt für alle weiteren Plätze.
	    for (; $n > 0; $n--) {
		last unless equal($cfg->{wertungspunkte}[$n], $cfg->{wertungspunkte}[$n - 1]);
	    }
	}
        for (; $n >= 0; $n--) {
	    my $wertungspunkte = $cfg->{wertungspunkte}[$n];
	    $hash->{$n + 1} = [$wertungspunkte]
		if defined $wertungspunkte;
        }
    }
    return $hash;
}

sub sektionen_hash($) {
    my ($cfg) = @_;

    my $hash = {};
    if ($cfg && $cfg->{sektionen}) {
	for (my $m = 0; $m < @{$cfg->{sektionen}}; $m++) {
	    foreach my $sektion (@{$cfg->{sektionen}[$m]}) {
		$hash->{($m + 1) . ':' . $sektion} = [];
	    }
	}
    }
    return $hash;
}

sub klassen_hash($) {
    my ($cfg) = @_;

    my $hash = {};
    if ($cfg && $cfg->{klassen}) {
	my $gestartete_klassen =
	    exists $cfg->{sektionen} ? gestartete_klassen($cfg) : [];
	for (my $n = 0; $n < @{$cfg->{klassen}}; $n++) {
	    my $klasse = $cfg->{klassen}[$n];
	    next unless $klasse;
	    $hash->{$n + 1} = [$klasse->{runden},
			       $klasse->{bezeichnung},
			       json_bool($gestartete_klassen->[$n] // 0),
			       $klasse->{farbe},
			       $klasse->{fahrzeit},
			       $klasse->{wertungsklasse},
			       $klasse->{keine_wertung1},
			       $klasse->{ausser_konkurrenz}];
	}
    }
    return $hash;
}

sub kartenfarben_hash($) {
    my ($cfg) = @_;

    my $hash = {};
    if ($cfg) {
	for (my $n = 0; $n < @{$cfg->{kartenfarben}}; $n++) {
	    my $farbe = $cfg->{kartenfarben}[$n];
	    next unless defined $farbe;
	    $hash->{$n + 1} = [$farbe];
	}
    }
    return $hash;
}

sub feature_hash($) {
    my ($cfg) = @_;

    my $hash = {};
    if ($cfg) {
	foreach my $feature (@{$cfg->{features}}) {
	    $hash->{$feature} = [];
	}
    }
    return $hash;
}

sub vareihe_hash($) {
    my ($cfg) = @_;

    my $hash = {};
    if ($cfg) {
	foreach my $vareihe (@{$cfg->{vareihen}}) {
	    $hash->{$vareihe} = [];
	}
    }
    return $hash;
}

sub neue_startnummern_hash($) {
    my ($cfg) = @_;

    my $hash = {};
    if ($cfg) {
	my $neue_startnummern = $cfg->{neue_startnummern};
	foreach my $vareihe (@{$cfg->{vareihen}}) {
	    foreach my $startnummer (keys %$neue_startnummern) {
		$hash->{"$vareihe:$startnummer"} = [$neue_startnummern->{$startnummer}];
	    }
	}
    }
    return $hash;
}

sub sektionen_aus_wertung_hash($) {
    my ($cfg) = @_;

    my $hash = {};
    if ($cfg) {
	my $sektionen_aus_wertung = $cfg->{sektionen_aus_wertung} // [];
	for (my $klasse = 1; $klasse <= @$sektionen_aus_wertung; $klasse++) {
	    my $runden_sektionen = $sektionen_aus_wertung->[$klasse - 1];
	    next unless $runden_sektionen;
	    for (my $runde = 1; $runde <= @$runden_sektionen; $runde++) {
		my $sektionen = $runden_sektionen->[$runde - 1];
		next unless $sektionen;
		foreach my $sektion (@$sektionen) {
		    $hash->{"$klasse:$runde:$sektion"} = [];
		}
	    }
	}
    }
    return $hash;
}

sub veranstaltung_aktualisieren($$$$$) {
    my ($callback, $id, $alt, $neu, $versionierung) = @_;
    my $changed;

    if (!$neu || exists $neu->{wertungen}) {
	hash_aktualisieren $callback, 'wertung',
		[qw(id wertung)], [qw(titel subtitel bezeichnung)],
		[$id],
		veranstaltung_wertungen_hash($alt),
		veranstaltung_wertungen_hash($neu)
	    and $changed = 1;
    }
    if (!$neu || exists $neu->{wertungspunkte}) {
	hash_aktualisieren $callback, 'wertungspunkte',
		[qw(id rang)], [qw(punkte)],
		[$id],
		wertungspunkte_hash($alt, 0),
		wertungspunkte_hash($neu, 1)
	    and $changed = 1;
    }
    if (!$neu || exists $neu->{sektionen}) {
	hash_aktualisieren $callback, 'sektion',
		[qw(id klasse sektion)], [],
		[$id],
		sektionen_hash($alt),
		sektionen_hash($neu)
	    and $changed = 1;
    }

    if (!$neu || exists $neu->{klassen}) {
	hash_aktualisieren $callback, 'klasse',
		[qw(id klasse)], [qw(runden bezeichnung gestartet farbe
				     fahrzeit wertungsklasse keine_wertung1
				     ausser_konkurrenz)],
		[$id],
		klassen_hash($alt),
		klassen_hash($neu)
	    and $changed = 1;
    }

    if (!$neu || exists $neu->{kartenfarben}) {
	hash_aktualisieren $callback, 'kartenfarbe',
		[qw(id runde)], [qw(farbe)],
		[$id],
		kartenfarben_hash($alt),
		kartenfarben_hash($neu)
	    and $changed = 1;
    }

    if (!$neu || exists $neu->{features}) {
	hash_aktualisieren $callback, 'veranstaltung_feature',
		[qw(id feature)], [],
		[$id],
		feature_hash($alt),
		feature_hash($neu)
	    and $changed = 1;
    }

    if (!$neu || exists $neu->{vareihen}) {
	hash_aktualisieren $callback, 'vareihe_veranstaltung',
		[qw(id vareihe)], [],
		[$id],
		vareihe_hash($alt),
		vareihe_hash($neu)
	    and $changed = 1;
    }

    if (!$neu || exists $neu->{neue_startnummern}) {
	hash_aktualisieren $callback, 'neue_startnummer',
		[qw(id vareihe startnummer)], [qw(neue_startnummer)],
		[$id],
		neue_startnummern_hash($alt),
		neue_startnummern_hash($neu)
	    and $changed = 1;
    }

    if (!$neu || exists $neu->{sektionen_aus_wertung}) {
	hash_aktualisieren $callback, 'sektion_aus_wertung',
		[qw(id klasse runde sektion)], [],
		[$id],
		sektionen_aus_wertung_hash($alt),
		sektionen_aus_wertung_hash($neu)
	    and $changed = 1;
    }

    while (!$alt && !$neu->{tag}) {
	$neu->{tag} = random_tag(16);
    }

    my $felder = [];
    my $felder_alt = $alt ? [] : undef;
    my $felder_neu = $neu ? [] : undef;
    if ($neu) {
	foreach my $feld (qw(
	    tag dateiname datum art aktiv vierpunktewertung wertungsmodus
	    punkte_sektion_auslassen wertungspunkte_234 rand_links rand_oben
	    wertung1_markiert versicherung ergebnislistenbreite
	    ergebnisliste_feld mtime punkteteilung sync_erlaubt
	    abgeschlossen)) {
	    if (exists $neu->{$feld}) {
		push @$felder, $feld;
		push @$felder_alt, $alt->{$feld}
		    if $alt;
		push @$felder_neu, $neu->{$feld};
	    }
	}
	if (exists $neu->{basis}) {
	    push @$felder, 'basis';
	    push @$felder_alt, $alt->{basis}{tag}
		if $alt;
	    push @$felder_neu, $neu->{basis}{tag};
	}
    }

    if ($versionierung >= 0) {
	unshift @$felder, 'version';
	unshift @$felder_alt, $alt->{version}
	    if $alt;
	unshift @$felder_neu, $neu->{version}
	    if $neu;
    }

    datensatz_aktualisieren $callback, 'veranstaltung',
	    $changed, $versionierung,
	    [qw(id)], $felder,
	    [$id],
	    $felder_alt,
	    $felder_neu
	and $changed = 1;
    $neu->{version} = $felder_neu->[0];
    return $changed;
}

sub vareihe_klassen_hash($) {
    my ($vareihe) = @_;

    my $hash = {};
    if ($vareihe && $vareihe->{klassen}) {
	foreach my $klasse (@{$vareihe->{klassen}}) {
	    $hash->{$klasse->{klasse}} =
		[ $klasse->{laeufe}, $klasse->{streichresultate} ];
	}
    }
    return $hash;
}

sub vareihe_veranstaltungen_hash($) {
    my ($vareihe) = @_;

    my $hash = {};
    if ($vareihe && $vareihe->{veranstaltungen}) {
	foreach my $id (@{$vareihe->{veranstaltungen}}) {
	    $hash->{$id} = [];
	}
    }
    return $hash;
}

sub startnummern_hash($) {
    my ($vareihe) = @_;

    my $hash = {};
    if ($vareihe && $vareihe->{startnummern}) {
	foreach my $id (keys %{$vareihe->{startnummern}}) {
	    my $aenderungen = $vareihe->{startnummern}{$id};
	    foreach my $aenderung (@$aenderungen) {
	      next unless defined $aenderung->{alt};
	      $hash->{"$id:$aenderung->{alt}"} = [$aenderung->{neu}];
	    }
	}
    }
    return $hash;
}

sub vareihe_aktualisieren($$$$$) {
    my ($callback, $vareihe, $alt, $neu, $versionierung) = @_;

    my $changed;

    if (!$neu || exists $neu->{klassen}) {
	hash_aktualisieren $callback, 'vareihe_klasse',
		[qw(vareihe wertungsklasse)], [qw(laeufe streichresultate)],
		[$vareihe],
		vareihe_klassen_hash($alt),
		vareihe_klassen_hash($neu)
	    and $changed = 1;
    }

    if (!$neu || exists $neu->{veranstaltungen}) {
	hash_aktualisieren $callback, 'vareihe_veranstaltung',
		[qw(vareihe id)], [],
		[$vareihe],
		vareihe_veranstaltungen_hash($alt),
		vareihe_veranstaltungen_hash($neu)
	    and $changed = 1;
    }

    if (!$neu || exists $neu->{startnummern}) {
	hash_aktualisieren $callback, 'neue_startnummer',
		[qw(vareihe id startnummer)], [qw(neue_startnummer)],
		[$vareihe],
		startnummern_hash($alt),
		startnummern_hash($neu)
	    and $changed = 1;
    }

    while (!$alt && !$neu->{tag}) {
	$neu->{tag} = random_tag(16);
    }

    my $felder = [];
    my $felder_alt = $alt ? [] : undef;
    my $felder_neu = $neu ? [] : undef;
    if ($neu) {
	foreach my $feld (qw(tag wertung bezeichnung kuerzel verborgen)) {
	    if (exists $neu->{$feld}) {
		push @$felder, $feld;
		push @$felder_alt, $alt->{$feld}
		    if $alt;
		push @$felder_neu, $neu->{$feld};
	    }
	}
    }

    if ($versionierung >= 0) {
	unshift @$felder, 'version';
	unshift @$felder_alt, $alt->{version}
	    if $alt;
	unshift @$felder_neu, $neu->{version}
	    if $neu;
    }

    datensatz_aktualisieren $callback, 'vareihe',
	    $changed, $versionierung,
	    [qw(vareihe)], $felder,
	    [$vareihe],
	    $felder_alt,
	    $felder_neu
	and $changed = 1;
    $neu->{version} = $felder_neu->[0];
    return $changed;
}

sub wertung_aktualisieren($$$) {
    my ($dbh, $callback, $id) = @_;
    my ($cfg, $fahrer_nach_startnummer0, $fahrer_nach_startnummer1);

    $cfg = cfg_aus_datenbank($dbh, $id);
    $fahrer_nach_startnummer0 = wertung_aus_datenbank($dbh, $id);
    $fahrer_nach_startnummer1 = dclone $fahrer_nach_startnummer0;
    rang_und_wertungspunkte_berechnen $fahrer_nach_startnummer1, $cfg;
    fahrer_aktualisieren $callback, $id,
			 $fahrer_nach_startnummer0, $fahrer_nach_startnummer1, -1;
}

sub veranstaltung_duplizieren($$$) {
    my ($callback, $id, $id_neu) = @_;

    foreach my $table (qw(fahrer fahrer_wertung klasse punkte runde sektion
			  veranstaltung veranstaltung_feature kartenfarbe
			  wertung wertungspunkte neue_startnummer
			  vareihe_veranstaltung sektion_aus_wertung)) {
	&$callback(qq{
	    CREATE TEMPORARY TABLE ${table}_temp AS (SELECT * FROM $table WHERE id = ?)
	}, [$id], undef);
	if ($table =~ /^(veranstaltung|fahrer)$/) {
	    &$callback(qq{
		UPDATE ${table}_temp
		SET id = ?, version = 1
	    }, [$id_neu], undef);
	} else {
	    &$callback(qq{
		UPDATE ${table}_temp
		SET id = ?
	    }, [$id_neu], undef);
	}
	&$callback(qq{
	    INSERT INTO $table
	    SELECT * FROM ${table}_temp
	}, [], undef);
	&$callback(qq{
	    DROP TEMPORARY TABLE ${table}_temp
	}, [], undef);
	&$callback(qq{
	    UPDATE vareihe SET version = version + 1
	    WHERE vareihe IN
		( SELECT vareihe
		FROM vareihe_veranstaltung
		WHERE id = ? )
	}, [$id_neu], undef);
    }
}
