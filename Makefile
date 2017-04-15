export PACKAGE = trialinfo

MAKEFLAGS = --no-print-directory

CURL = curl
SED = sed
MARKOC = node_modules/marko/bin/markoc

DOWNLOAD_FILES = \
	htdocs/js/angular.js \
	htdocs/js/angular.min.js \
	htdocs/js/angular-route.js \
	htdocs/js/angular-cookies.js \
	htdocs/js/angular-locale_de-at.js \
	htdocs/js/json-diff.js \
	htdocs/js/validate.js \

MARKO_FILES = \
	$(wildcard backend/views/*.marko) \
	$(wildcard backend/emails/*.marko)

TAG = $(shell git describe --tags --candidates=0 ${1:-HEAD} 2>/dev/null)

all: $(MARKO_FILES:%=%.js)

download: $(DOWNLOAD_FILES)

install: download
	cd backend && npm install

%.marko.js: backend/$(MARKOC)
%.marko.js: %.marko
	( cd backend && $(MARKOC) ../$< )

backend/$(MARKOC): install

start: $(MARKO_FILES:%=%.js)
	cd backend && npm start

build: $(MARKO_FILES:%=%.js)
	cd backend && npm run build

serve: build
	cd backend && npm run serve

profile: build
	cd backend && npm run profile

.PHONY: require-tag
require-tag:
	@tag="$(TAG)"; \
	if [ -z "$$tag" ]; then \
	    echo "Please create a vN.N tag" >&2; \
	    exit 2; \
	fi; \
	if ! echo "$$tag" | grep -q -e '^v[0-9]\+\.[0-9]\+$$'; then \
	    echo "Tag '$$tag' does not have the form vN.N" >&2; \
	    exit 2; \
	fi

tarball: require-tag
	@./tarball.sh $(TAG)

release: require-tag tarball
	@./release.sh $(TAG)

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
