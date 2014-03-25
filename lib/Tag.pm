# Tag

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

package Tag;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(random_tag);
use strict;

sub random_tag($) {
    my ($bytes) = @_;
    my $tag;

    open my $fh, '<', '/dev/random'
	or die "/dev/random: $!\n";
    (read $fh, $tag, $bytes) == $bytes
	or die "/dev/random: $!\n";
    $tag =~ s/(.)/sprintf("%02x",ord($1))/egs;

    return $tag;
}
