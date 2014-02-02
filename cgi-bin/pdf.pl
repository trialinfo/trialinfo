#! /usr/bin/perl -w -I../../trial-toolkit

use CGI;
use File::Temp qw(tempfile);

my $q = CGI->new;

if (0) {
    print "Content-type: text/plain\n\n";
    use Data::Dumper;
    print "url: ", $q->param("url"), "\n";
    print "filename: ", $q->param("filename"), "\n";
    print "html:\n", $q->param("html"), "\n";
} else {
    my $filename = $q->param("filename");
    if (!$filename || $filename =~ m{[\n"/\\]}) {
	$filename = "print.pdf";
    }

    my $baseurl = $q->param("url") // ".";
    $baseurl =~ s{/[^/]*}{};

    my ($out, $out_name) = tempfile();
    print $out $q->param("html");
    $out->flush()
	or die "$out_name: $!\n";
    my ($in, $in_name) = tempfile();
    system("weasyprint", "-f", "pdf", "--base-url", $baseurl, $out_name, $in_name)
	and die;

    print "Content-type: application/pdf\n";
    print "Content-Disposition: attachment; filename=\"$filename\"\n";
    print "\n";
    undef $/;
    print <$in>;
}
