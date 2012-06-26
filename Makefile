NAME = trialtool-plus
VERSION = 0.8

COMMON_FILES = \
	RenderOutput.pm \
	Wertungen.pm \

LOCAL_FILES = \
	DBH_Logger.pm \
	db-sync.pl \
	doc/eer-diagramm.mwb \
	doc/eer-diagramm.pdf \
	README \
	ergebnisse.css \
	IO/Tee.pm \
	jahreswertung.pl \
	Makefile \
	otsv-check.pl \
	Parse/Binary/FixedFormat.pm \
	STH_Logger.pm \
	tageswertung.pl \
	Trialtool.pm \

WEB_FILES = \
	cgi-bin/ergebnisse/index-ssi.pl \
	cgi-bin/ergebnisse/jahreswertung-ssi.pl \
	cgi-bin/ergebnisse/statistik-ssi.pl \
	cgi-bin/ergebnisse/tageswertung-ssi.pl \
	cgi-bin/ergebnisse/wertungsreihe-ssi.pl \
	cgi-bin/veranstalter/fahrerliste.pl \
	cgi-bin/veranstalter/.htaccess \
	cgi-bin/veranstalter/nenngeld-ssi.pl \
	DatenbankAuswertung.pm.txt \
	htdocs/ergebnisse.css \
	htdocs/ergebnisse/.htaccess \
	htdocs/ergebnisse/index.shtml \
	htdocs/ergebnisse/jahreswertung.shtml \
	htdocs/ergebnisse/statistik.shtml \
	htdocs/ergebnisse/tageswertung.shtml \
	htdocs/ergebnisse/wertungsreihe.shtml \
	htdocs/.htaccess \
	htdocs/osk-logo.jpg \
	htdocs/osk-logo-original.jpg \
	htdocs/otsv-logo.jpg \

all:

dist:
	@rm -rf $(NAME)-$(VERSION)
	umask 022; \
	mkdir $(NAME)-$(VERSION); \
	for file in $(COMMON_FILES) $(LOCAL_FILES); do \
	    mkdir -p "$(NAME)-$(VERSION)/$$(dirname "$$file")"; \
	    case "$$file" in \
		*.pl | *.pm | README | Makefile) \
		    recode ../CR-LF < "$$file" > "$(NAME)-$(VERSION)/$$file" ;; \
		*) \
		    cat "$$file" > "$(NAME)-$(VERSION)/$$file" ;; \
	    esac; \
	    case "$$file" in \
		*.pl) \
		    chmod +x "$(NAME)-$(VERSION)/$$file" ;; \
	    esac; \
	done
	rm -f $(NAME)-$(VERSION).zip
	zip -r $(NAME)-$(VERSION).zip $(NAME)-$(VERSION)/
	rm -rf $(NAME)-$(VERSION)

upload:
	@set -e; \
	for file in $(COMMON_FILES) $(WEB_FILES); do \
	    echo $$file; \
	done
