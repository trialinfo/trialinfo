MAKEFLAGS = --no-print-directory

CURL = curl
SED = sed

-include CONFIG

HAVE_WEASYPRINT ?= true
SSI_LEGACY_EXPR_PARSER ?= true
SYNC_SOURCE ?= true
SYNC_TARGET ?= false

DOWNLOAD_FILES = \
	htdocs/js/angular.js \
	htdocs/js/angular.min.js \
	htdocs/js/angular-route.js \
	htdocs/js/angular-cookies.js \
	htdocs/js/angular-locale_de-at.js \
	htdocs/js/json-diff.js \
	htdocs/js/validate.js \

GENERATED_FILES = \
	htdocs/js/config.js \
	htdocs/ergebnisse/.htaccess \
	htdocs/veranstalter/.htaccess \

all: generate

download: $(DOWNLOAD_FILES)

generate: $(GENERATED_FILES)

update:
	@./make-trialinfo-update

install: download
	cd backend && npm install

start:
	cd backend && npm start

build:
	cd backend && npm run build

serve: build
	cd backend && npm run serve

profile: build
	cd backend && npm run profile

ifeq ($(SSI_LEGACY_EXPR_PARSER),true)
SSI_LEGACY_EXPR_PARSER=-e 's:^@SSI_LEGACY_EXPR_PARSER@$$:SSILegacyExprParser on:'
else
SSI_LEGACY_EXPR_PARSER=-e '/^@SSI_LEGACY_EXPR_PARSER@$$/d'
endif

generate_web_file = \
	$(SED) -e 's:@HAVE_WEASYPRINT@:$(HAVE_WEASYPRINT):g' \
	       -e 's:@SYNC_SOURCE@:$(SYNC_SOURCE):g' \
	       -e 's:@SYNC_TARGET@:$(SYNC_TARGET):g' \
	       $(SSI_LEGACY_EXPR_PARSER)

.PHONY: $(GENERATED_FILES)
$(GENERATED_FILES): %: %.in
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
ANGULAR_VERSION=1.2.32

htdocs/js/angular%:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --fail --silent --location \
		$(ANGULAR_BASE)/$(ANGULAR_VERSION)/$(notdir $@)

htdocs/js/angular-locale_de-at.js:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --fail --silent --location \
		https://github.com/angular/bower-angular-i18n/raw/v$(ANGULAR_VERSION)/angular-locale_de-at.js

# AngularUI Validate
htdocs/js/validate.js:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --fail --silent --location \
		https://github.com/angular-ui/ui-utils/raw/v2.0.0/modules/validate/validate.js

htdocs/js/json-diff.js:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --fail --silent --location \
		https://github.com/trialinfo/json-diff/raw/master/json-diff.js

update-perl-json-pointer:
	@set -xe; \
	tmpdir=$$(mktemp -td); \
	trap "rm -rf $$tmpdir" EXIT; \
	$(CURL) -o $$tmpdir/master.zip --fail --silent --location \
		https://github.com/zigorou/perl-json-pointer/archive/master.zip; \
	unzip -x -d $$tmpdir $$tmpdir/master.zip; \
	files=($$(find $$tmpdir/perl-json-pointer-master/lib -type f -printf '%P\n')); \
	( cd $$tmpdir/perl-json-pointer-master/lib; \
	  cp --parents "$${files[@]}" $(CURDIR)/lib ); \
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
	  cp --parents "$${files[@]}" $(CURDIR)/lib ); \
	git add -v "$${files[@]/#/lib/}"

clean:
	rm -f $(DOWNLOAD_FILES)
	rm -rf backend/node_modules
