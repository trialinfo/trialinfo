# Wertungen

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

package Wertungen;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(rang_und_wertungspunkte_berechnen tageswertung jahreswertung max_time);

use utf8;
use List::Util qw(min max);
use POSIX qw(modf);
use RenderOutput;
use Time::Local;
use strict;

my $otsv_klassenfarben = {
     1 => "red",
     2 => "blue",
     3 => "yellow",
     4 => "green",
     5 => "white",
     6 => "yellow",
     7 => "green",
    11 => "red",
    12 => "blue",
    13 => "yellow",
};

sub rang_vergleich($$$) {
    my ($a, $b, $cfg) = @_;

    if ($a->{ausfall} != $b->{ausfall}) {
	# Fahrer ohne Ausfall zuerst
	return $a->{ausfall} <=> $b->{ausfall}
	    if !$a->{ausfall} != !$b->{ausfall};
	# Danach Fahrer, die nicht aus der Wertung sind
	return ($a->{ausfall} == 4) <=> ($b->{ausfall} == 4)
	    if ($a->{ausfall} == 4) != ($b->{ausfall} == 4);
    }

    # Abfallend nach gefahrenen Sektionen
    return $b->{gefahrene_sektionen} <=> $a->{gefahrene_sektionen}
	if $a->{gefahrene_sektionen} != $b->{gefahrene_sektionen};

    # Aufsteigend nach Punkten
    return $a->{punkte} <=> $b->{punkte}
	if $a->{punkte} != $b->{punkte};

    # Aufsteigend nach Ergebnis im Stechen
    return $a->{stechen} <=> $b->{stechen}
	if  $a->{stechen} != $b->{stechen};

    # Abfallend nach 0ern, 1ern, 2ern, 3ern
    for (my $n = 0; $n < 4; $n++) {
	return $b->{s}[$n] <=> $a->{s}[$n]
	    if $a->{s}[$n] != $b->{s}[$n];
    }

    # Aufsteigend nach der besten Runde?
    if ($cfg->{wertungsmodus} != 0) {
	my $ax = $a->{punkte_pro_runde};
	my $bx = $b->{punkte_pro_runde};
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

sub rang_und_wertungspunkte_berechnen($$) {
    my ($fahrer_nach_startnummer, $cfg) = @_;
    my $wertungspunkte = $cfg->{wertungspunkte};

    # Trialtool summiert die Punkte pro Runden auch dann auf, wenn eine Runde
    # nicht vollständig gefahren wurde, oder eine Sektion nicht eingegeben
    # wurde.  Wir setzen hier die Punkte pro Runde auf undef.

    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	my $klasse = $fahrer->{klasse};
	my $punkte_pro_sektion = $fahrer->{punkte_pro_sektion};
	my $gefahrene_sektionen = 0;
	if ($klasse >= 1 && $klasse <= 15) {
	    runde: for (my $runde = 0; $runde < @$punkte_pro_sektion; $runde++) {
		my $punkte_pro_runde = $fahrer->{punkte_pro_sektion}[$runde];
		for (my $sektion = 0; $sektion < @$punkte_pro_runde; $sektion++) {
		    next
			unless substr($cfg->{sektionen}[$klasse - 1], $sektion, 1) eq "J";
		    unless (defined $punkte_pro_runde->[$sektion]) {
			for (; $runde < @$punkte_pro_sektion; $runde++) {
			    $fahrer->{punkte_pro_runde}[$runde] = undef;
			}
			last runde;
		    }
		    $gefahrene_sektionen++;
		}
	    }
	}
	$fahrer->{gefahrene_sektionen} = $gefahrene_sektionen;
    }

    my $fahrer_nach_klassen = fahrer_nach_klassen($fahrer_nach_startnummer);

    foreach my $klasse (keys %$fahrer_nach_klassen) {
	my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};

	# $fahrer->{rang} ist der Rang in der Tages-Gesamtwertung, in der alle
	# Starter aufscheinen.

	my $rang = 1;
	$fahrer_in_klasse = [
	    sort { rang_vergleich($a, $b, $cfg) }
		 map { $_->{startnummer} < 1000 && $_->{papierabnahme} ? $_ : () }
		     @$fahrer_in_klasse ];
	my $vorheriger_fahrer;
	foreach my $fahrer (@$fahrer_in_klasse) {
	    $fahrer->{rang} =
		$vorheriger_fahrer &&
		rang_vergleich($vorheriger_fahrer, $fahrer, $cfg) == 0 ?
		    $vorheriger_fahrer->{rang} : $rang;
	    $rang++;
	    $vorheriger_fahrer = $fahrer;
	}
	$fahrer_nach_klassen->{$klasse} = $fahrer_in_klasse;
    }

    for (my $idx = 0; $idx < @{$cfg->{wertungen}}; $idx++) {
	my $wertungspunkte_vergeben =
	    $idx == 0 || $cfg->{wertungspunkte_234};

	foreach my $klasse (keys %$fahrer_nach_klassen) {
	    my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};

	    # $fahrer->{wertungsrang}[] ist der Rang in der jeweiligen
	    # Teilwertung.

	    my $wertungsrang = 1;
	    my $vorheriger_fahrer;
	    foreach my $fahrer (@$fahrer_in_klasse) {
		next unless defined $fahrer->{rang} &&
			    $fahrer->{wertungen}[$idx];
		if ($vorheriger_fahrer &&
		    $vorheriger_fahrer->{rang} == $fahrer->{rang}) {
		    $fahrer->{wertungsrang}[$idx] =
			$vorheriger_fahrer->{wertungsrang}[$idx];
		} else {
		    $fahrer->{wertungsrang}[$idx] = $wertungsrang;
		}
		$wertungsrang++;

		$vorheriger_fahrer = $fahrer;
	    }
	    if ($wertungspunkte_vergeben) {
		if ($cfg->{punkteteilung}) {
		    my ($m, $n);
		    for ($m = 0; $m < @$fahrer_in_klasse; $m = $n) {
			my $fahrer_m = $fahrer_in_klasse->[$m];
			if ($fahrer_m->{ausfall} ||
			    !defined $fahrer_m->{wertungsrang}[$idx]) {
			    $n = $m + 1;
			    next;
			}

			my $anzahl_fahrer = 1;
			for ($n = $m + 1; $n < @$fahrer_in_klasse; $n++) {
			    my $fahrer_n = $fahrer_in_klasse->[$n];
			    next if $fahrer_n->{ausfall} ||
				    !defined $fahrer_m->{wertungsrang}[$idx];
			    last if $fahrer_m->{wertungsrang}[$idx] !=
				    $fahrer_n->{wertungsrang}[$idx];
			    $anzahl_fahrer++;
			}
			my $summe;
			my $wr = $fahrer_m->{wertungsrang}[$idx];
			for (my $i = 0; $i < $anzahl_fahrer; $i++) {
			    my $x = min($wr + $i, scalar @$wertungspunkte);
			    $summe += $wertungspunkte->[$x - 1];
			}
			for ($n = $m; $n < @$fahrer_in_klasse; $n++) {
			    my $fahrer_n = $fahrer_in_klasse->[$n];
			    next if $fahrer_n->{ausfall} ||
				    !defined $fahrer_m->{wertungsrang}[$idx];
			    last if $fahrer_m->{wertungsrang}[$idx] !=
				    $fahrer_n->{wertungsrang}[$idx];
			    $fahrer_n->{wertungspunkte}[$idx] = ($summe / $anzahl_fahrer) || undef;
			}
		    }
		} else {
		    foreach my $fahrer (@$fahrer_in_klasse) {
			my $wr = $fahrer->{wertungsrang}[$idx];
			next if $fahrer->{ausfall} || !defined $wr;
			my $x = min($wr, scalar @$wertungspunkte);
			$fahrer->{wertungspunkte}[$idx] = $wertungspunkte->[$x - 1] || undef;
		    }
		}
		foreach my $fahrer (@$fahrer_in_klasse) {
		    $fahrer->{wertungspunkte}[$idx] = undef
			if $fahrer->{keine_wertungspunkte};
		}
	    }
	}
    }
}

