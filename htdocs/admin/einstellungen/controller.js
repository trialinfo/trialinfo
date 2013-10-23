'use strict;'

function einstellungenController($scope, $http, $timeout, $location, veranstaltung, veranstaltungen) {
  veranstaltung_zuweisen(veranstaltung);

  function wertungspunkte_expandieren(wertungspunkte) {
    var l = wertungspunkte.length;
    if (l == 0) {
      wertungspunkte.push(0);
      l++;
    }
    while (l < 20) {
      wertungspunkte.push(wertungspunkte[l - 1]);
      l++;
    }
  }

  function wertungspunkte_kolabieren(wertungspunkte) {
    var l = wertungspunkte.length;
    while (l > 1 && wertungspunkte[l - 1] === wertungspunkte[l - 2]) {
      wertungspunkte.pop();
      l--;
    }
  }

  function sektionen_nach_bool(sektionen) {
    var sektionen_bool = [];
    angular.forEach(sektionen, function(klasse_sektionen) {
      var klasse_sektionen_bool = [];
      if (klasse_sektionen) {
	angular.forEach(klasse_sektionen, function(sektion) {
	  klasse_sektionen_bool[sektion - 1] = true;
	});
      }
      sektionen_bool.push(klasse_sektionen_bool);
    });

    // Alle Werte auffüllen, sonst funktioniert der spätere Vergleich zwischen
    // veranstaltung_alt und veranstaltung nicht immer.
    var klassen = $scope.veranstaltung.klassen.length;
    var sektionen = 15;
    for (var klasse = 1; klasse <= klassen; klasse++)
      for (var sektion = 1; sektion <= sektionen; sektion++) {
	if (!sektionen_bool[klasse - 1])
	  sektionen_bool[klasse - 1] = [];
	if (sektionen_bool[klasse - 1][sektion - 1] !== true)
	  sektionen_bool[klasse - 1][sektion - 1] = false;
      }
    return sektionen_bool;
  }

  function sektionen_von_bool(sektionen_bool) {
    var sektionen = [];
    angular.forEach(sektionen_bool, function(klasse_sektionen_bool) {
      var klasse_sektionen = [];
      for (var sektion = 1; sektion <= klasse_sektionen_bool.length; sektion++) {
	if (klasse_sektionen_bool[sektion - 1])
	  klasse_sektionen.push(sektion);
      }
      sektionen.push(klasse_sektionen);
    });
    return sektionen;
  }
  $scope.sektionen_von_bool = sektionen_von_bool;

  $scope.befahrene_sektionen = function() {
    var max_sektion = 15;
    /*
    max_sektion = 0;
    if ('veranstaltung' in $scope) {
      angular.forEach($scope.veranstaltung.sektionen, function(sektionen) {
	if (sektionen) {
	  var sektion = sektionen.length;
	  while (sektion > 0 && !sektionen[sektion - 1])
	    sektion--;
	  if (max_sektion < sektion)
	    max_sektion = sektion;
	}
      });
    }
    */
    var befahrene_sektionen = [];
    for (var sektion = 1; sektion <= max_sektion; sektion++)
      befahrene_sektionen.push(sektion);
    return befahrene_sektionen;
  }

  // null vs. "" oder 0

  $scope.geaendert = function() {
    try {
      angular.forEach($scope.features, function(value, key) {
	if (!value)
	  delete $scope.features[key];
      });
      return !(angular.equals($scope.veranstaltung_alt, $scope.veranstaltung) &&
	       angular.equals($scope.sektionen_alt, $scope.sektionen) &&
	       angular.equals($scope.features_alt, $scope.features));
    } catch (_) {
      return false;
    }
  }

  function veranstaltung_zuweisen(veranstaltung, als_aenderung) {
    if (veranstaltung === undefined)
      veranstaltung = $scope.veranstaltung_alt;
    if (veranstaltung === null) {
      veranstaltung = {
	version: 0,
	aktiv: true,
	klassen: [],
	kartenfarben: [],
	sektionen: [],
	features: ['startnummer', 'klasse', 'nachname', 'vorname', 'papierabnahme'],
	wertungen: [],
	wertungspunkte: [],
	wertungsmodus: 0,
	versicherung: 0,
	reset: 'nennbeginn'
      };
      for (var n = 0; n < 15; n++) {
	veranstaltung.klassen.push({});
	veranstaltung.sektionen.push([]);
      }
      for (var n = 0; n < 4; n++)
	veranstaltung.wertungen.push({});
      veranstaltung.wertungen[0].titel = 'Neue Veranstaltung';
    }
    if (veranstaltung.datum === undefined)
      veranstaltung.datum = $scope.$eval('heute | date:"d.M.yyyy"', {heute: Date.now()});
    wertungspunkte_expandieren(veranstaltung.wertungspunkte);
    $scope.veranstaltung = veranstaltung;
    $scope.sektionen = sektionen_nach_bool(veranstaltung.sektionen);
    $scope.features = features_aus_liste(veranstaltung);
    if (!als_aenderung) {
      $scope.veranstaltung_alt = angular.copy(veranstaltung);
      $scope.sektionen_alt = angular.copy($scope.sektionen);
      $scope.features_alt = angular.copy($scope.features);
    }
  }

  $scope.speichern = function() {
    /* FIXME: Wenn Klasse schon Starter hat, muss sie weiterhin starten. (Verweis auf Starterliste.) */
    var veranstaltung = angular.copy($scope.veranstaltung);
    veranstaltung.sektionen = sektionen_von_bool($scope.sektionen);
    veranstaltung.features = features_zu_liste($scope.features);
    wertungspunkte_kolabieren(veranstaltung.wertungspunkte);
    veranstaltung_speichern($http, veranstaltung.id, veranstaltung).
      success(function(veranstaltung) {
	veranstaltung_zuweisen(veranstaltung);
	var path = '/veranstaltung/' + veranstaltung.id + '/einstellungen';
	if (path != $location.path()) {
	  $location.path(path).replace();
	  /* FIXME: Wie Reload verhindern? */
	}
      }).
      error(netzwerkfehler);
  };

  $scope.verwerfen = function() {
    veranstaltung_zuweisen(undefined);
  }

  $scope.keydown = function(event) {
    if (event.which == 13) {
      $timeout(function() {
	if ($scope.geaendert())
	  $scope.speichern();
      });
    } else if (event.which == 27) {
      $timeout(function() {
	if ($scope.geaendert())
	  $scope.verwerfen();
      });
    }
  };

  beim_verlassen_warnen($scope, $scope.geaendert);

  if (veranstaltungen) {
    veranstaltungen.reverse();
    $scope.veranstaltungen = veranstaltungen;

    function eindeutiger_titel(titel, veranstaltungen) {
      var vergeben = {};
      var n = 1;
      angular.forEach(veranstaltungen, function(veranstaltung) {
	vergeben[veranstaltung.titel] = true;
      });
      while (titel in vergeben) {
	titel = titel.replace(/ \(Kopie( \d+)?\)$/, '');
	titel += ' (Kopie' + (n == 1 ? '' : ' ' + n) + ')';
	n++;
      }
      return titel;
    }

    $scope.veranstaltung.basis = null;
    $scope.$watch('veranstaltung.basis', function() {
      var basis = $scope.veranstaltung.basis;
      if (basis !== null && basis !== undefined) {
	$http.get('/api/veranstaltung', {'params': {'id': basis}}).
	  success(function(veranstaltung) {
	    veranstaltung.basis = veranstaltung.id;
	    delete veranstaltung.id;
	    veranstaltung.wertungen[0].titel =
	      eindeutiger_titel(veranstaltung.wertungen[0].titel,
				$scope.veranstaltungen);
	    delete veranstaltung.datum;
	    veranstaltung.reset = 'nennbeginn';
	    veranstaltung_zuweisen(veranstaltung, true);
	  }).
	  error(netzwerkfehler);
      } else
	veranstaltung_zuweisen(null);
    });
  }

  $scope.sichtbar = function(veranstaltung) {
    return !veranstaltung.verborgen;
  };
}

einstellungenController.resolve = {
  veranstaltung: function($q, $http, $route) {
    if ($route.current.params.id !== undefined)
      return http_request($q, $http.get('/api/veranstaltung',
					{params: $route.current.params}));
    else
      return null;
  },
  veranstaltungen: function($q, $http, $route) {
    if ($route.current.params.id === undefined)
      return http_request($q, $http.get('/api/veranstaltungen'));
  }
};
