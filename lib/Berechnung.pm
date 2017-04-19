# Berechnung

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

package Berechnung;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(rang_und_wertungspunkte_berechnen wertungsklassen_setzen ausser_konkurrenz fahrer_nach_klassen);

use utf8;
use List::Util qw(min);
use Auswertung;
use strict;

sub wertungsklassen_setzen($$) {
    my ($fahrer_nach_startnummer, $cfg) = @_;
    my $klassen = $cfg->{klassen};

    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	my $klasse = $fahrer->{klasse};
	my $wertungsklasse;
	$wertungsklasse = $klassen->[$klasse - 1]{wertungsklasse}
	  if defined $klasse;
	$fahrer->{wertungsklasse} = $wertungsklasse;
    }
}

sub ausser_konkurrenz($$) {
    my ($fahrer, $cfg) = @_;

    return $fahrer->{ausser_konkurrenz} ||
	   (defined $fahrer->{klasse} &&
	    $cfg->{klassen}[$fahrer->{klasse} - 1]{ausser_konkurrenz}) ||
	   0;
}

sub rang_vergleich($$$) {
    my ($a, $b, $cfg) = @_;

    if (ausser_konkurrenz($a, $cfg) != ausser_konkurrenz($b, $cfg)) {
	return ausser_konkurrenz($a, $cfg) <=> ausser_konkurrenz($b, $cfg);
    }

    if ($a->{ausfall} != $b->{ausfall}) {
	# Fahrer ohne Ausfall zuerst
	return $a->{ausfall} <=> $b->{ausfall}
	    if !$a->{ausfall} != !$b->{ausfall};
    }

    # Aufsteigend nach offenen Sektionen: dadurch werden die Fahrer auf dann
    # richtig gereiht, wenn die Punkte sektionsweise statt rundenweise
    # eingegeben werden.
    return $a->{offene_sektionen} <=> $b->{offene_sektionen}
	if ($a->{offene_sektionen} // 0) != ($b->{offene_sektionen} // 0);

    # Aufsteigend nach Punkten
    return ($a->{punkte} // 0) <=> ($b->{punkte} // 0)
	if ($a->{punkte} // 0) != ($b->{punkte} // 0);

    # Aufsteigend nach Ergebnis im Stechen
    return $a->{stechen} <=> $b->{stechen}
	if  ($a->{stechen} // 0) != ($b->{stechen} // 0);

    # Abfallend nach 0ern, 1ern, 2ern, 3ern, 4ern
    for (my $n = 0; $n < 5; $n++) {
	return ($b->{punkteverteilung}[$n] // 0) <=> ($a->{punkteverteilung}[$n] // 0)
	    if ($a->{punkteverteilung}[$n] // 0) != ($b->{punkteverteilung}[$n] // 0);
    }

    # Aufsteigend nach der besten Runde?
    if ($cfg->{wertungsmodus} != 0) {
	my $ax = $a->{punkte_pro_runde} // [];
	my $bx = $b->{punkte_pro_runde} // [];
	if ($cfg->{wertungsmodus} == 1) {
	    for (my $n = 0; $n < @$ax; $n++) {
		last unless defined $ax->[$n];
		# Beide müssen definiert sein
		return $ax->[$n] <=> $bx->[$n]
		    if $ax->[$n] != $bx->[$n];
	    }
	} else {
	    for (my $n = @$ax - 1; $n >= 0; $n--){
		next unless defined $ax->[$n];
		# Beide müssen definiert sein
		return $ax->[$n] <=> $bx->[$n]
		    if $ax->[$n] != $bx->[$n];
	    }
	}
    }

    # Identische Wertung
    return 0;
}

sub hat_wertung($$) {
    my ($cfg, $wertung) = @_;

    grep(/^wertung$wertung$/, @{$cfg->{features}});
}

# Ermitteln, welche Klassen in welchen Sektionen und Runden überhaupt gefahren
# sind: wenn eine Klasse eine Sektion und Runde befahren hat, kann die Sektion
# und Runde nicht aus der Wertung sein, und alle Fahrer dieser Klasse müssen
# diese Sektion befahren.  Wenn eine Sektion nicht oder noch nicht befahren
# wurde, hat sie auch keinen Einfluss auf das Ergebnis.
sub befahrene_sektionen($) {
    my ($fahrer_nach_startnummer) = @_;
    my $befahren;

    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	my $klasse = $fahrer->{wertungsklasse};
	if (defined $klasse && $fahrer->{start}) {
	    my $punkte_pro_sektion = $fahrer->{punkte_pro_sektion} // [];
	    for (my $runde = 0; $runde < @$punkte_pro_sektion; $runde++) {
		my $punkte = $punkte_pro_sektion->[$runde] // [];
		for (my $sektion = 0; $sektion < @$punkte; $sektion++) {
		    $befahren->[$klasse - 1][$runde][$sektion]++
			if defined $punkte->[$sektion];
		}
	    }
	}
    }
    return $befahren;
}

sub fahrer_punkte_berechnen($$) {
    my ($fahrer_nach_startnummer, $cfg) = @_;
    my $befahren;

    # Das Trialtool erlaubt es, Sektionen in der Punkte-Eingabemaske
    # auszulassen.  Die ausgelassenen Sektionen sind danach "leer" (in den
    # Trialtool-Dateien wird der Wert 6 verwendet, in Perl übersetzen wir das
    # auf undef, und in der Datenbank verwenden wir NULL).  Für die
    # Punkteanzahl des Fahrers zählen diese Sektionen wie ein 0er, was zu einer
    # falschen Bewertung führt.  Für den Anwender ist es schwer, dieses Problem
    # zu erkennen und zu finden.
    #
    # Leider wird derselbe Wert auch für Sektionen verwendet, die (für eine
    # bestimmte Klasse und Runde) aus der Wertung genommen werden.  In diesem
    # Fall soll die Sektion ignoriert werden.
    #
    # Um diese Situation besser zu behandeln, überprüfen wir wenn wir eine
    # "leere" Sektion finden, ob die Sektion für alle anderen Fahrer auch
    # "leer" ist.  Das ist dann der Fall, wenn die Sektion noch nicht befahren
    # oder aus der Wertung genommen wurde; in beiden Fällen können wir die
    # Sektion ignorieren.  Wenn die Sektion für andere Fahrer nicht "leer" ist,
    # muss sie offensichtlich befahren werden, und wir dürfen sie nicht
    # ignorieren.
    #
    # Wenn die Daten nicht vom Trialtool stammen, merken wir uns explizit,
    # welche Sektionen aus der Wertung genommen wurden (sektionen_us_wertung).
    # Wir wissen dann genau, welche Sektionen ein Fahrer noch fahren muss.
    #
    # In jedem Fall werden die Fahrer zuerst nach der Anzahl der gefahrenen
    # Sektionen gereiht (bis zur ersten nicht erfassten Sektion, die befahren
    # werden muss), und erst danach nach den erzielten Punkten.  Das ergibt
    # auch eine brauchbare Zwischenwertung, wenn die Ergebnisse Sektion für
    # Sektion statt Runde für Runde eingegeben werden.
    #
    # Das Trialtool setzt $fahrer->{runden} auf die letzte begonnene Runde,
    # wodurch wir dann nicht erkennen können, welche Fahrer in der letzten
    # Runde und welche Fahrer schon "fertig" sind.  Wir verhalten uns nur
    # dann kompatibel, wenn die Daten vom Trialtool stammen, weil das
    # Auswertungen wie "Fahrer auf der Strecke" stört.

    my $sektionen_aus_wertung;
    if ($cfg->{sektionen_aus_wertung}) {
	$sektionen_aus_wertung = [];
	for (my $klasse_idx = 0; $klasse_idx < @{$cfg->{sektionen_aus_wertung}}; $klasse_idx++) {
	    my $runden = $cfg->{sektionen_aus_wertung}[$klasse_idx]
		or next;
	    for (my $runde_idx = 0; $runde_idx < @$runden; $runde_idx++) {
		my $sektionen = $runden->[$runde_idx];
		foreach my $sektion (@$sektionen) {
		    $sektionen_aus_wertung->[$klasse_idx][$runde_idx][$sektion - 1] = 1;
		}
	    }
	}
    }

    my $trialtool_kompatibel = !$sektionen_aus_wertung;

    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	next if $fahrer->{gruppe};

	my $punkte_pro_runde;
	my $gesamtpunkte;
	my $punkteverteilung;  # 0er, 1er, 2er, 3er, 4er, 5er
	my $offene_sektionen;
	my $sektion_ausgelassen;
	my $letzte_begonnene_runde;
	my $letzte_vollstaendige_runde;

	my $klasse = $fahrer->{wertungsklasse};
	if (defined $klasse && $fahrer->{start}) {
	    my $punkte_pro_sektion = $fahrer->{punkte_pro_sektion} // [];
	    $offene_sektionen = 0;

	    my $sektionen = $cfg->{sektionen}[$klasse - 1] // [];

	    my $auslassen = $cfg->{punkte_sektion_auslassen} // 0;
	    my $runden = $cfg->{klassen}[$klasse - 1]{runden};
	    for (my $runde = 1; $runde <= $runden; $runde++) {
		my $punkte_in_runde = $punkte_pro_sektion->[$runde - 1] // [];
		foreach my $sektion (@$sektionen) {
		    next if $sektionen_aus_wertung &&
			$sektionen_aus_wertung->[$klasse - 1][$runde - 1][$sektion - 1];
		    my $p = $punkte_in_runde->[$sektion - 1];
		    if (defined $p) {
			if ($sektion_ausgelassen) {
			    $offene_sektionen++;
			} else {
			    $punkte_pro_runde->[$runde - 1] += $p == -1 ? $auslassen : $p;
			    $punkteverteilung->[$p]++
				if $p >= 0 && $p <= 5;
			    $letzte_begonnene_runde = $runde;
			}
		    } elsif ($sektionen_aus_wertung) {
			$sektion_ausgelassen = 1;
			$offene_sektionen++;
			$letzte_vollstaendige_runde = $runde - 1
			    unless defined $letzte_vollstaendige_runde;
		    } else {
			$letzte_vollstaendige_runde = $runde - 1
			    unless defined $letzte_vollstaendige_runde;
			$befahren = befahrene_sektionen($fahrer_nach_startnummer)
			    unless defined $befahren;
			if (defined $befahren->[$klasse - 1][$runde - 1][$sektion - 1]) {
			    $sektion_ausgelassen = 1;
			    $offene_sektionen++;
			}
		    }
		}
	    }
	    $letzte_begonnene_runde //= 0;
	    $letzte_vollstaendige_runde = $runden
		unless defined $letzte_vollstaendige_runde;
	    if ($letzte_begonnene_runde != $letzte_vollstaendige_runde) {
		print STDERR "Warnung: Ergebnisse von Fahrer $fahrer->{startnummer} " .
			     "in Runde $letzte_begonnene_runde sind unvollständig!\n";
	    }

	    $gesamtpunkte = $fahrer->{zusatzpunkte};
	    foreach my $punkte (@$punkte_pro_runde) {
		$gesamtpunkte += $punkte;
	    }
	}

	if ($punkteverteilung) {
	    for (my $n = 0; $n <= 5; $n++) {
		$punkteverteilung->[$n] //= 0;
	    }
	}

	$fahrer->{runden} = $trialtool_kompatibel ?
	    $letzte_begonnene_runde : $letzte_vollstaendige_runde;
	$fahrer->{punkte} = $gesamtpunkte;
	$fahrer->{punkte_pro_runde} = $punkte_pro_runde;
	$fahrer->{punkteverteilung} = $punkteverteilung;
	$fahrer->{offene_sektionen} = $offene_sektionen;
    }
}

sub gruppen_punkte_berechnen($$) {
    my ($fahrer_nach_startnummer, $cfg) = @_;
    my $auslassen = $cfg->{punkte_sektion_auslassen} // 0;
    my $gruppen = {};

    foreach my $gruppe (values %$fahrer_nach_startnummer) {
	next unless $gruppe->{gruppe};

	my $gesamtpunkte;
	my $punkte_pro_sektion = [];
	my $punkte_pro_runde = [];
	my $punkteverteilung;
	my $runden;
	my $offene_sektionen;

	if ($gruppe->{start}) {
	    foreach my $startnummer (@{$gruppe->{fahrer}}) {
		my $fahrer = $fahrer_nach_startnummer->{$startnummer};
		if ($fahrer->{start}) {
		    my $fahrer_punkte_pro_sektion = $fahrer->{punkte_pro_sektion} // [];
		    for (my $runde = 0; $runde < @$fahrer_punkte_pro_sektion; $runde++) {
			my $punkte_in_runde = $fahrer_punkte_pro_sektion->[$runde] // [];
			for (my $sektion = 0; $sektion < @$punkte_in_runde; $sektion++) {
			    my $p = $punkte_in_runde->[$sektion];
			    $punkte_pro_sektion->[$runde][$sektion] +=
				$p == -1 ? $auslassen : $p
				if defined $p;
			}
		    }
		    my $fahrer_punkteverteilung = $fahrer->{punkteverteilung} // [];
		    for (my $idx = 0; $idx < @$fahrer_punkteverteilung; $idx++) {
			$punkteverteilung->[$idx] += $fahrer_punkteverteilung->[$idx]
			    if defined $fahrer_punkteverteilung->[$idx];
		    }
		}
		my $fahrer_punkte_pro_runde = $fahrer->{punkte_pro_runde} // [];
		for (my $runde = 0; $runde < @$fahrer_punkte_pro_runde; $runde++) {
		    $punkte_pro_runde->[$runde] += $fahrer_punkte_pro_runde->[$runde]
			if defined $fahrer_punkte_pro_runde->[$runde];
		}
		unless (defined $runden && $runden < $fahrer->{runden}) {
		    $runden = $fahrer->{runden};
		}
		$offene_sektionen += $fahrer->{offene_sektionen};
	    }

	    $gesamtpunkte = $gruppe->{zusatzpunkte};
	    foreach my $punkte (@$punkte_pro_runde) {
		$gesamtpunkte += $punkte;
	    }
	}

	if ($punkteverteilung) {
	    for (my $n = 0; $n <= 5; $n++) {
		$punkteverteilung->[$n] //= 0;
	    }
	}

	$gruppe->{runden} = $runden;
	$gruppe->{punkte} = $gesamtpunkte;
	$gruppe->{punkte_pro_sektion} = $punkte_pro_sektion;
	$gruppe->{punkte_pro_runde} = $punkte_pro_runde;
	$gruppe->{punkteverteilung} = $punkteverteilung;
	$gruppe->{offene_sektionen} = $offene_sektionen;

	my $startnummer = $gruppe->{startnummer};
	$gruppen->{$startnummer} = $gruppe;
    }
    return $gruppen;
}

sub raenge_berechnen($$) {
    my ($fahrer_in_klasse, $cfg) = @_;

    my $raenge = {};
    my $rang = 1;
    $$fahrer_in_klasse = [
	sort { rang_vergleich($a, $b, $cfg) }
	     grep { $_->{start} } @$$fahrer_in_klasse ];
    my $vorheriger_fahrer;
    foreach my $fahrer (@$$fahrer_in_klasse) {
	my $startnummer = $fahrer->{startnummer};
	if ($vorheriger_fahrer && rang_vergleich($vorheriger_fahrer, $fahrer, $cfg) == 0) {
	    my $n = $vorheriger_fahrer->{startnummer};
	    my $vorheriger_rang = $raenge->{$n};
	    $raenge->{$startnummer} = $vorheriger_rang;
	} else {
	    $raenge->{$startnummer} = $rang;
	}
	$vorheriger_fahrer = $fahrer;
	$rang++;
    }
    return $raenge;
}

sub rang_und_wertungspunkte_berechnen($$) {
    my ($fahrer_nach_startnummer, $cfg) = @_;
    my $wertungspunkte = $cfg->{wertungspunkte};
    unless (@$wertungspunkte) {
	$wertungspunkte = [0];
    }

    wertungsklassen_setzen $fahrer_nach_startnummer, $cfg;

    fahrer_punkte_berechnen $fahrer_nach_startnummer, $cfg;

    my $gruppen = gruppen_punkte_berechnen $fahrer_nach_startnummer, $cfg;

    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	$fahrer->{rang} = undef;
	foreach my $wertung (@{$fahrer->{wertungen}}) {
	    if (defined $wertung) {
		delete $wertung->{rang};
		delete $wertung->{punkte};
	    }
	}
    }

    my $fahrer_nach_klassen = fahrer_nach_klassen($fahrer_nach_startnummer);

    foreach my $klasse (keys %$fahrer_nach_klassen) {
	my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};

	# $fahrer->{rang} ist der Rang in der Tages-Gesamtwertung, in der alle
	# startenden Fahrer aufscheinen (aber nicht die Gruppen).

	my $raenge = raenge_berechnen(\$fahrer_in_klasse, $cfg);
	foreach my $startnummer (keys %$raenge) {
	    my $fahrer = $fahrer_nach_startnummer->{$startnummer};
	    $fahrer->{rang} = $raenge->{$startnummer};
	}
    }

    for (my $wertung = 1; $wertung <= 4; $wertung++) {
	next unless hat_wertung($cfg, $wertung);

	my $wertungspunkte_vergeben =
	    $wertung == 1 || $cfg->{wertungspunkte_234};

	foreach my $klasse (keys %$fahrer_nach_klassen) {
	    my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};

	    # $fahrer->{wertungen}[]{rang} ist der Rang in der jeweiligen
	    # Teilwertung.

	    $fahrer_in_klasse = [ grep {
		$_->{wertungen}[$wertung - 1]{aktiv} &&
		($wertung > 1 ||
		 !$cfg->{klassen}[$_->{klasse} - 1]{keine_wertung1})
	    } @$fahrer_in_klasse ];

	    my $raenge = raenge_berechnen(\$fahrer_in_klasse, $cfg);
	    foreach my $startnummer (keys %$raenge) {
		my $fahrer = $fahrer_nach_startnummer->{$startnummer};
		$fahrer->{wertungen}[$wertung - 1]{rang} =
		    $raenge->{$startnummer};
	    }

	    if ($wertungspunkte_vergeben) {
		my $runden = $cfg->{klassen}[$klasse - 1]{runden};

		if ($cfg->{punkteteilung}) {
		    my ($m, $n);
		    for ($m = 0; $m < @$fahrer_in_klasse; $m = $n) {
			my $fahrer_m = $fahrer_in_klasse->[$m];
			if (ausser_konkurrenz($fahrer_m, $cfg) ||
			    $fahrer_m->{ausfall} ||
			    ($fahrer_m->{runden} // 0) < $runden ||
			    !defined $fahrer_m->{wertungen}[$wertung - 1]{rang}) {
			    $n = $m + 1;
			    next;
			}

			my $anzahl_fahrer = 1;
			for ($n = $m + 1; $n < @$fahrer_in_klasse; $n++) {
			    my $fahrer_n = $fahrer_in_klasse->[$n];
			    next if ausser_konkurrenz($fahrer_n, $cfg) ||
				    $fahrer_n->{ausfall} ||
				    !defined $fahrer_n->{wertungen}[$wertung - 1]{rang};
			    last if $fahrer_m->{wertungen}[$wertung - 1]{rang} !=
				    $fahrer_n->{wertungen}[$wertung - 1]{rang};
			    $anzahl_fahrer++;
			}
			my $summe;
			my $wr = $fahrer_m->{wertungen}[$wertung - 1]{rang};
			for (my $i = 0; $i < $anzahl_fahrer; $i++) {
			    my $x = min($wr + $i, scalar @$wertungspunkte);
			    $summe += $wertungspunkte->[$x - 1];
			}
			for ($n = $m; $n < @$fahrer_in_klasse; $n++) {
			    my $fahrer_n = $fahrer_in_klasse->[$n];
			    next if ausser_konkurrenz($fahrer_n, $cfg) ||
				    $fahrer_n->{ausfall} ||
				    !defined $fahrer_n->{wertungen}[$wertung - 1]{rang};
			    last if $fahrer_m->{wertungen}[$wertung - 1]{rang} !=
				    $fahrer_n->{wertungen}[$wertung - 1]{rang};
			    $fahrer_n->{wertungen}[$wertung - 1]{punkte} =
				($summe / $anzahl_fahrer) || undef;
			}
		    }
		} else {
		    foreach my $fahrer (@$fahrer_in_klasse) {
			my $wr = $fahrer->{wertungen}[$wertung - 1]{rang};
			next if ausser_konkurrenz($fahrer, $cfg) ||
				$fahrer->{ausfall} ||
				$fahrer->{runden} < $runden ||
				!defined $wr;
			my $x = min($wr, scalar @$wertungspunkte);
			$fahrer->{wertungen}[$wertung - 1]{punkte} =
			    $wertungspunkte->[$x - 1] || undef;
		    }
		}
	    }
	}
    }
}

sub fahrer_nach_klassen($;$) {
    my ($fahrer_nach_startnummern, $klasse) = @_;
    my $fahrer_nach_klassen;

    $klasse //= 'wertungsklasse';

    foreach my $fahrer (values %$fahrer_nach_startnummern) {
	my $klasse = $fahrer->{gruppe} ? 0 : $fahrer->{$klasse};
	push @{$fahrer_nach_klassen->{$klasse}}, $fahrer
	    if defined $klasse;
    }
    return $fahrer_nach_klassen;
}

1;
