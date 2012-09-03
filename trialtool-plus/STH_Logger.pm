package STH_Logger;
our $AUTOLOAD;

use Scalar::Util qw(looks_like_number);
use strict;

sub new($$) {
    my ($class, $sql, $sth) = @_;
    my $self = { };
    my $tied = tie %$self, $class;
    $sql =~ s/^\s*//;
    $sql =~ s/\s*$//;
    $tied->{sql} = $sql;
    $tied->{sth} = $sth
	if defined $sth;

    return bless $self, $class;
}

sub AUTOLOAD {
    my ($self) = @_;
    my $tied = tied %$self;
    (my $sub = $AUTOLOAD) =~ s/.*://;
    $sub = ref($tied->{sth}) . "::" . $sub;

    no strict 'refs';
    if (wantarray) {
	my @x = &$sub($tied->{sth}, @_[1 .. $#_]);
	return @x;
    } else {
	return &$sub($tied->{sth}, @_[1 .. $#_]);
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

sub log_sql_value($) {
    my ($_) = @_;

    return "NULL"
	unless defined $_;
    return $_
	if looks_like_number $_;
    s/'/''/g;
    return "'$_'";
}

sub log($@) {
    my ($self, @bind_values) = @_;
    my $tied = tied %$self;
    my $sql = $tied->{sql};
    $sql =~ s/\?/log_sql_value shift @bind_values/ge;
    print "    $sql\n";
}

sub execute($@) {
    my ($self, @bind_values) = @_;
    my $tied = tied %$self;
    my $sth = $tied->{sth};
    $self->log(@bind_values);
    return $sth->execute(@bind_values);
}

1;
