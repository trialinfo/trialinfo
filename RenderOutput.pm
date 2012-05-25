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
	     doc_h1 doc_h2 doc_h3 doc_table doc_text);

use List::Util qw(max);
use strict;

sub render_text_table($$$$) {
    my ($header, $body, $footer, $format) = @_;
    my $f;
    my $width;

    foreach my $row ((defined $header ? $header : (),
		      @$body,
		      defined $footer ? $footer : ())) {
	for (my $n = 0; $n < @$row; $n++) {
	    my $w = length $row->[$n];
	    $width->[$n] = 0
		unless (exists $width->[$n]);
	    $width->[$n] = max($w, $width->[$n]);
	}
    }

    for (my $n = 0; $n < @$format; $n++) {
	$format->[$n] =~ /^(l|r)(\d*)/
	    or die "Format specifier $format->[$n] not understood\n";
	$width->[$n] = $2
	    if $2 ne "";
	$width->[$n] = -$width->[$n]
	    if $1 eq "l";
    }

    foreach my $row ((defined $header ? $header : (),
		      @$body,
		      defined $footer ? $footer : ())) {
	if (ref $row->[0]) {
	    printf " %*s", $width->[0], $row->[0][0];
	} else {
	    printf " %*s", $width->[0], $row->[0];
	}
	for (my $n = 1; $n < @$row; $n++) {
	    if (ref  $row->[$n]) {
		printf "  %*s", $width->[$n], $row->[$n][0];
	    } else {
		printf "  %*s", $width->[$n], $row->[$n];
	    }
	}
	print "\n";
    }
}

sub html_column_format($) {
    my ($format) = @_;

    $format =~ /^(l|c|r)?(\d*)$/
	or die "Format specifier $format not understood\n";
    return (($1 eq "l") ? " align=\"left\"" :
	    ($1 eq "r") ? " align=\"right\"" :
			  " align=\"center\"");
}

sub html_col_format($) {
    my ($format) = @_;

    $format =~ /^(l|c|r)?(\d*)$/
	or die "Format specifier $format not understood\n";
    return $2 ? sprintf " style=\"width:%.1fem\"", $2 * 0.9 * (0.4 + 0.6 * exp(-$2 / 40)) : "";
}

sub html_cell_format($) {
    my ($format) = @_;

    $format =~ /^(l|c|r)?(\d*)$/
	or die "Cell format specifier $format  not understood\n";
    return (($1 eq "l") ? " align=\"left\"" :
	    ($1 eq "r") ? " align=\"right\"" :
			  " align=\"center\"") .
	   ($2 ? " colspan=\"$2\"" : "");
}

sub render_html_table($$$$) {
    my ($header, $body, $footer, $format) = @_;
    my $f;
    my $r;

    print "<table id=\"wertung\" style=\"empty-cells:show;\">\n";
    print "<colgroup>\n";
    for (my $n = 0; $n < @$format; $n++) {
	print "<col" . html_col_format($format->[$n]) . ">\n";
    }
    print "</colgroup>\n";
    if ($header) {
	#print "<thead>\n";
	print "<tr>";
	for (my $n = 0; $n < @$header; $n++) {
	    if (ref $header->[$n]) {
		print "<th" . html_cell_format($header->[$n][1]) . ">" .
		      $header->[$n][0] . "</th>";
	    } else {
		print "<th" . html_column_format($format->[$n]) . ">" .
		      $header->[$n] . "</th>"
	    }
	}
	print "</tr>\n";
	#print "</thead>\n";
    }
    #print "<tbody>\n";
    foreach my $row (@$body) {
	if (@$row) {
	    print "<tr" . ( $r++ % 2 ? ' class="alt"' : '') . ">";
	    for (my $n = 0; $n < @$row; $n++) {
		if (ref $row->[$n]) {
		    print "<td " . html_cell_format($row->[$n][1]) . ">" .
			  $row->[$n][0] . "</td>";
		} else {
		    print "<td" . html_column_format($format->[$n]) . ">" .
			  $row->[$n] . "</td>";
		}
	    }
	    print "</tr>\n";
	}
    }
    #print "</tbody>\n";
    if ($footer) {
	#print "<tfoot>\n";
	print "<tr class=\"footer\">";
	for (my $n = 0; $n < @$footer; $n++) {
	    if (ref $footer->[$n]) {
		print "<td" . html_cell_format($footer->[$n][1]) . ">" .
		      $footer->[$n][0] . "</td>";
	    } else {
		print "<td" . html_column_format($format->[$n]) . ">" .
		      $footer->[$n] . "</td>"
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

sub doc_table($$$$) {
    my ($header, $body, $footer, $format) = @_;
    if ($html) {
	render_html_table $header, $body, $footer, $format;
    } else {
	render_text_table $header, $body, $footer, $format;
    }
}

1;
