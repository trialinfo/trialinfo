package JSON_bool;

use JSON;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(json_bool json_unbool);
use strict;

sub json_bool($) {
    my ($scalar) = @_;

    return defined $scalar ?
	   ($scalar ? JSON::true : JSON::false) : undef;
}

sub json_unbool($) {
    my ($scalar) = @_;

    return JSON::is_bool($scalar) ? $scalar + 0 : $scalar;
}


