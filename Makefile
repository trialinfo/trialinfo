NAME = trial-toolkit
VERSION = 0.16

CURL = curl

DOWNLOAD_FILES = \
	htdocs/js/jquery.js \
	htdocs/js/jquery.min.js \
	htdocs/js/raphael.js \
	htdocs/js/raphael-min.js \

COMMON_FILES = \
	trial-toolkit/Trialtool.pm \
	trial-toolkit/Parse/Binary/FixedFormat.pm \
	trial-toolkit/Datenbank.pm \
	trial-toolkit/RenderOutput.pm \
	trial-toolkit/Wertungen.pm \
	trial-toolkit/TrialToolkit.pm.txt \

LOCAL_FILES = \
	db-sync.pl \
	db-export.pl \
	doc/eer-diagramm.mwb \
	doc/eer-diagramm.pdf \
	README \
	IO/Tee.pm \
	jahreswertung.pl \
	Makefile \
	tageswertung.pl \

WEB_FILES = \
	$(DOWNLOAD_FILES) \
	cgi-bin/ergebnisse/wereihen-ssi.pl \
	cgi-bin/ergebnisse/jahreswertung-ssi.pl \
	cgi-bin/ergebnisse/statistik-ssi.pl \
	cgi-bin/ergebnisse/tageswertung-ssi.pl \
	cgi-bin/ergebnisse/vareihe-bezeichnung.pl \
	cgi-bin/ergebnisse/vareihe-ssi.pl \
	cgi-bin/ergebnisse/wereihe-ssi.pl \
	cgi-bin/veranstalter/export.pl \
	cgi-bin/veranstalter/export-ssi.pl \
	cgi-bin/veranstalter/fahrerliste.pl \
	cgi-bin/veranstalter/starterzahl-ssi.pl \
	htdocs/js/jquery.polartimer.js \

all:

htdocs/js/jquery.js htdocs/js/jquery.min.js:
	@mkdir -p $(dir $@)
	$(CURL) -o $@ --fail --silent --location http://code.jquery.com/$(notdir $@)

htdocs/js/raphael.js htdocs/js/raphael-min.js:
	@mkdir -p $(dir $@)
	$(CURL) -o $@ --fail --silent --location \
		http://github.com/DmitryBaranovskiy/raphael/raw/master/$(notdir $@)

dist: $(COMMON_FILES) $(LOCAL_FILES)
	@set -e; \
	rm -rf $(NAME)-$(VERSION); \
	umask 022; \
	mkdir $(NAME)-$(VERSION); \
	for file in $^; do \
	    original=$$file; \
	    file=$$(echo "$$original" | sed -e 's:Windows/::'); \
	    mkdir -p "$(NAME)-$(VERSION)/$$(dirname "$$file")"; \
	    case "$$file" in \
		*.pl | *.pm | *.pm.txt | README | Makefile) \
		    recode ../CR-LF < "$$original" > "$(NAME)-$(VERSION)/$$file" ;; \
		*) \
		    cat "$$original" > "$(NAME)-$(VERSION)/$$file" ;; \
	    esac; \
	    case "$$file" in \
		*.pl) \
		    chmod +x "$(NAME)-$(VERSION)/$$file" ;; \
	    esac; \
	done
	rm -f $(NAME)-$(VERSION).zip
	zip -r $(NAME)-$(VERSION).zip $(NAME)-$(VERSION)/
	rm -rf $(NAME)-$(VERSION)

clean:
	rm -f $(DOWNLOAD)
