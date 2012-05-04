package Wertungen;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(rang_und_wertungspunkte_berechnen tageswertung jahreswertung_berechnen);

use List::Util qw(max);
use RenderOutput;
use strict;

sub rang_vergleich($$$) {
    my ($a, $b, $cfg) = @_;

    # Fahrer im Rennen und ausgefallene Fahrer vor Fahrern aus der Wertung und
    # nicht gestarteten Fahrern
    return ($b->{ausfall} <= 3) <=> ($a->{ausfall} <= 3)
	if ($a->{ausfall} <= 3) != ($b->{ausfall} <= 3);

    # Abfallend nach gefahrenen Runden
    return $b->{runden} <=> $a->{runden}
	if $a->{runden} != $b->{runden};

    # Aufsteigend nach Punkten
    return $a->{punkte} <=> $b->{punkte}
	if $a->{punkte} != $b->{punkte};

    # Aufsteigend nach Ergebnis im Stechen
    return $a->{stechen} <=> $b->{stechen}
	if  $a->{stechen} != $b->{stechen};

    # Abfallend nach 0ern, 1ern, 2ern, 3ern
    my $ax = $a->{os_1s_2s_3s};
    my $bx = $b->{os_1s_2s_3s};
    for (my $n = 0; $n < @$ax; $n++) {
	return $bx->[$n] <=> $ax->[$n]
	    if $ax->[$n] != $bx->[$n];
    }

    # Aufsteigend nach der besten Runde?
    if ($cfg->{wertungsmodus} != 0) {
	$ax = $a->{punkte_pro_runde};
	$bx = $b->{punkte_pro_runde};
	if ($cfg->{wertungsmodus} == 1) {
	    for (my $n = 0; $n < @$ax; $n++) {
		return $ax->[$n] <=> $bx->[$n]
		    if $ax->[$n] != $bx->[$n];
	    }
	} else {
	    for (my $n = @$ax - 1; $n >= 0; $n--){
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

    my $fahrer_nach_klassen = fahrer_nach_klassen($fahrer_nach_startnummer);
    foreach my $klasse (keys %$fahrer_nach_klassen) {
	my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};

	my $rang = 1;
	$fahrer_in_klasse = [ sort { rang_vergleich($a, $b, $cfg) } @$fahrer_in_klasse ];
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

    for (my $wertung = 0; $wertung < @{$cfg->{wertungen}}; $wertung++) {
	foreach my $klasse (keys %$fahrer_nach_klassen) {
	    my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};

	    my $wp_idx = 0;
	    my $vorheriger_fahrer;
	    foreach my $fahrer (@$fahrer_in_klasse) {
		next unless defined $fahrer->{rang} &&
			    $fahrer->{wertungen}[$wertung] &&
			    $fahrer->{runden} == $cfg->{runden}[$klasse - 1] &&
			    !$fahrer->{ausfall};
		if ($vorheriger_fahrer &&
		    $vorheriger_fahrer->{rang} == $fahrer->{rang}) {
		    $fahrer->{wertungspunkte}[$wertung] =
			$vorheriger_fahrer->{wertungspunkte}[$wertung];
		} elsif ($wp_idx < @$wertungspunkte &&
			 $wertungspunkte->[$wp_idx] != 0) {
		    $fahrer->{wertungspunkte}[$wertung] = $wertungspunkte->[$wp_idx];
		}
		$wp_idx++;
		$vorheriger_fahrer = $fahrer;
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

sub tageswertung($$$) {
    my ($cfg, $fahrer_nach_startnummer, $wertung) = @_;

    my $ausfall = {
	0 => "",
	3 => "ausgefallen",
	4 => "aus der wertung",
	5 => "nicht gestartet",
	6 => "nicht gestartet, entschuldigt"
    };

    # Wir wollen, dass alle Tabellen gleich breit sind.
    my $namenlaenge = 0;
    foreach my $fahrer (values %$fahrer_nach_startnummer) {
	my $n = length "$fahrer->{nachname}, $fahrer->{vorname}";
	$namenlaenge = max($n, $namenlaenge);
    }

    my $fahrer_nach_klassen = fahrer_nach_klassen($fahrer_nach_startnummer);
    foreach my $klasse (sort {$a <=> $b} keys %$fahrer_nach_klassen) {
	my $fahrer_in_klasse = $fahrer_nach_klassen->{$klasse};
	my $idx = $klasse - 1;
	my $runden = $cfg->{runden}[$idx];
	my ($header, $body, $format);

	$fahrer_in_klasse = [ map { ($_->{runden} > 0 ||
				     $_->{papierabnahme}) ?
				     $_ : () } @$fahrer_in_klasse ];
	next unless @$fahrer_in_klasse > 0;

	doc_h3 "$cfg->{klassen}[$idx]";
	push @$format, "r4", "r3", "l$namenlaenge";
	push @$header, "", "Nr.", "Name";
	for (my $n = 0; $n < $runden; $n++) {
	    push @$format, "r2";
	    push @$header, "R" . ($n + 1);
	}
	push @$format, "r2", "r2", "r2", "r2", "r2", "r3", "r3";
	push @$header, "ZP", "0S", "1S", "2S", "3S", "Ges", "WP";

	$fahrer_in_klasse = [ sort rang_wenn_definiert @$fahrer_in_klasse ];
	foreach my $fahrer (@$fahrer_in_klasse) {
	    my $row;
	    if ($fahrer->{runden} == $runden &&  !$fahrer->{ausfall}) {
		push @$row, "$fahrer->{rang}.";
	    } else {
		push @$row, "";
	    }
	    push @$row, $fahrer->{startnummer};
	    push @$row, $fahrer->{nachname} . ", " . $fahrer->{vorname};
	    for (my $n = 0; $n < $runden; $n++) {
		if ($fahrer->{runden} > $n) {
		    push @$row, $fahrer->{punkte_pro_runde}[$n];
		} else {
		    push @$row, "-";
		}
	    }
	    push @$row, $fahrer->{zusatzpunkte} || "";
	    if ($fahrer->{ausfall} != 0 || $fahrer->{runden} == 0) {
		push @$row, [ $ausfall->{$fahrer->{ausfall}}, "c5" ], "";
	    } elsif ($fahrer->{runden} > 0) {
		for (my $n = 0; $n < 4; $n++) {
		    push @$row, $fahrer->{os_1s_2s_3s}[$n];
		}
		push @$row, $fahrer->{punkte};
		if (exists $fahrer->{wertungspunkte}[$wertung]) {
		    push @$row, $fahrer->{wertungspunkte}[$wertung];
		} else {
		    push @$row, "";
		}
	    }
	    push @$body, $row;
	}
	doc_table $header, $body, $format;
    }
}

sub jahreswertung_berechnen($$) {
    my ($jahreswertung, $streichresultate) = @_;

    foreach my $klasse (keys %$jahreswertung) {
	foreach my $startnummer (keys $jahreswertung->{$klasse}) {
	    my $fahrer = $jahreswertung->{$klasse}{$startnummer};
	    $jahreswertung->{$klasse}{$startnummer}{startnummer} = $startnummer;
	    my $wertungspunkte = $fahrer->{wertungspunkte};
	    my $n = 0;
	    if ($streichresultate) {
		$fahrer->{streichpunkte} = 0;
		$wertungspunkte = [ sort { $a <=> $b }
					 @$wertungspunkte ];
		for (; $n < $streichresultate && $n < @$wertungspunkte; $n++) {
		    $fahrer->{streichpunkte} += $wertungspunkte->[$n];
		}
	    }
	    $fahrer->{gesamtpunkte} = 0;
	    for (; $n < @$wertungspunkte; $n++) {
		$fahrer->{gesamtpunkte} += $wertungspunkte->[$n];
	    }

	    delete $jahreswertung->{$klasse}{$startnummer}
		unless $fahrer->{gesamtpunkte} > 0;
	}

	delete $jahreswertung->{$klasse}
	    unless %{$jahreswertung->{$klasse}};
    }
}
