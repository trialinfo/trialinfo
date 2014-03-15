# Render a table as text

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

package RenderOutput;
our $html;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(render_text_table render_html_table
	     doc_text doc_p doc_h1 doc_h2 doc_h3 doc_table);

use List::Util qw(max);
use strict;

sub render_text_table(@) {
    # header body footer format
    my %args = @_;
    my $width;

    foreach my $row ((defined $args{header} ? $args{header} : (),
		      @{$args{body}},
		      defined $args{footer} ? $args{footer} : ())) {
	for (my $n = 0; $n < @$row; $n++) {
	    my $f = (ref $row->[$n] ? $row->[$n][0] : $row->[$n]) // "";
	    my $w = length $f;
	    $width->[$n] = max($w, $width->[$n] // 0);
	}
    }

    for (my $n = 0; $n < @{$args{format}}; $n++) {
	$args{format}[$n] =~ /^(l|r)(\d*)/
	    or die "Format specifier $args{format}[$n] not understood\n";
	$width->[$n] = $2
	    if $2 ne "";
	$width->[$n] = -$width->[$n]
	    if $1 eq "l";
    }

    foreach my $row ((defined $args{header} ? $args{header} : (),
		      @{$args{body}},
		      defined $args{footer} ? $args{footer} : ())) {
	if (ref $row->[0]) {
	    printf " %*s", $width->[0], $row->[0][0];
	} else {
	    printf " %*s", $width->[0], $row->[0];
	}
	for (my $n = 1; $n < @$row; $n++) {
	    my $x = (ref $row->[$n] ? $row->[$n][0] : $row->[$n]) // "";
	    printf "  %*s", $width->[$n], $x;
	}
	print "\n";
    }
}

sub html_column_format($) {
    my ($format) = @_;

    $format =~ /^(l|c|r)?(\d*)$/
	or die "Format specifier $format not understood\n";
    return ($1 eq "l") ? " align=\"left\"" :
	   ($1 eq "r") ? " align=\"right\"" :
			 " align=\"center\"";
}

sub html_col_format($) {
    my ($format) = @_;

    $format =~ /^(l|c|r)?(\d*)$/
	or die "Format specifier $format not understood\n";
    return $2 ? sprintf " style=\"width:%.1fem\"", $2 * 0.9 * (0.4 + 0.6 * exp(-$2 / 40)) : "";
}

sub html_cell_format(@) {
    my ($text, $format, $attrs) = @_;

    $format =~ /^(l|c|r)?(\d*)$/
	or die "Cell format specifier $format  not understood\n";
    return (($1 eq "l") ? " align=\"left\"" :
	    ($1 eq "r") ? " align=\"right\"" :
			  " align=\"center\"") .
	   (($2 || 1) > 1 ? " colspan=\"$2\"" : "") .
	   (defined $attrs ? " $attrs" : "");
}

sub render_html_table(@) {
    # header body footer format
    my %args = @_;
    my $f;
    my $r;

    print "<table class=\"wertung\">\n";
    print "<colgroup>\n";
    for (my $n = 0; $n < @{$args{format}}; $n++) {
	print "<col" . html_col_format($args{format}[$n]) . ">\n";
    }
    print "</colgroup>\n";
    if ($args{header}) {
	print "<thead>\n";
	print "<tr>";
	for (my $n = 0; $n < @{$args{header}}; $n++) {
	    if (ref $args{header}[$n]) {
		print "<th" . html_cell_format(@{$args{header}[$n]}) . ">" .
		      $args{header}[$n][0] . "</th>";
	    } else {
		print "<th" . html_column_format($args{format}[$n]) . ">" .
		      $args{header}[$n] . "</th>"
	    }
	}
	print "</tr>\n";
	print "</thead>\n";
    }
    #print "<tbody>\n";
    foreach my $row (@{$args{body}}) {
	if (@$row) {
	    print "<tr" . ( $r++ % 2 ? ' class="alt"' : '') . ">";
	    for (my $n = 0; $n < @$row; $n++) {
		my $x = (ref $row->[$n] ? $row->[$n][0] : $row->[$n]) // "";
		if (ref $row->[$n]) {
		    print "<td " . html_cell_format(@{$row->[$n]}) . ">" .
			  $x . "</td>";
		} else {
		    print "<td" . html_column_format($args{format}[$n]) . ">" .
			  $x . "</td>";
		}
	    }
	    print "</tr>\n";
	}
    }
    #print "</tbody>\n";
    if ($args{footer}) {
	#print "<tfoot>\n";
	print "<tr class=\"footer\">";
	for (my $n = 0; $n < @{$args{footer}}; $n++) {
	    if (ref $args{footer}[$n]) {
		print "<td" . html_cell_format(@{$args{footer}[$n]}) . ">" .
		      $args{footer}[$n][0] . "</td>";
	    } else {
		print "<td" . html_column_format($args{format}[$n]) . ">" .
		      $args{footer}[$n] . "</td>"
	    }
	}
	print "</tr>\n";
	#print "</tfoot>\n";
    }
    print "</table>\n";
}

sub doc_text($) {
    my ($text) = @_;
    if ($html) {
	$text =~ s/\n/<br>/g;
    }
    return $text;
}

sub doc_p($) {
    my ($text) = @_;
    if ($html) {
	print "<p>" . doc_text($text) . "</p>\n";
    } else {
	print "$text\n";
    }
}

sub doc_h1($) {
    my ($header) = @_;
    if ($html) {
	print "<h1>$header</h1>\n";
    } else {
	print "$header\n";
   }
}

sub doc_h2($) {
    my ($header) = @_;
    if ($html) {
	print "<h2>$header</h2>\n";
    } else {
	print "$header\n";
   }
}

sub doc_h3($) {
    my ($header) = @_;
    if ($html) {
	print "<h3>$header</h3>\n";
    } else {
	print "\n$header\n";
   }
}

sub doc_table(@) {
    # header body footer format
    if ($html) {
	render_html_table @_;
    } else {
	render_text_table @_;
    }
}

1;
