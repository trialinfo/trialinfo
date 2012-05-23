package DatenbankAuswertung;

require Exporter;
@ISA = qw(Exporter);
@EXPORT = qw($database $username $password);

$database = 'mysql:mydb;mysql_enable_utf8=1';
$username = 'auswertung';
$password = '3tAw4oSs';

1;