sub fahrer_nach_klassen($) {
    my ($fahrer_nach_startnummern) = @_;
    my $fahrer_nach_klassen;

    foreach my $fahrer (values %$fahrer_nach_startnummern) {
	my $klasse = $fahrer->{klasse};
	push @{$fahrer_nach_klassen->{$klasse}}, $fahrer;
    }
    return $fahrer_nach_klassen;
}

sub rang_wenn_definiert($$) {
    my ($a, $b) = @_;

    return exists($b->{rang}) - exists($a->{rang})
	if !exists($a->{rang}) || !exists($b->{rang});
    return $a->{rang} <=> $b->{rang}
	if $a->{rang} != $b->{rang};
    return $a->{startnummer} <=> $b->{startnummer};
}

sub spaltentitel($) {
    my ($feld) = @_;

    my $titel = {
	"geburtsdatum" => "Geb.datum",
	"lizenznummer" => "Lizenz",
    };
    if (exists $titel->{$feld}) {
	return $titel->{$feld};
    } else {
	return ucfirst $feld;
    }
}

sub punkte_pro_sektion($$$) {
    my ($fahrer, $runde, $cfg) = @_;
    my $punkte_pro_sektion;

    my $klasse = $fahrer->{klasse};
    my $punkte_pro_runde = $fahrer->{punkte_pro_sektion}[$runde];
    for (my $s = 0; $s < 15; $s++) {
	if (substr($cfg->{sektionen}[$klasse - 1], $s, 1) eq "J") {
	    my $p = $punkte_pro_runde->[$s];
	    push @$punkte_pro_sektion, defined $p ? $p : '-';
	}
    }
    return join(" ", @$punkte_pro_sektion);
}

