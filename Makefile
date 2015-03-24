NAME = trial-auswertung
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

HAVE_WEASYPRINT_testing = 1
HAVE_WEASYPRINT_staging = 0
HAVE_WEASYPRINT_production = 0

# Laut Dokumentation unterstützt Apache ab Version 2.3.13 eine neue Syntax für
# die Ausdrücke in SSI #if-Befehlen. Die neue Syntax ist ab Version 2.4 per
# Default aktiviert, wir verwenden aber noch die alte Syntax, die mit folgendem
# Kommando aktiviert werden muss:
#
#   SSILegacyExprParser on
#
# Der momentane Server unterstützt Option SSILegacyExprParser aber noch nicht
# und stolpert über diese Anweisung.
#
SSI_LEGACY_EXPR_PARSER_testing = 1
SSI_LEGACY_EXPR_PARSER_staging = 0
SSI_LEGACY_EXPR_PARSER_production = 0

# Ist auf andere Server synchronisieren erlaubt?
#
SYNC_SOURCE_testing = 1
SYNC_SOURCE_staging = 0
SYNC_SOURCE_production = 0

# Ist auf diesen Server snchronisieren erlaubt?
#
SYNC_TARGET_testing = 0
SYNC_TARGET_staging = 1
SYNC_TARGET_production = 1

DOWNLOAD_FILES = \
	htdocs/js/angular.js \
	htdocs/js/angular.min.js \
	htdocs/js/angular-route.js \
	htdocs/js/json-diff.js \
	htdocs/js/validate.js \

COMMON_FILES = \
	htdocs/ergebnisse.css \
	lib/Auswertung.pm.txt \
	lib/Berechnung.pm \
	lib/Class/Accessor/Lite.pm \
	lib/Datenbank.pm \
	lib/DatenbankAktualisieren.pm \
	lib/HTTPError.pm \
	lib/JSON/Patch.pm \
	lib/JSON/Patch/Context.pm \
	lib/JSON/Patch/Exception.pm \
	lib/JSON/Patch/Operator.pm \
	lib/JSON/Patch/Operator/Add.pm \
	lib/JSON/Patch/Operator/Copy.pm \
	lib/JSON/Patch/Operator/Move.pm \
	lib/JSON/Patch/Operator/Remove.pm \
	lib/JSON/Patch/Operator/Replace.pm \
	lib/JSON/Patch/Operator/Test.pm \
	lib/JSON/Pointer.pm \
	lib/JSON/Pointer/Context.pm \
	lib/JSON/Pointer/Exception.pm \
	lib/JSON/Pointer/Syntax.pm \
	lib/JSON_bool.pm \
	lib/Jahreswertung.pm \
	lib/Parse/Binary/FixedFormat.pm \
	lib/RenderOutput.pm \
	lib/Tag.pm \
	lib/Tageswertung.pm \
	lib/Timestamp.pm \
	lib/Trialtool.pm \
	lib/Wertungen.pm \

LOCAL_FILES = \
	db-sync.pl \
	db-export.pl \
	README \
	IO/Tee.pm \
	jahreswertung.pl \
	Makefile \
	tageswertung.pl \

GENERATED_WEB_FILES = \
	cgi-bin/api/.htaccess \
	cgi-bin/veranstalter/.htaccess \
	htdocs/admin/hilfe/.htaccess \
	htdocs/admin/.htaccess \
	htdocs/api/.htaccess \
	htdocs/ergebnisse/.htaccess \
	htdocs/.htaccess \
	htdocs/veranstalter/.htaccess \

ADMIN_FILES = \
	cgi-bin/api/api.pl \
	cgi-bin/api/.htaccess \
	cgi-bin/api/public-api.pl \
	htdocs/admin/api.js \
	htdocs/admin/directives.js \
	htdocs/admin/einstellungen/controller.js \
	htdocs/admin/einstellungen/index.html \
	htdocs/admin/hilfe/index.html \
	htdocs/admin/.htaccess \
	htdocs/admin/extern/controller.js \
	htdocs/admin/extern/index.html \
	htdocs/admin/index.shtml \
	htdocs/admin/main/controller.js \
	htdocs/admin/main/index.html \
	htdocs/admin/nennungen/controller.js \
	htdocs/admin/nennungen/index.html \
	htdocs/admin/punkte/controller.js \
	htdocs/admin/punkte/index.html \
	htdocs/admin/sektionen/controller.js \
	htdocs/admin/sektionen/index.html \
	htdocs/admin/sync/controller.js \
	htdocs/admin/vareihe/controller.js \
	htdocs/admin/vareihe/index.html \
	htdocs/admin/veranstaltung/auswertung/controller.js \
	htdocs/admin/veranstaltung/auswertung/index.html \
	htdocs/admin/veranstaltung/controller.js \
	htdocs/admin/veranstaltung/index.html \
	htdocs/admin/veranstaltung/liste/controller.js \
	htdocs/admin/veranstaltung/liste/index.html \
	htdocs/api/.htaccess \


