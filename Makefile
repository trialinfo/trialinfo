export PACKAGE = trialinfo
export GPG_NAME = 3BB03F34

MAKEFLAGS = --no-print-directory

CURL = curl
SED = sed
MARKOC = backend/node_modules/marko/bin/markoc

# AngularJS
ANGULAR_BASE=https://code.angularjs.org
ANGULAR_VERSION=1.7.9
MOMENT_VERSION=2.26.0

DOWNLOAD_FILES = \
	htdocs/js/angular-$(ANGULAR_VERSION)/angular.js \
	htdocs/js/angular-$(ANGULAR_VERSION)/angular.min.js \
	htdocs/js/angular-$(ANGULAR_VERSION)/angular.min.js.map \
	htdocs/js/angular-$(ANGULAR_VERSION)/angular-route.js \
	htdocs/js/angular-$(ANGULAR_VERSION)/angular-cookies.js \
	htdocs/js/angular-$(ANGULAR_VERSION)/angular-locale_de-at.js \
	htdocs/js/moment.js \
	htdocs/js/moment.min.js \
	htdocs/js/json-diff.js \
	htdocs/js/qrcode.js

MARKO_FILES = \
	$(wildcard backend/views/*.marko) \
	$(wildcard backend/emails/*.marko)

TAG = $(shell git describe --tags --candidates=0 ${1:-HEAD} 2>/dev/null)

all: $(MARKO_FILES:%=%.js)

install: $(DOWNLOAD_FILES)
	cd backend && npm install

$(MARKO_FILES:%=%.js): $(MARKOC)

%.marko.js: %.marko
	cd backend && ../$(MARKOC) ../$<

.PHONY: backend/version.txt
backend/version.txt:
	@git describe --tag --match "trialinfo-*" | sed -e 's:^trialinfo-::' > $@.tmp
	@if cmp $@ $@.tmp 2>/dev/null; then rm $@.tmp; else echo $@; mv $@.tmp $@; fi

start: $(MARKO_FILES:%=%.js)
	cd backend && npm start

build: $(MARKO_FILES:%=%.js)
	cd backend && npm run build

serve: build
	cd backend && npm run serve

profile: build
	cd backend && npm run profile

# For use by rpm.sh:
snapshot:
	@tar -c $(DOWNLOAD_FILES) backend/node_modules backend/package-lock.json

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

release: require-tag
	@./release.sh $(TAG)

upload:
	@./upload.sh

repo/RPM-GPG-KEY-trialinfo:
	@gpg --export -a $(GPG_NAME) > "$@"

.PHONY: repo
repo: repo/RPM-GPG-KEY-trialinfo
	@rpmbuild -bb \
		-D "_sourcedir $(PWD)/repo" \
		-D "_rpmdir $(PWD)/rpm" \
		-D "_gpg_name $(GPG_NAME)" \
		repo/trialinfo-repo.spec
	@rpm --addsign \
		-D "__gpg /usr/bin/gpg" \
		-D "_gpg_name $(GPG_NAME)" \
		rpm/noarch/trialinfo-repo-*.rpm

htdocs/js/angular-$(ANGULAR_VERSION)/angular%:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --silent --location \
		$(ANGULAR_BASE)/$(ANGULAR_VERSION)/$(notdir $@)

htdocs/js/angular-$(ANGULAR_VERSION)/angular-locale_de-at.js:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --silent --location \
		https://github.com/angular/bower-angular-i18n/raw/v$(ANGULAR_VERSION)/angular-locale_de-at.js

htdocs/js/moment.js:
	@mkdir -p $(dir $@)
	$(CURL) -o $@ --silent --location \
		https://github.com/moment/moment/raw/$(MOMENT_VERSION)/moment.js

htdocs/js/moment.min.js:
	@mkdir -p $(dir $@)
	$(CURL) -o $@ --silent --location \
		https://github.com/moment/moment/raw/$(MOMENT_VERSION)/min/moment.min.js

htdocs/js/json-diff.js:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --silent --location \
		https://github.com/trialinfo/json-diff/raw/master/json-diff.js

htdocs/js/qrcode.js:
	@mkdir -p  $(dir $@)
	$(CURL) -o $@ --silent --location \
		https://github.com/kazuhikoarase/qrcode-generator/raw/master/js/qrcode.js

clean:
	rm -f $(MARKO_FILES:%=%.js)

distclean: clean
	rm -f $(DOWNLOAD_FILES)
	rm -rf backend/node_modules
