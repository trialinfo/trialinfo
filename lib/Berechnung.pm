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
@EXPORT = qw(wertungsklassen_setzen ausser_konkurrenz fahrer_nach_klassen);

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

sub fahrer_nach_klassen($) {
    my ($fahrer_nach_startnummern) = @_;
    my $fahrer_nach_klassen;

    foreach my $fahrer (values %$fahrer_nach_startnummern) {
	my $klasse = $fahrer->{gruppe} ? 0 : $fahrer->{wertungsklasse};
	push @{$fahrer_nach_klassen->{$klasse}}, $fahrer
	    if defined $klasse;
    }
    return $fahrer_nach_klassen;
}

1;
