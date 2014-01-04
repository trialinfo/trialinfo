NAME = trial-toolkit
VERSION = 0.17

MOUNTPOINT ?= /mnt/easyserver

ifeq ($(WHAT),production)
HOST ?= www2.otsv.at
AUTH_PREFIX = /srv/www/4571/www/@HOST@
else
ifeq ($(WHAT),staging)
HOST ?= www4.otsv.at
AUTH_PREFIX = /srv/www/4571/www/@HOST@
else
ifeq ($(WHAT),testing)
HOST = localhost
AUTH_PREFIX = $(PWD)
else
HOST = $(error WHAT must be set to "staging" or "production")
endif
endif
endif

MAKEFLAGS = --no-print-directory

CURL = curl
SED = sed

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
	htdocs/ergebnisse.css \
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
	otsv-check.pl \
	otsv-init.pl \
	tageswertung.pl \
	Windows/jahreswertung-osk.bat \
	Windows/jahreswertung-otsv1.bat \
	Windows/jahreswertung-otsv2.bat \
	Windows/loeschen.bat \
	Windows/sync-jetzt.bat \
	Windows/sync-laufend.bat \
	Windows/sync-laufend-fahrrad.bat \
	Windows/tageswertung.bat \

GENERATED_WEB_FILES = \
	cgi-bin/veranstalter/.htaccess \
	htdocs/ergebnisse/.htaccess \
	htdocs/.htaccess \
	htdocs/veranstalter/.htaccess \

WEB_FILES = \
	$(DOWNLOAD_FILES) \
	$(GENERATED_WEB_FILES) \
	cgi-bin/ergebnisse/jahreswertung-ssi.pl \
	cgi-bin/ergebnisse/statistik-ssi.pl \
	cgi-bin/ergebnisse/tageswertung-ssi.pl \
	cgi-bin/ergebnisse/vareihe-bezeichnung.pl \
	cgi-bin/ergebnisse/vareihe-ssi.pl \
	cgi-bin/veranstalter/export.pl \
	cgi-bin/veranstalter/export-ssi.pl \
	cgi-bin/veranstalter/fahrerliste.pl \
	cgi-bin/veranstalter/nenngeld-ssi.pl \
	cgi-bin/veranstalter/starterzahl-ssi.pl \
	htdocs/apple-touch-icon.png \
	htdocs/ergebnisse/index.shtml \
	htdocs/ergebnisse/2012.shtml \
	htdocs/ergebnisse/jahreswertung.shtml \
	htdocs/ergebnisse/statistik.shtml \
	htdocs/ergebnisse/tageswertung.js \
	htdocs/ergebnisse/tageswertung.shtml \
	htdocs/ergebnisse/vareihe.shtml \
	htdocs/favicon.ico \
	htdocs/js/jquery.polartimer.js \
	htdocs/veranstalter/index.shtml \
	htdocs/veranstalter/export.shtml \
	htdocs/veranstalter/nenngeld.shtml \
	htdocs/veranstalter/starterzahl.shtml \
	htdocs/ergebnisse/0.png \
	htdocs/ergebnisse/1.png \
	htdocs/ergebnisse/2.png \
	htdocs/ergebnisse/3.png \
	htdocs/ergebnisse/4.png \
	htdocs/ergebnisse/5.png \

MAKEFLAGS = --no-print-directory

all: testing

download: $(DOWNLOAD_FILES)

testing: download
	@$(MAKE) -s $(GENERATED_WEB_FILES) WHAT=testing

generate_web_file = $(SED) -e 's:@AUTH_PREFIX@:$(AUTH_PREFIX):g' -e 's:@HOST@:$(HOST):g'

$(GENERATED_WEB_FILES): %: %.in
	@# $(HOST)
	@echo "$< -> $@"
	@$(generate_web_file) < $< > $@.tmp
	@mv $@.tmp $@

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
	    file=$$(echo "$$original" | $(SED) -e 's:Windows/::'); \
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

mount:
	@if [ "$$(stat -c%m $(MOUNTPOINT))" != $(MOUNTPOINT) ]; then \
	    sshfs -o workaround=rename admin@otsv.at@www02.easyserver.at:/ $(MOUNTPOINT); \
	fi

upload: download
	@test -e "$(MOUNTPOINT)/$(HOST)" || $(MAKE) mount
	$(MAKE) do-upload CMD='mkdir -p $$$$dir && cp -v "$$$$file" "$$$$target" && chmod g-w "$$$$target"'

upload-diff: download
	@test -e "$(MOUNTPOINT)/$(HOST)" || $(MAKE) mount
	$(MAKE) do-upload CMD='diff -Nup "$$$$target" "$$$$file" || true'

do-upload:
	@set -e; \
	for file in $(GENERATED_WEB_FILES); do \
	    $(generate_web_file) < $$file.in > $$file.tmp; \
	done; \
	for file in $(COMMON_FILES) $(WEB_FILES); do \
	    target=$(MOUNTPOINT)/$(HOST)/$$file; \
	    dir=$$(dirname $$target); \
	    case " $(GENERATED_WEB_FILES) " in *" $$file "*) file=$$file.tmp ;; esac; \
	    if ! test -f "$$target" || \
	       ! cmp -s "$$file" "$$target"; then \
		$(CMD); \
	    fi; \
	done; \
	for file in $(GENERATED_WEB_FILES); do \
	    rm -f $file.tmp; \
	done;

clean:
	rm -f $(DOWNLOAD_FILES)
