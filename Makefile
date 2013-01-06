NAME = trial-toolkit
VERSION = 0.16

MOUNTPOINT ?= /mnt/easyserver
SUBDIR ?= www2.otsv.at

VPATH = trial-toolkit

CURL = curl

DOWNLOAD_FILES = \
	htdocs/js/jquery.js \
	htdocs/js/jquery.min.js \
	htdocs/js/raphael.js \
	htdocs/js/raphael-min.js \

COMMON_FILES = \
	$(UPPER_COMMON_FILES) \
	./trial-toolkit/Datenbank.pm \
	./trial-toolkit/RenderOutput.pm \
	./trial-toolkit/Wertungen.pm \
	htdocs/ergebnisse.css \

LOCAL_FILES = \
	$(UPPER_LOCAL_FILES) \
	db-sync.pl \
	db-export.pl \
	doc/eer-diagramm.mwb \
	doc/eer-diagramm.pdf \
	README \
	IO/Tee.pm \
	jahreswertung.pl \
	Makefile \
	otsv-check.pl \
	./trial-toolkit/Parse/Binary/FixedFormat.pm \
	tageswertung.pl \
	./trial-toolkit/Trialtool.pm \
	Windows/jahreswertung-osk.bat \
	Windows/jahreswertung-otsv.bat \
	Windows/loeschen.bat \
	Windows/sync-jetzt.bat \
	Windows/sync-laufend.bat \
	Windows/tageswertung.bat \
	./trial-toolkit/TrialToolkit.pm.txt \

WEB_FILES = \
	$(UPPER_WEB_FILES) \
	$(DOWNLOAD_FILES) \
	cgi-bin/ergebnisse/wereihen-ssi.pl \
	cgi-bin/ergebnisse/jahreswertung-ssi.pl \
	cgi-bin/ergebnisse/statistik-ssi.pl \
	cgi-bin/ergebnisse/tageswertung-ssi.pl \
	cgi-bin/ergebnisse/vareihe-ssi.pl \
	cgi-bin/ergebnisse/wereihe-ssi.pl \
	cgi-bin/veranstalter/fahrerliste.pl \
	cgi-bin/veranstalter/.htaccess \
	cgi-bin/veranstalter/starterzahl-ssi.pl \
	htdocs/ergebnisse/.htaccess \
	htdocs/ergebnisse/index.shtml \
	htdocs/ergebnisse/jahreswertung.shtml \
	htdocs/ergebnisse/statistik.shtml \
	htdocs/ergebnisse/tageswertung.js \
	htdocs/ergebnisse/tageswertung.shtml \
	htdocs/ergebnisse/wereihe.shtml \
	htdocs/.htaccess \
	htdocs/js/jquery.polartimer.js \
	htdocs/veranstalter/.htaccess \
	htdocs/veranstalter/index.shtml \
	htdocs/veranstalter/starterzahl.shtml \
	./trial-toolkit/TrialToolkit.pm.txt \

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
	    file=$$(echo "$$original" | sed -e 's:^trial-toolkit/::' -e 's:Windows/::'); \
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

upload:
	@$(MAKE) -f $(MAKEFILE_LIST) do-upload CMD='cp -v "$$$$original" "$$(MOUNTPOINT)/$$(SUBDIR)/$$$$file"'

upload-diff:
	@$(MAKE) -f $(MAKEFILE_LIST) do-upload CMD='diff -Nu "$$(MOUNTPOINT)/$$(SUBDIR)/$$$$file" "$$$$original" || true'

do-upload: $(COMMON_FILES) $(WEB_FILES)
	@set -e; \
	for file in $^; do \
	    original=$$file; \
	    file=$$(echo "$$original" | sed -e 's:^trial-toolkit/::'); \
	    if ! test -f "$(MOUNTPOINT)/$(SUBDIR)/$$file" || \
	       ! cmp -s "$$original" "$(MOUNTPOINT)/$(SUBDIR)/$$file"; then \
		$(CMD); \
	    fi; \
	done

clean:
	rm -f $(DOWNLOAD)