sub log10($) {
    my ($x) = @_;
    return log($x) / log(10)
}

sub wp($) {
    my ($wp) = @_;
    return undef unless defined $wp;
    my ($komma, $ganzzahl) = modf($wp);
    if ($komma) {
	my $bruch_zeichen = {
	    # Unicode kennt folgende Zeichen für Brüche:
	    #   ⅛ ⅙ ⅕ ¼ ⅓ ⅜ ⅖ ½ ⅗ ⅝ ⅔ ¾ ⅘ ⅚ ⅞
	    #   ⁰¹²³⁴⁵⁶⁷⁸⁹ ⁄ ₀₁₂₃₄₅₆₇₈₉
	    # Z.B. Windows Vista unterstützt aber nur die Halben, Drittel, und
	    # Viertel, und auch die zusammengesetzten Brücke werden nicht
	    # sauber gerendert.
	    1/4 => '¼', 1/3 => '⅓', 1/2 => '½', 2/3 => '⅔', 3/4 => '¾',
	};
	my $eps = 1 / (1 << 13);

	foreach my $wert (keys %$bruch_zeichen) {
	    return "$ganzzahl$bruch_zeichen->{$wert}"
		if $komma >= $wert - $eps &&
		   $komma <= $wert + $eps;
	}
    }
    my $prec = 3; # Maximale Nachkommastellen
    return sprintf("%.*g", log10($wp) + 1 + $prec, $wp);
}