WEB_FILES = \
	$(DOWNLOAD_FILES) \
	$(GENERATED_WEB_FILES) \
	$(ADMIN_FILES) \
	cgi-bin/ergebnisse/jahreswertung-ssi.pl \
	cgi-bin/ergebnisse/statistik-ssi.pl \
	cgi-bin/ergebnisse/tageswertung-ssi.pl \
	cgi-bin/ergebnisse/vareihe-bezeichnung.pl \
	cgi-bin/ergebnisse/vareihe-ssi.pl \
	cgi-bin/pdf.pl \
	cgi-bin/veranstalter/export-ssi.pl \
	cgi-bin/veranstalter/export.pl \
	cgi-bin/veranstalter/fahrerliste.pl \
	cgi-bin/veranstalter/runden-ssi.pl \
	cgi-bin/veranstalter/starterzahl-ssi.pl \
	htdocs/apple-touch-icon.png \
	htdocs/ergebnisse/0.png \
	htdocs/ergebnisse/1.png \
	htdocs/ergebnisse/2012.shtml \
	htdocs/ergebnisse/2013.shtml \
	htdocs/ergebnisse/2.png \
	htdocs/ergebnisse/3.png \
	htdocs/ergebnisse/4.png \
	htdocs/ergebnisse/5.png \
	htdocs/ergebnisse/index.shtml \
	htdocs/ergebnisse/jahreswertung.shtml \
	htdocs/ergebnisse/statistik.shtml \
	htdocs/ergebnisse/tageswertung.shtml \
	htdocs/ergebnisse/vareihe.shtml \
	htdocs/favicon.ico \
	htdocs/robots.txt \
	htdocs/veranstalter/export.shtml \
	htdocs/veranstalter/index.shtml \
	htdocs/veranstalter/runden.shtml \
	htdocs/veranstalter/starterzahl.shtml \

MAKEFLAGS = --no-print-directory

all: testing

download: $(DOWNLOAD_FILES)

testing: download
	@$(MAKE) -s $(GENERATED_WEB_FILES) WHAT=testing

ifeq ($(SSI_LEGACY_EXPR_PARSER_$(WHAT)),1)
SSI_LEGACY_EXPR_PARSER=-e 's:^@SSI_LEGACY_EXPR_PARSER@$$:SSILegacyExprParser on:'
else
SSI_LEGACY_EXPR_PARSER=-e '/^@SSI_LEGACY_EXPR_PARSER@$$/d'
endif

generate_web_file = \
	$(SED) -e 's:@AUTH_PREFIX@:$(AUTH_PREFIX):g' \
	       -e 's:@HOST@:$(HOST):g' \
	       -e 's:@HAVE_WEASYPRINT@:$(HAVE_WEASYPRINT_$(WHAT)):g' \
	       -e 's:@SYNC_SOURCE@:$(SYNC_SOURCE_$(WHAT)):g' \
	       -e 's:@SYNC_TARGET@:$(SYNC_TARGET_$(WHAT)):g' \
	       $(SSI_LEGACY_EXPR_PARSER)

.PHONY: $(GENERATED_WEB_FILES)
$(GENERATED_WEB_FILES): %: %.in
	@$(generate_web_file) < $< > $@.tmp
	@if ! test -f "$@" || \
	    ! cmp -s "$@" "$@.tmp"; then \
	  echo "$< -> $@"; \
	  mv $@.tmp $@; \
	else \
	  rm -f $@.tmp; \
	fi

# AngularJS
ANGULAR_BASE=https://ajax.googleapis.com/ajax/libs/angularjs
ANGULAR_VERSION=1.2.27
htdocs/js/angular%:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --fail --silent --location \
		$(ANGULAR_BASE)/$(ANGULAR_VERSION)/$(notdir $@)

# AngularUI Validate
htdocs/js/validate.js:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --fail --silent --location \
		https://github.com/angular-ui/ui-utils/raw/master/modules/validate/validate.js

update-perl-json-pointer:
	@set -xe; \
	tmpdir=$$(mktemp -td); \
	trap "rm -rf $$tmpdir" EXIT; \
	$(CURL) -o $$tmpdir/master.zip --fail --silent --location \
		https://github.com/zigorou/perl-json-pointer/archive/master.zip; \
	unzip -x -d $$tmpdir $$tmpdir/master.zip; \
	files=($$(find $$tmpdir/perl-json-pointer-master/lib -type f -printf '%P\n')); \
	( cd $$tmpdir/perl-json-pointer-master/lib; \
	  cp --parents "$${files[@]}" $(PWD)/lib ); \
	git add -v "$${files[@]/#/lib/}"

update-perl-json-patch:
	@set -xe; \
	tmpdir=$$(mktemp -td); \
	trap "rm -rf $$tmpdir" EXIT; \
	$(CURL) -o $$tmpdir/master.zip --fail --silent --location \
		https://github.com/zigorou/perl-json-patch/archive/master.zip; \
	unzip -x -d $$tmpdir $$tmpdir/master.zip; \
	files=($$(find $$tmpdir/perl-json-patch-master/lib -type f -printf '%P\n')); \
	( cd $$tmpdir/perl-json-patch-master/lib; \
	  cp --parents "$${files[@]}" $(PWD)/lib ); \
	git add -v "$${files[@]/#/lib/}"

htdocs/js/json-diff.js:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --fail --silent --location \
		https://github.com/andreas-gruenbacher/json-diff/raw/master/json-diff.js

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
	    #sshfs -o workaround=rename admin@otsv.at@www02.easyserver.at:/ $(MOUNTPOINT); \
	    curlftpfs -o tlsv1 www02.easyserver.at /mnt/easyserver/; \
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
	    rm -f $$file.tmp; \
	done;

clean:
	rm -f $(DOWNLOAD_FILES)
