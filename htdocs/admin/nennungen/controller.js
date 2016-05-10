'use strict;'

var nennungenController = [
  '$scope', '$sce', '$http', '$timeout', '$q', '$route', '$location',
  'veranstaltung', 'vorschlaege', 'gruppen', 'fahrer_hash', 'gruppen_hash',
  function ($scope, $sce, $http, $timeout, $q, $route, $location,
	    veranstaltung, vorschlaege, gruppen, fahrer_hash, gruppen_hash) {
    $scope.$root.kontext(veranstaltung.wertungen[0].titel);

    /* Im Fahrer-Nennformular Gruppenwertungen herausfiltern und im
       Gruppen-Nennformular Fahrerwertungen herausfiltern.  Eine Wertung ist eine
       Fahrerwertung, wenn startende Fahrer in der Wertung sind, und eine
       Gruppenwertung, wenn startende Gruppen in der Wertung sind; wenn in einer
       Wertung niemand startet, ist auch die Art der Wertung nicht definiert. */

    angular.forEach(veranstaltung.wertungen, function(wertung, index) {
      if ((gruppen ? wertung.fahrer : wertung.gruppen) && wertung.fahrer != wertung.gruppen) {
	veranstaltung.features = veranstaltung.features.filter(
	  function(feature) {
	    return feature != 'wertung' + (index + 1);
	  });
      }
    });

    $scope.veranstaltung = veranstaltung;

    var features = features_aus_liste(veranstaltung);
    if (gruppen) {
      /* Folgende Features deaktivieren wir für Gruppen: */
      angular.forEach(['startnummer', 'vorname', 'geburtsdatum', 'strasse',
		       'plz', 'wohnort', 'telefon', 'lizenznummer', 'fahrzeug',
		       'hubraum', 'email', 'kennzeichen', 'rahmennummer'], function(feature) {
	delete features[feature];
      });
    }
    $scope.features = features;

    $scope.definierte_klassen = [];
    angular.forEach(veranstaltung.klassen, function(klasse, index) {
      if (klasse && klasse.runden && veranstaltung.sektionen[index]) {
	$scope.definierte_klassen.push(
	  angular.extend({'klasse': index + 1}, klasse));
      }
    });
    $scope.startende_klassen = startende_klassen(veranstaltung);
    wertungslabels_erzeugen();

    $scope.vorschlaege = vorschlaege;
    $scope.gruppen = gruppen;
    $scope.enabled = {neu: true};

    $scope.intern = {};
    $scope.suche = {};
    $scope.mitglied_suche = {};

    function startnummer_sichtbar(fahrer) {
      var startnummer = fahrer ? fahrer.startnummer : null;
      return startnummer == null || startnummer < 0 ? null : startnummer;
    }

    function fahrer_fokusieren() {
      var fahrer = $scope.fahrer;
      if (fahrer) {
	var enabled = $scope.enabled;
	if (enabled.fahrer && gruppen)
	  set_focus('#mitglied_suchbegriff', $timeout);
	else if (enabled.fahrer && features.klasse && fahrer.klasse === null)
	  set_focus('#klasse', $timeout);
	else if (features.startnummer && enabled.startnummer &&
		 startnummer_sichtbar(fahrer) == null)
	  set_focus('#startnummer', $timeout);
	else if (enabled.fahrer) {
	  var felder = ['vorname', 'nachname', 'geburtsdatum'];
	  for (var n = 0; n < felder.length; n++) {
	    var feld = felder[n];
	    if ($scope.features[feld] &&
		(fahrer[feld] === null || fahrer[feld] === '')) {
	      set_focus('#' + feld, $timeout);
	      break;
	    }
	  }
	}
      }
      $scope.fehler = undefined;
    }

    function url_aktualisieren() {
      var startnummer = $scope.fahrer ? $scope.fahrer.startnummer : null;
      if ($location.search().startnummer != startnummer) {
	var search = {};
	if (startnummer != null)
	  search.startnummer = startnummer;
	$location.search(search).replace();
      }
    }

    function fahrer_zuweisen(fahrer) {
      if ($scope.form)
	$scope.form.$setPristine();
      if (fahrer) {
	wertungen_auffuellen(fahrer);
	if (fahrer.fahrer)
	  fahrer.fahrer = fahrerliste_normalisieren(fahrer.fahrer);
      }
      $scope.fahrer = fahrer;
      $scope.intern.startnummer = startnummer_sichtbar(fahrer);
      $scope.fahrer_alt = angular.copy(fahrer);
      $scope.suche.begriff = '';
      $scope.mitglied_suche.begriff = '';
      $scope.mitglied_liste = [];

      $scope.fahrer_ist_neu = false;
      angular.extend($scope.enabled, {
	'startnummer': fahrer && startnummer_sichtbar(fahrer) == null,
	'fahrer': fahrer && true,
	'loeschen': fahrer && fahrer.startnummer != null,
	neu: true,
	verwerfen: false,
      });

      url_aktualisieren();
    }

    $scope.fahrer_laden = function(startnummer, richtung) {
      fahrer_laden($http, veranstaltung.id, startnummer, richtung, null, gruppen).
	success(function(fahrer) {
	  if (Object.keys(fahrer).length) {
	    fahrer_zuweisen(fahrer);
	    fahrer_fokusieren();
	    delete $scope.fahrerliste;
	  }
	}).
	error(netzwerkfehler);
    };

    $scope.fahrer_suchen = function() {
      if ($scope.suche.begriff !== '') {
	var params = {
	  id: veranstaltung.id,
	  suchbegriff: $scope.suche.begriff,
	  gruppe: gruppen ? 1 : 0
	};
	$http.get('/api/fahrer/suchen', {'params': params}).
	  success(function(fahrerliste) {
	    if (fahrerliste.length == 1)
	      $scope.fahrer_laden(fahrerliste[0].startnummer);
	    else
	      $scope.fahrerliste = fahrerliste;
	  }).
	  error(netzwerkfehler);
      } else {
	delete $scope.fahrerliste;
      }
    };

    $scope.geaendert = function() {
      return !(angular.equals($scope.fahrer_alt, $scope.fahrer) &&
	       startnummer_sichtbar($scope.fahrer_alt) == $scope.intern.startnummer);
    };

    $scope.$watch('fahrer.geburtsdatum', function(geburtsdatum) {
      var match;
      if (geburtsdatum == null ||
	  !(match = geburtsdatum.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
	delete $scope.alter;
	delete $scope.jahrgang_alter;
	return;
      }
      geburtsdatum = new Date(match[1], match[2] - 1, match[3]);
      var geburtsjahr = new Date(match[1], 0, 1);

      var jetzt;
      if (veranstaltung.datum &&
	  (match = veranstaltung.datum.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
	jetzt = new Date(match[1], match[2] - 1, match[3]);
      else
	jetzt = new Date();

      var alter = new Date();
      alter.setTime(jetzt - geburtsdatum);
      $scope.alter = alter.getFullYear() - 1970;

      var jahrgang_alter = new Date();
      jahrgang_alter.setTime(jetzt - geburtsjahr);
      $scope.jahrgang_alter = jahrgang_alter.getFullYear() - 1970 - 1;
    });

    $scope.jahrgang = function(alter) {
      return new Date().getFullYear() - alter - 1;
    }

    $scope.speichern = function() {
      if ($scope.busy)
	return;
      /* FIXME: Wenn Start, dann muss die Klasse starten. */
      var startnummer;
      var version;
      if ($scope.fahrer_alt) {
	startnummer = $scope.fahrer_alt.startnummer;
	version = $scope.fahrer_alt.version;
      }
      if (version === undefined)
	version = 0;
      var fahrer = $scope.fahrer;
      if (fahrer.start)
	fahrer.nennungseingang = true;

      if ($scope.intern.startnummer != startnummer_sichtbar(fahrer)) {
	fahrer = angular.copy(fahrer);
	fahrer.startnummer = $scope.intern.startnummer;
      }

      /* Nicht gültige Wertungen deaktivieren.  Das umfasst für Fahrer die
	 Gruppenwertungen, und für Gruppen die Fahrerwertungen. */
      if (fahrer.start) {
	angular.forEach(fahrer.wertungen, function(wertung, index) {
	  if (wertung && !features['wertung' + (index + 1)])
	    wertung.aktiv = false;
	});
      }

      $scope.busy = true;
      fahrer_speichern($http, veranstaltung.id, startnummer, version, fahrer).
	success(function(fahrer_neu) {
	  hashes_aktualisieren(fahrer, fahrer_neu);
	  fahrer_zuweisen(fahrer_neu);
	  set_focus('#suchbegriff', $timeout);
	}).
	error(function (data, status) {
	  if (status == 409 && 'error' in data && data.error.match('Duplicate'))
	    $scope.fehler = 'Startnummer ' + fahrer.startnummer + ' existiert bereits.';
	  else
	    netzwerkfehler(data, status);
	}).
	finally(function() {
	  delete $scope.busy;
	});
    };

    $scope.verwerfen = function() {
      if ($scope.busy)
	return;
      /* FIXME: Wenn Fahrer geladen, neu laden um Versionskonflikte aufzulösen. */
      fahrer_zuweisen($scope.fahrer_ist_neu ? undefined : $scope.fahrer_alt);
    }

    function wertungen_auffuellen(fahrer) {
      angular.forEach(features.wertungen, function(wertung) {
	if (!fahrer.wertungen[wertung - 1])
	  fahrer.wertungen[wertung - 1] = { aktiv: false };
      });
    }

    $scope.neuer_fahrer = function() {
      /* FIXME: Wenn Felder gesetzt werden, werden hier die entsprechenden
       * Properties gesetzt; wenn die Felder dann gelöscht werden, bleiben die
       * Properties gesetzt.  Dadurch hat sich das Modell dann für angular.equals()
       * geändert, obwohl alles gleich ist.  Wir könnten hier alle Properties
       * setzen, aber das dupliziert nur den HTML-Code und ist fehleranfällig. */
      var fahrer = {
	'gruppe': gruppen,
	'klasse': null,
	'startnummer': null,
	'wertungen': [ { aktiv: veranstaltung.wertung1_markiert } ],
	'versicherung': veranstaltung.versicherung
      };
      if (gruppen)
	fahrer.fahrer = [];
      fahrer_zuweisen(fahrer);
      $scope.fahrer_ist_neu = true;
      angular.extend($scope.enabled, {
	neu: false,
	verwerfen: true,
      });
      fahrer_fokusieren();
    };

    $scope.startnummer_aendern = function() {
      angular.extend($scope.enabled, {
	startnummer: true,
	verwerfen: true,
	loeschen: false,
	neu: false
      });
      set_focus('#startnummer', $timeout);
    };

    $scope.fahrer_name = function(fahrer) {
      return fahrer_name(fahrer, $scope);
    };
    $scope.fahrer_infos = fahrer_infos;

    var canceler;
    $scope.startnummer_gueltig = function(startnummer) {
      if (canceler)
	canceler.resolve();
      if (typeof startnummer == 'string') {
	/* ui-validate calls the validator function too early for numeric form
	 * fields which convert input fields to numbers or undefined; maybe this can be
	 * fixed there instead of here. */
	if (startnummer == '')
	  startnummer = null;
	else
	  startnummer = +startnummer;
      }
      if (startnummer == null ||
	  startnummer === $scope.fahrer_alt.startnummer) {
	$scope.startnummer_belegt = undefined;
	return true;
      }
      var params = {
	'id': veranstaltung.id,
	'startnummer': startnummer
      };
      canceler = $q.defer();
      checker = $q.defer();
      $http.get('/api/startnummer', {'params': params,
				     'timeout': canceler.promise}).
	success(function(data, status, headers, config) {
	  if (data.startnummer) {
	    $scope.startnummer_belegt = data;
	    if (!('id' in data) || data.id == veranstaltung.id)
	      checker.reject();
	    else
	      checker.resolve();
	  } else {
	    $scope.startnummer_belegt = undefined;
	    checker.resolve();
	  }
	}).
	error(function(data, status) {
	  if (data) {
	    $scope.startnummer_belegt = undefined;
	    netzwerkfehler(data, status);
	    checker.reject();
	  }
	});
      return checker.promise;
    };

    function naechste_startnummer() {
      if (canceler)
	canceler.resolve();
      canceler = $q.defer();
      var fahrer = $scope.fahrer;
      if (fahrer && fahrer.startnummer == null && fahrer.klasse != null) {
	var params = {
	  'id': veranstaltung.id,
	  'klasse': fahrer.klasse
	};
	$http.get('/api/startnummer', {'params': params,
				       'timeout': canceler.promise}).
	  success(function(data, status, headers, config) {
	    if (data.naechste_startnummer)
	      $scope.startnummer_belegt = data;
	    else
	      $scope.startnummer_belegt = undefined;
	  }).
	  error(function() {
	    $scope.startnummer_belegt = undefined;
	  });
      }
    }
    $scope.$watch('fahrer.klasse', naechste_startnummer);

    $scope.kann_starten = function() {
      var fahrer = $scope.fahrer;
      return !fahrer ||
	     fahrer.gruppe ||
	     (fahrer.klasse != null &&
	      veranstaltung.sektionen[veranstaltung.klassen[fahrer.klasse - 1].wertungsklasse - 1]);
    }

    $scope.osk_lizenz = function(fahrer) {
      return fahrer.lizenznummer.match(/^(IJM|JM|JMJ) ?[0-9]+$/);
    };

    $scope.fahrer_in_wertung1 = function(fahrer) {
      if (!fahrer.wertungen[0].aktiv || fahrer.ausser_konkurrenz)
	return false;
      if (fahrer.klasse != null) {
	var klasse = veranstaltung.klassen[fahrer.klasse - 1];
	return !(klasse.keine_wertung1 || klasse.ausser_konkurrenz);
      }
    };

    $scope.loeschen = function() {
      if (confirm((gruppen ? 'Gruppe' : 'Fahrer') + ' ' + fahrer_name($scope.fahrer, $scope) + ' wirklich löschen?')) {
	var fahrer_alt = $scope.fahrer_alt;
	var startnummer = fahrer_alt.startnummer;
	var version = fahrer_alt.version;
	fahrer_loeschen($http, veranstaltung.id, startnummer, version).
	  success(function() {
	    fahrer_zuweisen(undefined);
	    hashes_aktualisieren(fahrer_alt, null);
	    set_focus('#suchbegriff', $timeout);
	  }).
	  error(netzwerkfehler);
      }
    };

    $scope.mitglied_startet = function(startnummer) {
      var fahrer = fahrer_hash[startnummer];
      if (!fahrer)
	return true;
      var wertungsklasse = veranstaltung.klassen[fahrer.klasse - 1].wertungsklasse;
      return fahrer.start && veranstaltung.sektionen[wertungsklasse - 1];
    };

    $scope.mitglied_name = function(startnummer) {
      var name;
      var list = [];
      if (startnummer >= 0)
	list.push(startnummer);
      var fahrer = fahrer_hash[startnummer];
      if (fahrer) {
	name = join(' ', fahrer.nachname, fahrer.vorname);
	angular.forEach(fahrer.gruppen, function(startnummer) {
	  if (startnummer == $scope.fahrer.startnummer)
	    return;
	  var gruppe = gruppen_hash[startnummer];
	  if (!gruppe)
	    return;
	  var name = join(' ', gruppe.nachname, gruppe.vorname);
	  if (name != '')
	    list.push(name);
	});
      } else {
	name = 'Unbekannter Fahrer';
      }
      return name +
	     (list.length ? ' (' + list.join(', ') + ')' : '');
    };

    $scope.mitglied_liste = [];

    $scope.fahrer_entfernen = function(startnummer) {
      $scope.mitglied_suche.begriff = '';

      var fahrer = $scope.fahrer;
      $scope.fahrer.fahrer = fahrer.fahrer.filter(function(s) {
	return s != startnummer;
      });
      $scope.mitglied_liste.push(startnummer);
      $scope.mitglied_liste = fahrerliste_normalisieren($scope.mitglied_liste);
      set_focus('#mitglied_suchbegriff', $timeout);
    };

    $scope.fahrer_hinzufuegen = function(startnummer) {
      $scope.mitglied_suche.begriff = '';

      $scope.mitglied_liste = $scope.mitglied_liste.filter(function(s) {
	return s != startnummer;
      });

      var fahrer = $scope.fahrer;
      for (var n = 0; n < fahrer.fahrer.length; n++)
	if (fahrer.fahrer[n] == startnummer)
	  return;
      fahrer.fahrer.push(startnummer);
      fahrer.fahrer = fahrerliste_normalisieren(fahrer.fahrer);
      set_focus('#mitglied_suchbegriff', $timeout);
    };

    function hash_liste_normalisieren(hash, startnummern) {
      return startnummern.sort(function(a, b) {
	var fa = hash[a], fb = hash[b];
	if (!fa || !fb)
	  return !fa - !fb;
	return generic_compare(fa.nachname, fb.nachname) ||
	       generic_compare(fa.vorname, fb.vorname) ||
	       a - b;
      });
    }

    function fahrerliste_normalisieren(startnummern) {
      return hash_liste_normalisieren(fahrer_hash, startnummern);
    }

    function gruppenliste_normalisieren(startnummern) {
      return hash_liste_normalisieren(gruppen_hash, startnummern);
    }

    $scope.mitglied_suchen = function() {
      if ($scope.mitglied_suche.begriff !== '') {
	var params = {
	  id: veranstaltung.id,
	  suchbegriff: $scope.mitglied_suche.begriff,
	  gruppe: 0,
	  aktiv: 1,
	};
	$http.get('/api/fahrer/suchen', {'params': params}).
	  success(function(fahrerliste) {
	    var gefunden = fahrerliste_normalisieren(
	      fahrerliste.map(function(fahrer) {
		return fahrer.startnummer;
	      }).filter(function(startnummer) {
		return !$scope.fahrer.fahrer.some(function(s) {
		  return s == startnummer;
		});
	      }));
	    $scope.mitglied_liste = gefunden;
	    if (gefunden.length == 1)
	      $scope.fahrer_hinzufuegen(gefunden[0]);
	  }).
	  error(netzwerkfehler);
      } else {
	delete $scope.mitglied_fahrerliste;
      }
    }

    function hashes_aktualisieren(gruppe_alt, gruppe) {
      if (gruppe_alt && gruppe_alt.gruppe) {
	var hashed = gruppen_hash[gruppe_alt.startnummer];
	if (hashed) {
	  angular.forEach(gruppe_alt.fahrer || [], function(startnummer) {
	    var fahrer = fahrer_hash[startnummer];
	    fahrer.gruppen = fahrer.gruppen.filter(function(startnummer) {
	      return startnummer != gruppe_alt.startnummer;
	    });
	  });
	  delete gruppen_hash[gruppe_alt.startnummer];
	}
      }
      if (gruppe && gruppe.gruppe) {
	var hashed = {};
	angular.forEach(['vorname', 'nachname', 'klasse', 'geburtsdatum'], function(name) {
	  hashed[name] = gruppe[name];
	});
	gruppen_hash[gruppe.startnummer] = hashed;
	angular.forEach(gruppe.fahrer || [], function(startnummer) {
	  var fahrer = fahrer_hash[startnummer];
	  fahrer.gruppen.push(gruppe.startnummer);
	  fahrer.gruppen = gruppenliste_normalisieren(fahrer.gruppen);
	});
      }
    }

    $scope.wertungen_aktiv = function() {
      var fahrer = $scope.fahrer;
      var wertungen = fahrer ? fahrer.wertungen : [];
      for (var n = 0; n < wertungen.length; n++) {
	if (wertungen[n] && wertungen[n].aktiv)
	  return true;
      }
      return false;
    };

    $scope.ist_oesterreich = function(land) {
      try {
	land = land.toLocaleLowerCase();
      } catch (_) { }
      return ['a', 'at', 'aut', 'austria', 'ö', 'österreich']
	.find(function(_) { return land == _ });
    };

    function wertungslabels_erzeugen() {
      /* FIXME: Vergebene Accesskeys dynamisch ermitteln. */
      var accesskeys = 'aknvpmsuäl' + gruppen ? 'g' : 'f';
      $scope.wertungen = [];
      angular.forEach(features.wertungen, function(wertung) {
	var bezeichnung = veranstaltung.wertungen[wertung - 1].bezeichnung || '';
	var label = bezeichnung, accesskey;
	for (var n = 0; n < bezeichnung.length; n++) {
	  var key = bezeichnung[n].toLowerCase();
	  if (accesskeys.indexOf(key) == -1) {
	    accesskey = key;
	    label = bezeichnung.substr(0, n) +
		    '<span class="accesskey">' + bezeichnung[n] + '</span>' +
		    bezeichnung.substr(n + 1);
	    break;
	  }
	}
	label = $sce.trustAsHtml(label);
	$scope.wertungen[wertung - 1] = {label: label, accesskey: accesskey};
      });
    }

    /* FIXME: Wie kann dieser Code für alle Formulare verallgemeinert werden? */
    $scope.keydown = function(event) {
      if (event.which == 13) {
	$timeout(function() {
	  if ($scope.geaendert() && $scope.form.$valid)
	    $scope.speichern();
	});
      } else if (event.which == 27) {
	$timeout(function() {
	  if ($scope.geaendert() || $scope.enabled.verwerfen)
	    $scope.verwerfen();
	});
      }
    };

    beim_verlassen_warnen($scope, $scope.geaendert);

    $scope.$watch('fahrer.klasse', function(klasse) {
      var fahrer = $scope.fahrer;
      $scope.keine_wertung1 = fahrer && fahrer.klasse &&
	veranstaltung.klassen[fahrer.klasse - 1].keine_wertung1;
      $scope.ausser_konkurrenz = fahrer && fahrer.klasse &&
	veranstaltung.klassen[fahrer.klasse - 1].ausser_konkurrenz;
    });

    $scope.$on('$routeUpdate', function() {
      var startnummer = $scope.fahrer ? $scope.fahrer.startnummer : null;
      if ($location.search().startnummer != startnummer) {
	startnummer = $location.search().startnummer;
	if (startnummer != null)
	  $scope.fahrer_laden(startnummer);
	else
	  fahrer_zuweisen(undefined);
      }
    });
    $scope.$emit('$routeUpdate');
  }];

nennungenController.resolveFactory = function (gruppen) {
  return {
    veranstaltung: [
      '$q', '$http', '$route',
      function($q, $http, $route) {
	return http_request($q, $http.get('/api/veranstaltung',
					  {params: $route.current.params}));
      }],
    vorschlaege: [
      '$q', '$http', '$route',
      function($q, $http, $route) {
	return http_request($q, $http.get('/api/veranstaltung/vorschlaege',
					  {params: $route.current.params}));
      }],
    fahrer_hash: [
      '$q', '$http', '$route',
      function($q, $http, $route) {
	if (gruppen) {
	  var params = angular.extend({gruppen: 0}, $route.current.params);
	  return http_request($q, $http.get('/api/fahrer/hash',
					    {params: params}));
	}
      }],
    gruppen_hash: [
      '$q', '$http', '$route',
      function($q, $http, $route) {
	if (gruppen) {
	  var params = angular.extend({gruppen: 1}, $route.current.params);
	  return http_request($q, $http.get('/api/fahrer/hash',
					    {params: params}));
	}
      }],
    gruppen: [
      function() {
	return gruppen;
      }],
  };
};
