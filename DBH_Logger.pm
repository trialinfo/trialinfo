package DBH_Logger;
our $AUTOLOAD;

use STH_Logger;
use strict;

sub new($$) {
    my ($class, $dbh) = @_;
    my $self = { dbh => $dbh };
    return bless $self, $class;
}

sub AUTOLOAD {
    my ($self) = @_;
    (my $sub = $AUTOLOAD) =~ s/.*://;
    $sub = ref($self->{dbh}) . "::" . $sub;

    no strict 'refs';
    if (wantarray) {
	my @x = &$sub($self->{dbh}, @_[1 .. $#_]);
	return @x;
    } else {
	return &$sub($self->{dbh}, @_[1 .. $#_]);
    }
}

sub DESTROY {
}

sub prepare($$) {
    my ($self, $sql) = @_;
    my $dbh = $self->{dbh};
    my $sth = $dbh->prepare($sql);
    if (defined $sth) {
	return new STH_Logger($sql, $sth);
    } else {
	return $sth;
    }
}

sub do($$$@) {
    my($self, $sql, $attr, @bind_values) = @_;
    my $dbh = $self->{dbh};
    my $logger = new STH_Logger($sql, undef);
    $logger->log(@bind_values);
    return $dbh->do($sql, $attr, @bind_values);
}

1;
