NAME = trialtool-plus
VERSION = 0.6

COMMON_FILES = \
	htdocs/ergebnisse.css \
	htdocs/jahreswertung.shtml \
	htdocs/otsv-logo.jpg \
	htdocs/tageswertung.shtml \
	RenderOutput.pm \
	Trialtool.pm \
	Wertungen.pm \

LOCAL_FILES = \
	jahreswertung.pl \
	otsv-check.pl \
	Parse/Binary/FixedFormat.pm \
	tageswertung.pl \
	db-sync.pl \

WEB_FILES = \
	cgi-bin/ergebnisse/index-ssi.pl \
	cgi-bin/ergebnisse/jahreswertung-ssi.pl \
	cgi-bin/ergebnisse/statistik-ssi.pl \
	cgi-bin/ergebnisse/tageswertung-ssi.pl \
	cgi-bin/ergebnisse/wertungsreihe-ssi.pl \
	DatenbankAuswertung.pm.txt \
	htdocs/.htaccess \
	htdocs/index.shtml \
	htdocs/statistik.shtml \
	htdocs/wertungsreihe.shtml \

OTHER_FILES = \
	doc/eer-diagramm.mwb \
	doc/eer-diagramm.pdf \
	README \
	Makefile \

all:

dist:
	@rm -f $(NAME)-$(VERSION)
	ln -s . $(NAME)-$(VERSION)
	zip $(NAME)-$(VERSION).zip \
		$(COMMON_FILES:%=$(NAME)-$(VERSION)/%) \
		$(LOCAL_FILES:%=$(NAME)-$(VERSION)/%)
	rm -f $(NAME)-$(VERSION)

upload:
	@set -e; \
	for file in $(COMMON_FILES) $(WEB_FILES); do \
	    echo $$file; \
	done
