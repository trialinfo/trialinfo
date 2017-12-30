export PACKAGE = trialinfo

MAKEFLAGS = --no-print-directory

CURL = curl
SED = sed
MARKOC = node_modules/marko/bin/markoc

DOWNLOAD_FILES = \
	htdocs/js/angular.js \
	htdocs/js/angular.min.js \
	htdocs/js/angular.min.js.map \
	htdocs/js/angular-route.js \
	htdocs/js/angular-cookies.js \
	htdocs/js/angular-locale_de-at.js \
	htdocs/js/json-diff.js

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

mailer:
	cd backend && npm run mailer

.PHONY: require-tag
require-tag:
	@tag="$(TAG)"; \
	if [ -z "$$tag" ]; then \
	    echo "Please create a $(PACKAGE)-X.Y tag" >&2; \
	    exit 2; \
	fi; \
	if ! echo "$$tag" | grep -q -e '^$(PACKAGE)-[0-9]\+\.[0-9]\+$$'; then \
	    echo "Tag '$$tag' does not have the form $(PACKAGE)-X.Y" >&2; \
	    exit 2; \
	fi

tarball: require-tag
	@./tarball.sh $(TAG)

release: require-tag tarball
	@./release.sh $(TAG)

upload:
	@./upload.sh

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

htdocs/js/json-diff.js:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --fail --silent --location \
		https://github.com/trialinfo/json-diff/raw/master/json-diff.js

clean:
	rm -f $(MARKO_FILES:%=%.js)

distclean: clean
	rm -f $(DOWNLOAD_FILES)
	rm -rf backend/node_modules
