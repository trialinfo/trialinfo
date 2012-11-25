NAME = trial-toolkit
VERSION = 0.14

MOUNTPOINT = /mnt/easyserver
SUBDIR = www2.otsv.at

COMMON_FILES = \
	trial-toolkit/Datenbank.pm \
	trial-toolkit/RenderOutput.pm \
	trial-toolkit/Wertungen.pm \

LOCAL_FILES = \
	db-sync.pl \
	db-export.pl \
	doc/eer-diagramm.mwb \
	doc/eer-diagramm.pdf \
	README \
	ergebnisse.css \
	IO/Tee.pm \
	jahreswertung.pl \
	Makefile \
	otsv-check.pl \
	trial-toolkit/Parse/Binary/FixedFormat.pm \
	tageswertung.pl \
	trial-toolkit/Trialtool.pm \

WEB_FILES = \
	cgi-bin/ergebnisse/index-ssi.pl \
	cgi-bin/ergebnisse/jahreswertung-ssi.pl \
	cgi-bin/ergebnisse/statistik-ssi.pl \
	cgi-bin/ergebnisse/tageswertung-ssi.pl \
	cgi-bin/ergebnisse/wertungsreihe-ssi.pl \
	cgi-bin/veranstalter/fahrerliste.pl \
	cgi-bin/veranstalter/.htaccess \
	cgi-bin/veranstalter/starterzahl-ssi.pl \
	htdocs/ergebnisse.css \
	htdocs/ergebnisse/.htaccess \
	htdocs/ergebnisse/index.shtml \
	htdocs/ergebnisse/jahreswertung.shtml \
	htdocs/ergebnisse/statistik.shtml \
	htdocs/ergebnisse/tageswertung.js \
	htdocs/ergebnisse/tageswertung.shtml \
	htdocs/ergebnisse/wertungsreihe.shtml \
	htdocs/favicon.ico \
	htdocs/.htaccess \
	htdocs/js/jquery-1.7.2.js \
	htdocs/js/jquery-1.7.2.min.js \
	htdocs/js/jquery.polartimer.js \
	htdocs/js/raphael.js \
	htdocs/js/raphael-min.js \
	htdocs/veranstalter/.htaccess \
	htdocs/veranstalter/index.shtml \
	htdocs/veranstalter/starterzahl.shtml \
	trial-toolkit/TrialToolkit.pm.txt \

all:

dist:
	@set -e; \
	rm -rf $(NAME)-$(VERSION); \
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
	$(MAKE) do-upload CMD='cp -v "$$$$file" "$$(MOUNTPOINT)/$$(SUBDIR)/$$$$file"'

upload-diff:
	$(MAKE) do-upload CMD='diff -Nu "$$(MOUNTPOINT)/$$(SUBDIR)/$$$$file" "$$$$file" || true'

do-upload:
	@set -e; \
	for file in $(COMMON_FILES) $(WEB_FILES); do \
	    test -f $$file; \
	    if ! test -f "$(MOUNTPOINT)/$(SUBDIR)/$$file" || \
	       ! cmp -s "$$file" "$(MOUNTPOINT)/$(SUBDIR)/$$file"; then \
		$(CMD); \
	    fi; \
	done

mount:
	sshfs -o workaround=rename admin@otsv.at@www02.easyserver.at:/ $(MOUNTPOINT)