sub tageswertung($$$$$$$) {
    my ($cfg, $fahrer_nach_startnummer, $wertung, $spalten, $klassenfarben, $alle_punkte, $nach_relevanz) = @_;

    $klassenfarben = $otsv_klassenfarben
	unless defined $klassenfarben;

    my $ausfall = {
	3 => "ausgefallen",
	4 => "aus der wertung",
	5 => "nicht gestartet",
	6 => "nicht gestartet, entschuldigt"
    };

    # Wir wollen, dass alle Tabellen gleich breit sind.
    my $namenlaenge = 0;
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	next
	    unless $fahrer->{startnummer} < 1000 && $fahrer->{papierabnahme};
	my $n = length "$fahrer->{nachname}, $fahrer->{vorname}";
	$namenlaenge = max($n, $namenlaenge);
    }

    my $zusatzpunkte;
    my $vierpunktewertung = $cfg->{vierpunktewertung} ? 1 : 0;
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	$zusatzpunkte = 1
	    if $fahrer->{zusatzpunkte};
    }

    my $fahrer_nach_klassen = fahrer_nach_klassen($fahrer_nach_startnummer);
    foreach my $klasse (sort {$a <=> $b} keys %$fahrer_nach_klassen) {
	my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};
	my $idx = $klasse - 1;
	my $runden = $cfg->{runden}[$idx];
	my ($header, $body, $format);
	my $farbe = "";

	$fahrer_in_klasse = [
	    map { $_->{startnummer} < 1000 && $_->{papierabnahme} ? $_ : () }
		  @$fahrer_in_klasse ];
	next unless @$fahrer_in_klasse > 0;

	my $wertungspunkte;
	foreach my $fahrer (@$fahrer_in_klasse) {
	    $wertungspunkte = 1
		if defined $fahrer->{wertungspunkte}[$wertung - 1];
	}

	my $ausfall_fmt = "c" . (5 + $vierpunktewertung);

	if ($RenderOutput::html && exists $klassenfarben->{$klasse}) {
	    $farbe = "<font color=\"$klassenfarben->{$klasse}\">◼</font>";
	}

	print "\n<div class=\"klasse\" id=\"klasse$klasse\">\n"
	    if $RenderOutput::html;
	doc_h3 "$cfg->{klassen}[$idx]";
	push @$format, "r3", "r3", "l$namenlaenge";
	push @$header, [ "$farbe", "c" ], [ "Nr.", "r1", "title=\"Startnummer\"" ], "Name";
	foreach my $spalte (@$spalten) {
	    push @$format, "l";
	    push @$header, spaltentitel($spalte);
	}
	for (my $n = 0; $n < $runden; $n++) {
	    push @$format, "r2";
	    push @$header, [ "R" . ($n + 1), "r1", "title=\"Runde " . ($n + 1) . "\"" ];
	}
	if ($zusatzpunkte) {
	    push @$format, "r2";
	    push @$header, [ "ZP", "r1", "title=\"Zeit- und Zusatzpunkte\"" ];
	}
	push @$format, "r3";
	push @$header, [ "Ges", "r1", "title=\"Gesamtpunkte\"" ];
	push @$format, "r2", "r2", "r2", "r2";
	push @$header, [ "0S", "r1", "title=\"Nuller\"" ];
	push @$header, [ "1S", "r1", "title=\"Einser\"" ];
	push @$header, [ "2S", "r1", "title=\"Zweier\"" ];
	push @$header, [ "3S", "r1", "title=\"Dreier\"" ];
	if ($vierpunktewertung) {
	    push @$format, "r2";
	    push @$header, [ "4S", "r1", "title=\"Vierer\"" ];
	}
	push @$format, "r2";
	push @$header, [ "WP", "r1", "title=\"Wertungspunkte\"" ]
	    if $wertungspunkte;

	$fahrer_in_klasse = [ sort rang_wenn_definiert @$fahrer_in_klasse ];

	if ($nach_relevanz && $RenderOutput::html) {
	    # Welche 0er, 1er, ... sind für den Rang relevant?
	    my $sn_alt = 0;
	    my $rn_alt = 0;
	    for (my $n = 0; $n < @$fahrer_in_klasse - 1; $n++) {
		my $a = $fahrer_in_klasse->[$n];
		my $b = $fahrer_in_klasse->[$n + 1];

		my $sn = 0;
		if ($a->{punkte} == $b->{punkte}) {
		    for (my $m = 0; $m < 5; $m++) {
			$sn++;
			last unless $a->{s}[$m] == $b->{s}[$m];
		    }
		}

		my $rn = 0;
		if ($sn == 5) {
		    my $ra = $a->{punkte_pro_runde};
		    my $rb = $b->{punkte_pro_runde};

		    if ($cfg->{wertungsmodus} == 1) {
			for (my $m = 0; $m < 5; $m++) {
			    $rn++;
			    last unless $ra->[$m] == $rb->[$m];
			}
		    } elsif ($cfg->{wertungsmodus} == 2) {
			for (my $m = $runden - 1; $m >= 0; $m--) {
			    $rn++;
			    last unless $ra->[$m] == $rb->[$m];
			}
		    }
		}

		$a->{sn} = max($sn_alt, $sn);
		$a->{rn} = max($rn_alt, $rn);
		$sn_alt = $sn;
		$rn_alt = $rn;
	    }
	    $fahrer_in_klasse->[@$fahrer_in_klasse - 1]{sn} = $sn_alt;
	    $fahrer_in_klasse->[@$fahrer_in_klasse - 1]{rn} = $rn_alt;
	}

	foreach my $fahrer (@$fahrer_in_klasse) {
	    my $row;
	    if (!$fahrer->{ausfall}) {
		push @$row, "$fahrer->{rang}.";
	    } else {
		push @$row, "";
	    }
	    push @$row, $fahrer->{startnummer};
	    push @$row, $fahrer->{nachname} . ", " . $fahrer->{vorname};
	    foreach my $spalte (@$spalten) {
		push @$row, defined $fahrer->{$spalte} ?
			    $fahrer->{$spalte} : "";
	    }
	    for (my $n = 0; $n < $runden; $n++) {
		my $punkte;
		my $fmt;

		if ($fahrer->{runden} > $n) {
		    $punkte = $fahrer->{punkte_pro_runde}[$n] // "-";
		    if ($alle_punkte) {
			my $punkte_pro_sektion = punkte_pro_sektion($fahrer, $n, $cfg);
			push @$fmt, "title=\"$punkte_pro_sektion\"";
		    }
		} elsif ($fahrer->{ausfall} != 0 && $fahrer->{ausfall} != 4) {
		    $punkte = "-";
		}

		if (!defined $fahrer->{rn} ||
		    ($cfg->{wertungsmodus} == 0 ||
		     ($cfg->{wertungsmodus} == 1 && $n >= $fahrer->{rn}) ||
		     ($cfg->{wertungsmodus} == 2 && $n < $runden - $fahrer->{rn}) ||
		     $fahrer->{ausfall} != 0)) {
		    push @$fmt, "class=\"info\"";
		} else {
		    push @$fmt, "class=\"info2\"";
		}

		if ($fmt) {
		    push @$row, [ $punkte, "r1", join(" ", @$fmt) ];
		} else {
		    push @$row, $punkte;
		}
	    }
	    push @$row, $fahrer->{zusatzpunkte} || ""
		if $zusatzpunkte;

	    if ($fahrer->{ausfall} != 0) {
		push @$row, [ $ausfall->{$fahrer->{ausfall}}, $ausfall_fmt ];
	    } elsif ($fahrer->{runden} == 0) {
		push @$row, [ "", $ausfall_fmt ];
	    } else {
		push @$row, $fahrer->{punkte} // "";
		for (my $n = 0; $n < 4 + $vierpunktewertung; $n++) {
		    if ($n < ($fahrer->{sn} // -1)) {
			push @$row, [ $fahrer->{s}[$n], "r", "class=\"info2\"" ];
		    } else {
			push @$row, [ $fahrer->{s}[$n], "r", "class=\"info\"" ];
		    }
		}
	    }

	    push @$row, wp($fahrer->{wertungspunkte}[$wertung - 1])
		if $wertungspunkte;
	    push @$body, $row;
	}
	doc_table $header, $body, undef, $format;
	print "</div>\n"
	    if $RenderOutput::html;
    }
}

