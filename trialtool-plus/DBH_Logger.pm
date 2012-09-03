package DBH_Logger;
our $AUTOLOAD;

use STH_Logger;
use strict;

sub new($$) {
    my ($class, $dbh) = @_;
    my $self = { };
    my $tied = tie %$self, $class;
    $tied->{dbh} = $dbh;

    return bless $self, $class;
}

sub AUTOLOAD {
    my ($self) = @_;
    my $tied = tied %$self;
    (my $sub = $AUTOLOAD) =~ s/.*://;
    $sub = ref($tied->{dbh}) . "::" . $sub;

    no strict 'refs';
    if (wantarray) {
	my @x = &$sub($tied->{dbh}, @_[1 .. $#_]);
	return @x;
    } else {
	return &$sub($tied->{dbh}, @_[1 .. $#_]);
    }
}

sub TIEHASH($) {
    my ($class) = @_;
    my $self = { };
    return bless $self, $class;
}

sub FETCH($$) {
    my ($tied, $key) = @_;
    return $tied->{sth}{$key};
}

sub DESTROY {
}

sub prepare($$) {
    my ($self, $sql) = @_;
    my $tied = tied %$self;
    my $dbh = $tied->{dbh};
    my $sth = $dbh->prepare($sql);
    if (defined $sth) {
	return new STH_Logger($sql, $sth);
    } else {
	return $sth;
    }
}

sub do($$$@) {
    my($self, $sql, $attr, @bind_values) = @_;
    my $tied = tied %$self;
    my $dbh = $tied->{dbh};
    my $logger = new STH_Logger($sql, undef);
    $logger->log(@bind_values);
    return $dbh->do($sql, $attr, @bind_values);
}

1;
