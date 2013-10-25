'use strict;'

function nennungenController($scope, $http, $timeout, $q, veranstaltung, vorschlaege) {
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
  $scope.enabled = {suche: true, neu: true};

  function fahrer_fokusieren() {
    var fahrer = $scope.fahrer;
    if (fahrer) {
      var enabled = $scope.enabled;
      if (enabled.startnummer && fahrer.startnummer === null)
	set_focus('#startnummer', $timeout);
      else if (enabled.fahrer) {
	var felder = ['klasse', 'nachname', 'vorname', 'geburtsdatum'];
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

  function fahrer_zuweisen(fahrer, fahrer_ist_neu) {
    if (!fahrer)
      fahrer = $scope.fahrer_alt;
    var fahrer_aktiv = (fahrer && fahrer.startnummer) || fahrer_ist_neu;
    if (fahrer && fahrer.startnummer < 0) {
      fahrer.startnummer_intern = fahrer.startnummer;
      fahrer.startnummer = null;
    }
    wertungen_auffuellen(fahrer);
    $scope.fahrer = fahrer;
    $scope.fahrer_alt = angular.copy(fahrer);
    $scope.suchbegriff = '';

    var enabled = $scope.enabled;
    angular.extend(enabled, {
      'startnummer': fahrer_aktiv && fahrer.startnummer === null,
      'fahrer': fahrer_aktiv,
      'loeschen': fahrer_aktiv &&
		  (fahrer.startnummer !== null ||
		   fahrer.startnummer_intern !== undefined),
      suche: true,
      neu: !fahrer_ist_neu,
      verwerfen: fahrer_ist_neu
    });
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
  $scope.suchbegriff = '';
  $scope.$watch('suchbegriff', 'fahrer_suchen()');

  $scope.geaendert = function() {
    return !angular.equals($scope.fahrer_alt, $scope.fahrer);
  };

  $scope.speichern = function() {
    /* FIXME: Wenn Papierabnahme, dann muss die Klasse starten. */
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
    if (fahrer.startnummer == null) {
      fahrer.nennungseingang = false;
      fahrer.papierabnahme = false;
    }
    if (fahrer.startnummer_intern !== undefined) {
      fahrer = angular.copy(fahrer);
      if (fahrer.startnummer === null)
	fahrer.startnummer = fahrer.startnummer_intern;
      delete fahrer.startnummer_intern;
    }
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
      });
  };

  $scope.verwerfen = function() {
    /* FIXME: Wenn Fahrer geladen, neu laden um Versionskonflikte aufzulösen. */
    fahrer_zuweisen(undefined);
  }

  function wertungen_auffuellen(fahrer) {
    angular.forEach($scope.features.wertungen, function(wertung) {
      if (!fahrer.wertungen[wertung - 1])
	fahrer.wertungen[wertung - 1] = { aktiv: false };
    });
  }

  $scope.neuer_fahrer = function(aktiv) {
    /* FIXME: Wenn Felder gesetzt werden, werden hier die entsprechenden
     * Properties gesetzt; wenn die Felder dann gelöscht werden, bleiben die
     * Properties gesetzt.  Dadurch hat sich das Modell dann für angular.equals()
     * geändert, obwohl alles gleich ist.  Wir könnten hier alle Properties
     * setzen, aber das dupliziert nur den HTML-Code und ist fehleranfällig. */
    var fahrer = {
      'startnummer': null,
      'wertungen': [ { aktiv: veranstaltung.wertung1_markiert } ],
      'versicherung': veranstaltung.versicherung
    };
    fahrer_zuweisen(fahrer, aktiv);
    fahrer_fokusieren();
    // $scope.form.$setPristine();
    // $scope.navigation.$setPristine();
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
    if (startnummer === undefined || startnummer === null ||
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
	  checker.reject();
	} else {
	  $scope.startnummer_belegt = undefined;
	  checker.resolve();
	}
      }).
      error(function(data, status) {
	$scope.startnummer_belegt = undefined;
	netzwerkfehler(data, status);
	checker.reject();
      });
    /* FIXME: This doesn't work in angular 1.2 because Angular's
       scope.$eval explicitly checks for promises and tries to
       resolve them:
       https://github.com/angular/angular.js/issues/4158
    */
    return checker.promise;
  };

  $scope.klasse_gueltig = function(klasse) {
    if (klasse === undefined || klasse === null)
      return true;
    klasse = veranstaltung.klassen[klasse - 1];
    return klasse && klasse.bezeichnung != null && klasse.bezeichnung != '';
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
	  $scope.neuer_fahrer(false);
	  set_focus('#suchbegriff', $timeout);
	}).
	error(netzwerkfehler);
    }
  };

  function wertungslabels_erzeugen() {
    /* FIXME: Vergebene Accesskeys dynamisch ermitteln. */
    var accesskeys = 'knvgpsuäl';
    $scope.wertungen = [];
    angular.forEach($scope.features.wertungen, function(wertung) {
      var bezeichnung = veranstaltung.wertungen[wertung - 1].bezeichnung;
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
