package HTTPError;

sub new($$$) {
    my ($class, $status, $error) = @_;
    bless { status => $status, error => $error }, $class;
}

1;
