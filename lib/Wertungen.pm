# Wertungen

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

package Wertungen;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(spaltentitel spaltenwert wertungspunkte);

use utf8;
use List::Util qw(max);
use POSIX qw(modf);
use RenderOutput;
use Auswertung;
use Berechnung;
use strict;

sub spaltentitel($) {
    my ($feld) = @_;

    my $titel = {
	"geburtsdatum" => [ "Geb.datum", "l1", "title=\"Geburtsdatum\"" ],
	"lizenznummer" => [ "Lizenz", "l1", "title=\"Lizenznummer\"" ],
        "bundesland" =>  [ "Bl.", "l1", "title=\"Bundesland\"" ],
	"lbl" => [ "Land", "l1", "title=\"Land (Bundesland)\"" ],
    };
    if (exists $titel->{$feld}) {
	return $titel->{$feld};
    } else {
	return ucfirst $feld;
    }
}

sub spaltenwert($$) {
    my ($spalte, $fahrer) = @_;

    if ($spalte eq 'lbl') {
	my @text;

	$fahrer->{bundesland} =~ s/ *$//;
	if (($fahrer->{land} // '') ne '') {
	    push @text, $fahrer->{land};
	}
	if (($fahrer->{bundesland} // '') ne '') {
	    push @text, '(' . $fahrer->{bundesland} . ')';
	}
	return join(' ', @text);
    }

    return $fahrer->{$spalte} // "";
}

sub log10($) {
    my ($x) = @_;
    return log($x) / log(10)
}

sub wertungspunkte($$) {
    my ($wertungspunkte, $punkteteilung) = @_;
    return undef unless defined $wertungspunkte;
    my $vorzeichen = '';
    if ($wertungspunkte < 0) {
	$vorzeichen = '−';  # Minuszeichen, kein Bindestrich!
	$wertungspunkte = -$wertungspunkte;
    }
    my ($komma, $ganzzahl) = modf($wertungspunkte);
    if ($komma && $punkteteilung) {
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
	    return "$vorzeichen$ganzzahl$bruch_zeichen->{$wert}"
		if $komma >= $wert - $eps &&
		   $komma <= $wert + $eps;
	}
    }
    my $prec = 2; # Maximale Nachkommastellen
    return sprintf("$vorzeichen%.*g", log10($wertungspunkte || 1) + 1 + $prec, $wertungspunkte);
}

1;
