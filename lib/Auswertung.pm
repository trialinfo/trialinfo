package Auswertung;

use JSON;
require Exporter;
our @ISA = qw(Exporter);
our @EXPORT = qw($database $username $password $cgi_verbose);

my $config;
{
    local $/; #Enable 'slurp' mode
    my $fh;
    foreach my $dir (@INC) {
	my $path = "$dir/../backend/config.json";
	if (-e $path) {
	  open $fh, "<", $path
	      or die "$path: $!\n";
	  $config = decode_json(<$fh>);
	  close $fh;
	  last;
	}
    }
    die "File 'backend/config.json' not found\n"
	unless $config;
}

my $db = $config->{database};

our $database = "mysql:$db->{database};host=$db->{host}";
our $username = $db->{user};
our $password = $db->{password};

our $cgi_verbose = $config->{cgi_verbose};

1;