sub streichen($$$) {
    my ($laeufe_bisher, $laeufe_gesamt, $streichresultate) = @_;

    $laeufe_gesamt = max($laeufe_bisher, $laeufe_gesamt);
    return $laeufe_bisher - max(0, $laeufe_gesamt - $streichresultate);
}

sub wertungsrang_cmp($$) {
    my ($a, $b) = @_;

    return defined $b <=> defined $a
	unless defined $a && defined $b;
    return $a <=> $b;
}

sub jahreswertung_cmp($$) {
    my ($aa, $bb) = @_;

    # Höhere Gesamtpunkte (nach Abzug der Streichpunkte) gewinnen
    return $bb->{gesamtpunkte} <=> $aa->{gesamtpunkte}
	if $aa->{gesamtpunkte} != $bb->{gesamtpunkte};

    # Fahrer mit mehr guten Platzierungen (ohne Beachtung von Streichresultaten) gewinnt
    my $ra = [ sort wertungsrang_cmp @{$aa->{wertungsrang}} ];
    my $rb = [ sort wertungsrang_cmp @{$bb->{wertungsrang}} ];

    for (my $n = 0; $n < @$ra && $n < @$rb; $n++) {
	my $cmp = wertungsrang_cmp($ra->[$n], $rb->[$n]);
	if ($cmp) {
	    my $rang = ($cmp < 0) ? $ra->[$n] : $rb->[$n];
	    $aa->{rang_wichtig}{$rang}++;
	    $bb->{rang_wichtig}{$rang}++;
	    return $cmp;
	}
    }

    foreach my $rang (keys %{$aa->{rang_wichtig}}) {
	$bb->{rang_wichtig}{$rang}++
	   unless $bb->{rang_wichtig}{$rang};
    }
    foreach my $rang (keys %{$bb->{rang_wichtig}}) {
	$aa->{rang_wichtig}{$rang}++
	   unless $aa->{rang_wichtig}{$rang};
    }

    # Fahrer mit höheren Streichpunkten gewinnt
    my $cmp = ($bb->{streichpunkte} // 0) <=> ($aa->{streichpunkte} // 0);
    if ($cmp) {
	$aa->{streichpunkte_wichtig}++;
	$bb->{streichpunkte_wichtig}++;
	return $cmp;
    }

    $bb->{streichpunkte_wichtig}++
	if $aa->{streichpunkte_wichtig};
    $aa->{streichpunkte_wichtig}++
	if $bb->{streichpunkte_wichtig};

    # TODO: Ist auch dann noch keine Differenzierung möglich, wird der
    # OSK-Prädikatstitel dem Fahrer zuerkannt, der den letzten wertbaren Lauf
    # zu dem entsprechenden Bewerb gewonnen hat.

    return $cmp;
}

sub jahreswertung_berechnen($$$) {
    my ($jahreswertung, $laeufe_gesamt, $streichresultate) = @_;

    foreach my $klasse (keys %$jahreswertung) {
	foreach my $startnummer (keys %{$jahreswertung->{$klasse}}) {
	    my $fahrer = $jahreswertung->{$klasse}{$startnummer};
	    $jahreswertung->{$klasse}{$startnummer}{startnummer} = $startnummer;
	}

	my $fahrer_in_klasse = [ map { $jahreswertung->{$klasse}{$_} }
				     keys %{$jahreswertung->{$klasse}} ];

	# Gesamtpunkte und Streichpunkte berechnen
	foreach my $fahrer (@$fahrer_in_klasse) {
	    my $wertungspunkte = $fahrer->{wertungspunkte};
	    my $n = 0;
	    if (defined $streichresultate) {
		my $laeufe_bisher = @$wertungspunkte;
		my $streichen = streichen($laeufe_bisher, $laeufe_gesamt, $streichresultate);
		if ($streichen > 0) {
		    $fahrer->{streichpunkte} = 0;
		    $wertungspunkte = [ sort { $a <=> $b }
					     @$wertungspunkte ];
		    for (; $n < $streichen; $n++) {
			$fahrer->{streichpunkte} += $wertungspunkte->[$n];
		    }
		}
	    }
	    $fahrer->{gesamtpunkte} = 0;
	    for (; $n < @$wertungspunkte; $n++) {
		$fahrer->{gesamtpunkte} += $wertungspunkte->[$n];
	    }
	}

	# Gesamtrang berechnen
	my $gesamtrang = 1;
	my $vorheriger_fahrer;
	foreach my $fahrer (sort jahreswertung_cmp @$fahrer_in_klasse) {
	    $fahrer->{gesamtrang} =
		$vorheriger_fahrer &&
		jahreswertung_cmp($vorheriger_fahrer, $fahrer) == 0 ?
		    $vorheriger_fahrer->{gesamtrang} : $gesamtrang;
	    $gesamtrang++;
	    $vorheriger_fahrer = $fahrer;
	}
    }
}

sub jahreswertung_anzeige_cmp($$) {
    my ($aa, $bb) = @_;

    return $aa->{gesamtrang} <=> $bb->{gesamtrang}
	if $aa->{gesamtrang} != $bb->{gesamtrang};
    return $aa->{startnummer} <=> $bb->{startnummer};
}

sub jahreswertung_zusammenfassung($$$$) {
    my ($klasse, $laeufe_bisher, $laeufe_gesamt, $streichresultate) = @_;

    my @l;
    if (defined $laeufe_bisher && defined $laeufe_gesamt) {
	push @l, "Stand nach $laeufe_bisher von $laeufe_gesamt " .
		 ($laeufe_gesamt == 1 ? "Lauf" : "Läufen");
    }
    if (defined $streichresultate) {
	my $streichen = streichen($laeufe_bisher, $laeufe_gesamt, $streichresultate);
	if ($streichen > 0) {
	    push @l, "$streichen von $streichresultate " .
		     ($streichresultate == 1 ? "Streichresultat" : "Streichresultaten") .
		     " berücksichtigt";
	}
    }
    return @l ? (join(", ", @l) . ".") : "";
}

sub jahreswertung($$$$$$) {
    my ($veranstaltungen, $wertung, $laeufe_gesamt, $streichresultate,
	$klassenfarben, $spalten) = @_;

    my $idx = $wertung - 1;
    undef $streichresultate
	unless defined $laeufe_gesamt;

    $klassenfarben = $otsv_klassenfarben
	unless defined $klassenfarben;

    my $laeufe_pro_klasse;
    foreach my $veranstaltung (@$veranstaltungen) {
	my $cfg = $veranstaltung->[0];
	foreach my $fahrer (values %{$veranstaltung->[1]}) {
	    $cfg->{gewertet}[$fahrer->{klasse} - 1] = 1
		if defined $fahrer->{wertungspunkte}[$idx];
	}
	if (exists $cfg->{gewertet}) {
	    for (my $n = 0; $n < @{$cfg->{gewertet}}; $n++) {
		$laeufe_pro_klasse->{$n + 1}++
		    if defined $cfg->{gewertet}[$n];
	    }
	}
    }

    my $gemeinsame_zusammenfassung;
    my $laeufe_bisher;
    foreach my $klasse (keys %$laeufe_pro_klasse) {
	if (defined $laeufe_bisher) {
	    if ($laeufe_bisher != $laeufe_pro_klasse->{$klasse}) {
		$gemeinsame_zusammenfassung = undef;
		last;
	    }
	} else {
	    $laeufe_bisher = $laeufe_pro_klasse->{$klasse};
	    $gemeinsame_zusammenfassung = 1;
	}
    }

    my $spaltenbreite = 2;
    #foreach my $veranstaltung (@$veranstaltungen) {
    #	my $cfg = $veranstaltung->[0];
    #	my $l = length $cfg->{label};
    #	$spaltenbreite = $l
    #	    if $l > $spaltenbreite;
    #}

    my $alle_fahrer;

    my $jahreswertung;
    foreach my $veranstaltung (@$veranstaltungen) {
	my $fahrer_nach_startnummer = $veranstaltung->[1];

	foreach my $fahrer (values %$fahrer_nach_startnummer) {
	    my $startnummer = $fahrer->{startnummer};
	    if ($startnummer < 1000 &&
		defined $fahrer->{wertungspunkte}[$idx]) {
		my $klasse = $fahrer->{klasse};
		push @{$jahreswertung->{$klasse}{$startnummer}{wertungspunkte}},
		    $fahrer->{wertungspunkte}[$idx];
		push @{$jahreswertung->{$klasse}{$startnummer}{wertungsrang}},
		    $fahrer->{wertungsrang}[$idx];
	    }
	    $alle_fahrer->{$startnummer} = $fahrer;
	}
    }

    my $letzte_cfg = $veranstaltungen->[@$veranstaltungen - 1][0];

    jahreswertung_berechnen $jahreswertung, $laeufe_gesamt, $streichresultate;

    # Wir wollen, dass alle Tabellen gleich breit sind.
    my $namenlaenge = 0;
    foreach my $fahrer (map { $alle_fahrer->{$_} }
			    map { keys %$_ } values %$jahreswertung) {
	my $n = length "$fahrer->{nachname}, $fahrer->{vorname}";
	$namenlaenge = max($n, $namenlaenge);
    }

    doc_p jahreswertung_zusammenfassung(undef, $laeufe_bisher,
					$laeufe_gesamt, $streichresultate)
	if $gemeinsame_zusammenfassung;

    foreach my $klasse (sort {$a <=> $b} keys %$jahreswertung) {
	my $klassenwertung = $jahreswertung->{$klasse};
	my $fahrer_in_klasse = [
	    map { $alle_fahrer->{$_->{startnummer}} }
		(sort jahreswertung_anzeige_cmp values %$klassenwertung) ];

	my $hat_streichpunkte;
	if (defined $streichresultate) {
	    my $laeufe_bisher = $laeufe_pro_klasse->{$klasse};
	    my $streichen = streichen($laeufe_bisher, $laeufe_gesamt, $streichresultate);
	    $hat_streichpunkte = $streichen > 0;
	    #foreach my $fahrer (@$fahrer_in_klasse) {
	    #	my $startnummer = $fahrer->{startnummer};
	    #	my $fahrerwertung = $klassenwertung->{$startnummer};
	    #	if (defined $fahrerwertung->{streichpunkte}) {
	    #	    $hat_streichpunkte = 1;
	    #	    last;
	    #	}
	    #}
	}

	doc_h3 "$letzte_cfg->{klassen}[$klasse - 1]";

	doc_p jahreswertung_zusammenfassung($klasse, $laeufe_pro_klasse->{$klasse},
					    $laeufe_gesamt, $streichresultate)
	    unless $gemeinsame_zusammenfassung;

	my ($header, $body, $format);
	my $farbe = "";
	if ($RenderOutput::html && exists $klassenfarben->{$klasse}) {
	    $farbe = "<font color=\"$klassenfarben->{$klasse}\">◼</font>";
	}
	push @$format, "r3", "r3", "l$namenlaenge";
	push @$header, [ $farbe, "c" ], [ "Nr.", "r1", "title=\"Startnummer\"" ], "Name";
	foreach my $spalte (@$spalten) {
	    push @$format, "l";
	    push @$header, spaltentitel($spalte);
	}
	for (my $n = 0; $n < @$veranstaltungen; $n++) {
	    my $cfg = $veranstaltungen->[$n][0];
	    my $gewertet = $cfg->{gewertet}[$klasse - 1];
	    if ($gewertet) {
		push @$format, "r$spaltenbreite";
		push @$header,  $gewertet ? [ $cfg->{label}, "r1", "title=\"$cfg->{titel}[$idx]\"" ] : "";
	    }
	}
	if ($hat_streichpunkte) {
	    push @$format, "r3";
	    push @$header, [ "Str", "r1", "title=\"Streichpunkte\"" ];
	}
	push @$format, "r3";
	push @$header, [ "Ges", "r1", "title=\"Gesamtpunkte\"" ];

	foreach my $fahrer (@$fahrer_in_klasse) {
	    my $startnummer = $fahrer->{startnummer};
	    my $fahrerwertung = $klassenwertung->{$startnummer};
	    my $row;
	    push @$row, $fahrerwertung->{gesamtpunkte} ? "$fahrerwertung->{gesamtrang}." : "";
	    push @$row, $startnummer,
			$alle_fahrer->{$startnummer}{nachname} . ", " .
			$alle_fahrer->{$startnummer}{vorname};
	    foreach my $spalte (@$spalten) {
		push @$row, defined $fahrer->{$spalte} ?
			    $fahrer->{$spalte} : "";
	    }
	    for (my $n = 0; $n < @$veranstaltungen; $n++) {
		my $veranstaltung = $veranstaltungen->[$n];
		my $gewertet = $veranstaltung->[0]{gewertet}[$klasse - 1];
		my $fahrer = $veranstaltung->[1]{$startnummer};
		if ($gewertet) {
		    my $feld = (defined $fahrer->{wertungspunkte}[$idx] &&
				 $fahrer->{klasse} == $klasse) ?
				wp($fahrer->{wertungspunkte}[$idx]) :
				$RenderOutput::html ? "" : "-";
		    my $rang = $fahrer->{wertungsrang}[$idx];
		    $feld = [ $feld, "r", "class=\"text2\"" ]
			if $fahrerwertung->{rang_wichtig}{$rang};
		    push @$row, $feld;
		}
	    }
	    if ($hat_streichpunkte) {
		my $feld = wp($fahrerwertung->{streichpunkte});
		$feld = [ $feld, "r", "class=\"text2\"" ]
		    if $fahrerwertung->{streichpunkte_wichtig};
		push @$row, $feld;
	    }
	    push @$row, wp($fahrerwertung->{gesamtpunkte});
	    push @$body, $row;
	}
	doc_table $header, $body, undef, $format;
    }

    doc_h3 "Veranstaltungen:";
    my $body;
    for (my $n = 0; $n < @$veranstaltungen; $n++) {
	my $cfg = $veranstaltungen->[$n][0];
	my $label = defined $cfg->{label2} ? $cfg->{label2} : $cfg->{label};

	#push @$body, [ $label, "$cfg->{titel}[$idx]: $cfg->{subtitel}[$idx]" ];
	push @$body, [ $label, $cfg->{titel}[$idx] ];
    }
    doc_table ["", "Name"], $body, undef, ["r", "l"];
}

sub max_time($$) {
    my ($a, $b) = @_;
    my ($ta, $tb);

    return $b unless defined $a;
    return $a unless defined $b;

    $ta = timelocal($6, $5, $4, $3, $2 - 1, $1 - 1900)
	if $a =~ /^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)$/;
    $tb = timelocal($6, $5, $4, $3, $2 - 1, $1 - 1900)
	if $b =~ /^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)$/;
    return $ta < $tb ? $b : $a;
}

1;
