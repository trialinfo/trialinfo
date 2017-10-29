# Jahreswertung

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

package Jahreswertung;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(jahreswertung);

use utf8;
use List::Util qw(max);
use POSIX qw(modf);
use RenderOutput;
use Auswertung;
use Berechnung;
use Wertungen;
use strict;

sub streichen($$$$) {
    my ($klasse, $laeufe_bisher, $laeufe_gesamt, $streichresultate) = @_;

    $laeufe_gesamt = $laeufe_gesamt->{$klasse}
	if ref($laeufe_gesamt) eq 'HASH';
    $streichresultate = $streichresultate->{$klasse}
	if ref($streichresultate) eq 'HASH';

    $laeufe_gesamt = max($laeufe_bisher, $laeufe_gesamt // 0);
    return $laeufe_bisher - max(0, $laeufe_gesamt - ($streichresultate // 0));
}

sub wertungsrang_cmp($$) {
    my ($a, $b) = @_;

    return defined $b <=> defined $a
	unless defined $a && defined $b;
    return $a <=> $b;
}

sub jahreswertung_cmp($$$;$) {
    my ($aa, $bb, $tie_break, $rang_zuweisen) = @_;

    # Höhere Gesamtpunkte (nach Abzug der Streichpunkte) gewinnen
    return $bb->{gesamtpunkte} <=> $aa->{gesamtpunkte}
	if $aa->{gesamtpunkte} != $bb->{gesamtpunkte};

    # Eine explizite Reihung von Fahrern bei Punktegleichstand überschreibt
    # den Vergleich der Platzierungen, usw.:
    if (%$tie_break) {
	my $tie_aa = $tie_break->{$aa->{startnummer}};
	my $tie_bb = $tie_break->{$bb->{startnummer}};

	return $tie_aa <=> $tie_bb
	    if $tie_aa && $tie_bb;
    }

    # Laut Telefonat am 22.10.2014 mit Martin Suchy (OSK): Wenn Fahrer
    # punktegleich sind, werden sie in der Ergebnisliste anhand der besseren
    # Platzierungen gereiht.  Der Rang wird allerdings nur dann "aufgelöst",
    # wenn es den ersten Platz betrifft; sonst gibt es Ex Aequo-Platzierungen.
    #
    # (Diese Funktion wird für die Reihung in der Reihung in der Ergebnisliste
    # ohne dem Parameter $rang_zuweisen aufgerufen, und zur Bestimmung der
    # Ränge mit diesem Parameter.)
    return 0
	if $rang_zuweisen && $aa->{gesamtrang} > 1;

    # Fahrer mit mehr guten Platzierungen (ohne Beachtung von Streichresultaten) gewinnt
    my $ra = [ sort wertungsrang_cmp @{$aa->{wertungsrang}} ];
    my $rb = [ sort wertungsrang_cmp @{$bb->{wertungsrang}} ];

    for (my $n = 0; $n < @$ra && $n < @$rb; $n++) {
	my $cmp = wertungsrang_cmp($ra->[$n], $rb->[$n]);
	if ($cmp) {
	    my $rang = ($cmp < 0) ? $ra->[$n] : $rb->[$n];
	    if ($rang_zuweisen) {
		$aa->{rang_wichtig}{$rang}++;
		$bb->{rang_wichtig}{$rang}++;
	    }
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
	if ($rang_zuweisen) {
	    $aa->{streichpunkte_wichtig}++;
	    $bb->{streichpunkte_wichtig}++;
	}
	return $cmp;
    }

    $bb->{streichpunkte_wichtig}++
	if $aa->{streichpunkte_wichtig};
    $aa->{streichpunkte_wichtig}++
	if $bb->{streichpunkte_wichtig};

    # Folgende Regel ist nicht implementiert, und muss als explizite Reihung
    # definiert werden (Tabelle series_tie_break):
    #
    # Ist auch dann noch keine Differenzierung möglich, wird der
    # OSK-Prädikatstitel dem Fahrer zuerkannt, der den letzten wertbaren Lauf
    # zu dem entsprechenden Bewerb gewonnen hat.

    return $cmp;
}

sub jahreswertung_berechnen($$$$) {
    my ($jahreswertung, $laeufe_gesamt, $streichresultate, $tie_break) = @_;

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
		my $streichen = streichen($klasse, $laeufe_bisher, $laeufe_gesamt,
					  $streichresultate);
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
	foreach my $fahrer (sort { jahreswertung_cmp($a, $b, $tie_break) } @$fahrer_in_klasse) {
	    $fahrer->{gesamtrang} =
		$vorheriger_fahrer &&
		jahreswertung_cmp($vorheriger_fahrer, $fahrer, $tie_break, 1) == 0 ?
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

    my $klasse_laeufe_gesamt = ref($laeufe_gesamt) eq 'HASH' ?
	$laeufe_gesamt->{$klasse} : $laeufe_gesamt;
    my $klasse_streichresultate = ref($streichresultate) eq 'HASH' ?
	$streichresultate->{$klasse} : $streichresultate;

    my @l;
    if (defined $laeufe_bisher && defined $klasse_laeufe_gesamt) {
	push @l, "Stand nach $laeufe_bisher von $klasse_laeufe_gesamt " .
		 ($klasse_laeufe_gesamt == 1 ? "Lauf" : "Läufen");
    }
    if (defined $klasse_streichresultate) {
	my $streichen = streichen($klasse, $laeufe_bisher, $laeufe_gesamt,
				  $streichresultate);
	if ($streichen > 0) {
	    push @l, "$streichen von $klasse_streichresultate " .
		     ($klasse_streichresultate == 1 ?
		      "Streichresultat" : "Streichresultaten") .
		     " berücksichtigt";
	}
    }
    return @l ? (join(", ", @l) . ".") : "";
}

sub jahreswertung(@) {
    # veranstaltungen wertung laeufe_gesamt streichresultate klassenfarben
    # spalten klassen nach_relevanz tie_break
    my %args = (
	klassenfarben => $Auswertung::klassenfarben,
	@_,
    );

    my $wertung = $args{wertung};
    undef $args{streichresultate}
	unless defined $args{laeufe_gesamt};

    foreach my $veranstaltung (@{$args{veranstaltungen}}) {
	my $cfg = $veranstaltung->[0];
	my $fahrer_nach_startnummer = $veranstaltung->[1];
	wertungsklassen_setzen $fahrer_nach_startnummer, $cfg;
    }

    if ($args{klassen}) {
	my $klassen = { map { $_ => 1 } @{$args{klassen}} };
	foreach my $veranstaltung (@{$args{veranstaltungen}}) {
	    my $fahrer_nach_startnummer = $veranstaltung->[1];
	    foreach my $startnummer (keys %$fahrer_nach_startnummer) {
		my $fahrer = $fahrer_nach_startnummer->{$startnummer};
		delete $fahrer_nach_startnummer->{$startnummer}
		    unless exists $klassen->{$fahrer->{wertungsklasse}};
	    }
	}
    }

    for (my $n = 0; $n < @{$args{veranstaltungen}}; $n++) {
	my $veranstaltung = $args{veranstaltungen}[$n];
	my $cfg = $veranstaltung->[0];
	my $neue_startnummern = $cfg->{neue_startnummern};
	if ($neue_startnummern && %$neue_startnummern) {
	    # Startnummern umschreiben und kontrollieren, ob Startnummern
	    # doppelt verwendet wurden

	    my $fahrer_nach_startnummer;
	    foreach my $fahrer (values %{$veranstaltung->[1]}) {
		my $startnummer = $fahrer->{startnummer};
		if (exists $neue_startnummern->{$startnummer}) {
		    my $neue_startnummer = $neue_startnummern->{$startnummer};
		    next unless defined $neue_startnummer;

		    $fahrer->{alte_startnummer} = $fahrer->{startnummer};
		    $fahrer->{startnummer} = $neue_startnummer;
		    $startnummer = $neue_startnummer;
		}
		if (exists $fahrer_nach_startnummer->{$startnummer}) {
		    my $fahrer2 = $fahrer_nach_startnummer->{$startnummer};

		    if (defined $fahrer2->{wertungen}[$wertung - 1]{punkte}) {
			next unless defined $fahrer->{wertungen}[$wertung - 1]{punkte};
			doc_p "Veranstaltung " . ($n + 1) . ": Fahrer " .
			      ($fahrer->{alte_startnummer} // $fahrer->{startnummer}) .
			      " und " .
			      ($fahrer2->{alte_startnummer} // $fahrer2->{startnummer}) .
			      " verwenden beide die Startnummer $startnummer in der " .
			      "Jahreswertung!";
			return;
		    }
		}
		$fahrer_nach_startnummer->{$startnummer} = $fahrer;
	    }
	    $veranstaltung->[1] = $fahrer_nach_startnummer;
	}
    }

    my $startende_klassen;

    my $laeufe_pro_klasse;
    foreach my $veranstaltung (@{$args{veranstaltungen}}) {
	my $cfg = $veranstaltung->[0];
	my $fahrer_nach_startnummer = $veranstaltung->[1];

	foreach my $klasse (@{$cfg->{klassen}}) {
	    $cfg->{gewertet}[$klasse->{wertungsklasse} - 1] = 1
		if defined $klasse &&
		   defined $cfg->{sektionen}[$klasse->{wertungsklasse} - 1] &&
		   $klasse->{runden} > 0 &&
		   ($wertung != 1 || !$klasse->{keine_wertung1});
	}
	if (exists $cfg->{gewertet}) {
	    foreach my $fahrer (values %$fahrer_nach_startnummer) {
		$startende_klassen->{$fahrer->{wertungsklasse}} = 1
		    if $cfg->{gewertet}[$fahrer->{wertungsklasse} - 1];
	    }

	    for (my $n = 0; $n < @{$cfg->{gewertet}}; $n++) {
		$laeufe_pro_klasse->{$n + 1}++
		    if defined $cfg->{gewertet}[$n];
	    }
	}
    }

    my $punkteteilung;
    foreach my $veranstaltung (@{$args{veranstaltungen}}) {
	my $cfg = $veranstaltung->[0];
	$punkteteilung++
	    if $cfg->{punkteteilung};
    }

    my $spaltenbreite = 2;
    #foreach my $veranstaltung (@{$args{veranstaltungen}}) {
    #	my $cfg = $veranstaltung->[0];
    #	my $l = length $cfg->{label};
    #	$spaltenbreite = $l
    #	    if $l > $spaltenbreite;
    #}

    my $alle_fahrer;

    my $jahreswertung;
    foreach my $veranstaltung (@{$args{veranstaltungen}}) {
	my $fahrer_nach_startnummer = $veranstaltung->[1];

	foreach my $fahrer (values %$fahrer_nach_startnummer) {
	    my $startnummer = $fahrer->{startnummer};
	    if (defined $fahrer->{wertungen}[$wertung - 1]{punkte}) {
		my $klasse = $fahrer->{wertungsklasse};
		push @{$jahreswertung->{$klasse}{$startnummer}{wertungspunkte}},
		    $fahrer->{wertungen}[$wertung - 1]{punkte};
		push @{$jahreswertung->{$klasse}{$startnummer}{wertungsrang}},
		    $fahrer->{wertungen}[$wertung - 1]{rang};
	    }
	    $alle_fahrer->{$startnummer} = $fahrer;
	}
    }

    my $letzte_cfg = $args{veranstaltungen}[@{$args{veranstaltungen}} - 1][0];

    jahreswertung_berechnen $jahreswertung, $args{laeufe_gesamt}, $args{streichresultate}, $args{tie_break};

    my $zusammenfassung;
    foreach my $klasse (keys %$jahreswertung) {
	$zusammenfassung->{$klasse} = jahreswertung_zusammenfassung(
		$klasse, $laeufe_pro_klasse->{$klasse},
		$args{laeufe_gesamt}, $args{streichresultate});
    }

    my $gemeinsame_zusammenfassung;
    foreach my $klasse (keys %$zusammenfassung) {
	if (defined $gemeinsame_zusammenfassung) {
	    if ($gemeinsame_zusammenfassung ne $zusammenfassung->{$klasse}) {
		$gemeinsame_zusammenfassung = undef;
		last;
	    }
	} else {
	    $gemeinsame_zusammenfassung = $zusammenfassung->{$klasse};
	}
    }

    # Wir wollen, dass alle Tabellen gleich breit sind.
    my $namenlaenge = 0;
    foreach my $fahrer (map { $alle_fahrer->{$_} }
			    map { keys %$_ } values %$jahreswertung) {
	my $n = length "$fahrer->{nachname}, $fahrer->{vorname}";
	$namenlaenge = max($n, $namenlaenge);
    }

    doc_p $gemeinsame_zusammenfassung
	if defined $gemeinsame_zusammenfassung;

    foreach my $klasse (sort {$a <=> $b} keys %$jahreswertung) {
	my $klassenwertung = $jahreswertung->{$klasse};
	my $fahrer_in_klasse = [
	    map { $alle_fahrer->{$_->{startnummer}} }
		(sort jahreswertung_anzeige_cmp values %$klassenwertung) ];

	my $hat_streichpunkte;
	if (defined $args{streichresultate}) {
	    my $laeufe_bisher = $laeufe_pro_klasse->{$klasse};
	    my $streichen = streichen($klasse, $laeufe_bisher, $args{laeufe_gesamt},
				      $args{streichresultate});
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

	doc_h3 "$letzte_cfg->{klassen}[$klasse - 1]{bezeichnung}";

	doc_p $zusammenfassung->{$klasse}
	    unless defined $gemeinsame_zusammenfassung;

	my ($header, $body, $format);
	my $farbe = "";
	if ($RenderOutput::html && exists $args{klassenfarben}{$klasse}) {
	    $farbe = "<span style=\"color:$args{klassenfarben}{$klasse}\">◼</span>";
	}
	push @$format, "r3", "r3", "l$namenlaenge";
	push @$header, [ $farbe, "c" ], [ "Nr.", "r1", "title=\"Startnummer\"" ], "Name";
	foreach my $spalte (@{$args{spalten}}) {
	    push @$format, "l";
	    push @$header, spaltentitel($spalte);
	}
	for (my $n = 0; $n < @{$args{veranstaltungen}}; $n++) {
	    my $cfg = $args{veranstaltungen}[$n][0];
	    my $gewertet = $cfg->{gewertet}[$klasse - 1];
	    if ($gewertet) {
		push @$format, "r$spaltenbreite";
		push @$header,  $gewertet ? [ $cfg->{label}, "r1", "title=\"$cfg->{wertungen}[$wertung - 1]{titel}\"" ] : "";
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
	    push @$row, $startnummer > 0 ? $startnummer : '',
			$alle_fahrer->{$startnummer}{nachname} . " " .
			$alle_fahrer->{$startnummer}{vorname};
	    foreach my $spalte (@{$args{spalten}}) {
		push @$row, spaltenwert($spalte, $fahrer);
	    }
	    for (my $n = 0; $n < @{$args{veranstaltungen}}; $n++) {
		my $veranstaltung = $args{veranstaltungen}[$n];
		my $gewertet = $veranstaltung->[0]{gewertet}[$klasse - 1];
		my $fahrer = $veranstaltung->[1]{$startnummer};
		if ($gewertet) {
		    my $wertungspunkte = $fahrer->{wertungen}[$wertung - 1]{punkte};
		    my $feld = (defined $wertungspunkte &&
				$fahrer->{wertungsklasse} == $klasse) ?
				wertungspunkte($wertungspunkte, $punkteteilung) :
				$RenderOutput::html ? "" : "-";
		    my $wertungsrang = $fahrer->{wertungen}[$wertung - 1]{rang};
		    $feld = [ $feld, "r", "class=\"text2\"" ]
			if defined $wertungsrang &&
			   $fahrerwertung->{rang_wichtig}{$wertungsrang} &&
			   $args{nach_relevanz};
		    push @$row, $feld;
		}
	    }
	    if ($hat_streichpunkte) {
		my $feld = wertungspunkte($fahrerwertung->{streichpunkte}, $punkteteilung);
		$feld = [ $feld, "r", "class=\"text2\"" ]
		    if $fahrerwertung->{streichpunkte_wichtig} &&
		       $args{nach_relevanz};
		push @$row, $feld;
	    }
	    push @$row, wertungspunkte($fahrerwertung->{gesamtpunkte}, $punkteteilung);
	    push @$body, $row;
	}
	doc_table header => $header, body => $body, format => $format;
    }

    doc_h3 "Veranstaltungen:";
    my $body;
    for (my $n = 0; $n < @{$args{veranstaltungen}}; $n++) {
	my $cfg = $args{veranstaltungen}[$n][0];
	next unless exists $cfg->{gewertet} && @{$cfg->{gewertet}};

	my $label = defined $cfg->{label2} ? $cfg->{label2} : $cfg->{label};

	#push @$body, [ $label, "$cfg->{wertungen}[$wertung - 1]{titel}: $cfg->{wertungen}[$wertung - 1]{subtitel}" ];
	push @$body, [ $label, $cfg->{wertungen}[$wertung - 1]{titel} ];
    }
    doc_table header => ["", "Name"], body => $body, format => ["r", "l"];
}

1;
