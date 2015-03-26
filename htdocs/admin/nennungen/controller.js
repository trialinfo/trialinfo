'use strict;'

function nennungenController($scope, $sce, $http, $timeout, $q, $route, $location, veranstaltung, vorschlaege) {
  $scope.$root.kontext(veranstaltung.wertungen[0].titel);

  $scope.veranstaltung = veranstaltung;
  $scope.features = features_aus_liste(veranstaltung);
  $scope.definierte_klassen = [];
  angular.forEach(veranstaltung.klassen, function(klasse, index) {
    if (klasse && klasse.bezeichnung != null && klasse.bezeichnung != '') {
      $scope.definierte_klassen.push(
	angular.extend({'klasse': index + 1}, klasse));
    }
  });
  $scope.startende_klassen = startende_klassen(veranstaltung);
  wertungslabels_erzeugen();

  $scope.vorschlaege = vorschlaege;
  $scope.enabled = {neu: true};

  function fahrer_fokusieren() {
    var fahrer = $scope.fahrer;
    if (fahrer) {
      var enabled = $scope.enabled;
      if (enabled.fahrer && $scope.features.klasse && fahrer.klasse === null)
	set_focus('#klasse', $timeout);
      else if (enabled.startnummer && fahrer.startnummer === null)
	set_focus('#startnummer', $timeout);
      else if (enabled.fahrer) {
	var felder = ['nachname', 'vorname', 'geburtsdatum'];
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

  function startnummer_intern() {
    var fahrer = $scope.fahrer;
    if (fahrer) {
      var startnummer = fahrer.startnummer_intern;
      if (startnummer === undefined)
	  startnummer = fahrer.startnummer;
      return startnummer;
    }
  }

  function url_aktualisieren() {
    var startnummer = startnummer_intern();
    if ($location.search().startnummer !== startnummer) {
      var search = {};
      if (startnummer)
	search.startnummer = startnummer;
      $scope.ignoreRouteUpdate = true;
      $location.search(search).replace();
    }
  }

  function fahrer_zuweisen(fahrer) {
    if ($scope.form)
      $scope.form.$setPristine();
    if (fahrer) {
      if (fahrer.startnummer < 0) {
	fahrer.startnummer_intern = fahrer.startnummer;
	fahrer.startnummer = null;
      }
      wertungen_auffuellen(fahrer);
    }
    $scope.fahrer = fahrer;
    $scope.fahrer_alt = angular.copy(fahrer);
    $scope.suchbegriff = '';

    $scope.fahrer_ist_neu = false;
    angular.extend($scope.enabled, {
      'startnummer': fahrer && fahrer.startnummer === null,
      'fahrer': fahrer && true,
      'loeschen': fahrer &&
		  (fahrer.startnummer !== null ||
		   fahrer.startnummer_intern !== undefined),
      neu: true,
      verwerfen: false,
    });

    url_aktualisieren();
  }

  $scope.fahrer_laden = function(startnummer, richtung) {
    fahrer_laden($http, veranstaltung.id, startnummer, richtung).
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
    if ($scope.suchbegriff !== '') {
      fahrer_suchen($http, veranstaltung.id,  $scope.suchbegriff).
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
    return !angular.equals($scope.fahrer_alt, $scope.fahrer);
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
    $scope.alter = alter.getUTCFullYear() - 1970;

    var jahrgang_alter = new Date();
    jahrgang_alter.setTime(jetzt - geburtsjahr);
    $scope.jahrgang_alter = jahrgang_alter.getUTCFullYear() - 1970;
  });

  $scope.speichern = function() {
    if ($scope.busy)
      return;
    /* FIXME: Wenn Start, dann muss die Klasse starten. */
    var startnummer;
    var version;
    if ($scope.fahrer_alt) {
      startnummer = $scope.fahrer_alt.startnummer_intern;
      if (startnummer === undefined)
	startnummer = $scope.fahrer_alt.startnummer;
      version = $scope.fahrer_alt.version;
    }
    if (version === undefined)
      version = 0;
    var fahrer = $scope.fahrer;
    if (fahrer.start)
      fahrer.nennungseingang = true;
    if (fahrer.startnummer_intern !== undefined) {
      fahrer = angular.copy(fahrer);
      if (fahrer.startnummer === null)
	fahrer.startnummer = fahrer.startnummer_intern;
      delete fahrer.startnummer_intern;
    }
    $scope.busy = true;
    fahrer_speichern($http, veranstaltung.id, startnummer, version, fahrer).
      success(function(fahrer) {
	fahrer_zuweisen(fahrer);
	set_focus('#suchbegriff', $timeout);
      }).
      error(function (data, status) {
	if (status == 403)
	  $scope.fehler = 'Startnummer ' + $scope.fahrer.startnummer +
			  ' existiert bereits.';
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
    angular.forEach($scope.features.wertungen, function(wertung) {
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
      'klasse': null,
      'startnummer': null,
      'wertungen': [ { aktiv: veranstaltung.wertung1_markiert } ],
      'versicherung': veranstaltung.versicherung
    };
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

  $scope.fahrer_name = fahrer_name;
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
	startnummer = undefined;
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

  $scope.klasse_gueltig = function(klasse) {
    /* ui-validate calls the validator function too early for numeric form
     * fields which convert input fields to numbers or undefined; maybe this can be
     * fixed there instead of here. */
    if (klasse == '')
      klasse = undefined;
    else
      klasse = +klasse;
    if (klasse == null)
      return true;
    klasse = veranstaltung.klassen[klasse - 1];
    return klasse && klasse.bezeichnung != null && klasse.bezeichnung != '';
  };

  $scope.klasse_startet = function() {
    var fahrer = $scope.fahrer;
    if (fahrer)
      return fahrer.klasse != null &&
	veranstaltung.sektionen[veranstaltung.klassen[fahrer.klasse - 1].wertungsklasse - 1];
  };

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
    if (confirm('Fahrer ' + fahrer_name($scope.fahrer, $scope) + ' wirklich löschen?')) {
      var fahrer_alt = $scope.fahrer_alt;
      var startnummer = $scope.fahrer_alt.startnummer_intern;
      if (startnummer === undefined)
	startnummer = $scope.fahrer_alt.startnummer;
      var version = $scope.fahrer_alt.version;
      fahrer_loeschen($http, veranstaltung.id, startnummer, version).
	success(function(fahrer) {
	  fahrer_zuweisen(undefined);
	  set_focus('#suchbegriff', $timeout);
	}).
	error(netzwerkfehler);
    }
  };

  function wertungslabels_erzeugen() {
    /* FIXME: Vergebene Accesskeys dynamisch ermitteln. */
    var accesskeys = 'aknvpmsfuäl';
    $scope.wertungen = [];
    angular.forEach($scope.features.wertungen, function(wertung) {
      var bezeichnung = veranstaltung.wertungen[wertung - 1].bezeichnung || '';
      var label = bezeichnung, accesskey;
      for (var n = 0; n < bezeichnung.length; n++) {
	var key = bezeichnung[n].toLowerCase();
	if (accesskeys.indexOf(key) == -1) {
	  accesskey = key;
	  label = $sce.trustAsHtml(
	    bezeichnung.substr(0, n) +
	    '<span class="accesskey">' + bezeichnung[n] + '</span>' +
	    bezeichnung.substr(n + 1));
	  break;
	}
      }
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
    if ($scope.ignoreRouteUpdate) {
      delete $scope.ignoreRouteUpdate;
      return;
    }
    var intern = startnummer_intern();
    if (intern == null)
      intern = undefined;
    var startnummer = $location.search().startnummer;
    if (startnummer !== intern) {
      if (startnummer !== undefined)
	$scope.fahrer_laden(startnummer);
      else
	fahrer_zuweisen(undefined);
    }
  });
  $scope.$emit('$routeUpdate');
}

nennungenController.resolve = {
  veranstaltung: function($q, $http, $route) {
    return http_request($q, $http.get('/api/veranstaltung',
				      {params: $route.current.params}));
  },
  vorschlaege: function($q, $http, $route) {
    return http_request($q, $http.get('/api/veranstaltung/vorschlaege',
				      {params: $route.current.params}));
  }
};
