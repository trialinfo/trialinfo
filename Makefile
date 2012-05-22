NAME = trialtool-plus
VERSION = 0.5

FILES = \
	html/ergebnisse.css \
	html/jahreswertung.shtml \
	html/otsv-logo.jpg \
	html/tageswertung.shtml \
	jahreswertung.pl \
	otsv-check.pl \
	Parse/Binary/FixedFormat.pm \
	RenderOutput.pm \
	tageswertung.pl \
	Trialtool.pm \
	Wertungen.pm \

OTHER_FILES = \
	db-sync.pl \
	doc/eer-diagramm.mwb \
	doc/eer-diagramm.pdf \
	README \
	Makefile \

all:

dist:
	@rm -f $(NAME)-$(VERSION)
	ln -s . $(NAME)-$(VERSION)
	zip $(NAME)-$(VERSION).zip \
		$(FILES:%=$(NAME)-$(VERSION)/%)
	rm -f $(NAME)-$(VERSION)
