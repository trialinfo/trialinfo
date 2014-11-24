'use strict;'

function sektionenController($scope, $http, $timeout, veranstaltung) {
  $scope.$root.kontext(veranstaltung.wertungen[0].titel);

  $scope.startende_klassen = function() {
    var startende_klassen = {};
    for (var klasse = 1; klasse <= veranstaltung.klassen.length; klasse++) {
      var wertungsklasse = veranstaltung.klassen[klasse - 1].wertungsklasse;
      if (veranstaltung.sektionen[wertungsklasse - 1])
	startende_klassen[wertungsklasse] = true;
    }
    return Object.keys(startende_klassen).sort(function(a, b) { return a - b; });
  }();
  veranstaltung_zuweisen(veranstaltung);

  $scope.runden = function(klasse) {
    var runden = [];
    for (var runde = 1; runde <= veranstaltung.klassen[klasse - 1].runden; runde++)
      runden.push(runde);
    return runden;
  };

  function veranstaltung_zuweisen(_veranstaltung) {
    if (_veranstaltung === undefined)
      $scope.sektion_aus_wertung = angular.copy($scope.sektion_aus_wertung_alt);
    else {
      veranstaltung = _veranstaltung;
      $scope.veranstaltung = veranstaltung;
      $scope.veranstaltung_alt = angular.copy(veranstaltung);
      $scope.sektion_aus_wertung = sektion_aus_wertung(veranstaltung);
      $scope.sektion_aus_wertung_alt = angular.copy($scope.sektion_aus_wertung);
    }
  }

  function sektion_aus_wertung(veranstaltung) {
    var sektionen_aus_wertung = veranstaltung.sektionen_aus_wertung;
    var s = [];
    angular.forEach($scope.startende_klassen, function(klasse) {
      s[klasse - 1] = [];
      for (var runde = 1; runde <= veranstaltung.klassen[klasse - 1].runden; runde++) {
	s[klasse - 1][runde - 1] = [];
	angular.forEach(veranstaltung.sektionen[klasse - 1], function(sektion) {
	  s[klasse - 1][runde - 1][sektion - 1] = false;
	});
      }
    });

    angular.forEach(veranstaltung.sektionen_aus_wertung, function(sektionen, index) {
      var klasse = index + 1;
      if (sektionen && s[klasse - 1])
	angular.forEach(sektionen, function(sektionen, index) {
	  var runde = index + 1;
	  if (sektionen && s[klasse - 1][runde - 1])
	    angular.forEach(sektionen, function(sektion) {
	      s[klasse - 1][runde - 1][sektion - 1] = true;
	    });
	});
    });
    return s;
  }

  function sektionen_aus_wertung(sektion_aus_wertung) {
    var k = [];
    angular.forEach(sektion_aus_wertung, function(sektionen, index) {
      var klasse = index + 1;
      if (sektionen) {
	var r = [];
	angular.forEach(sektionen, function(sektionen, index) {
	  var runde = index + 1;
	  if (sektionen) {
	    var s = [];
	    angular.forEach(sektionen, function(sektion, index) {
	      if (sektion)
		s.push(index + 1);
	    });
	    if (s.length)
	      r[runde - 1] = s;
	  }
	});
	if (r.length)
	  k[klasse - 1] = r;
      }
    });
    return k;
  }

  $scope.geaendert = function() {
    return !(angular.equals($scope.sektion_aus_wertung, $scope.sektion_aus_wertung_alt) &&
	     angular.equals($scope.veranstaltung, $scope.veranstaltung_alt));
  };

  $scope.speichern = function() {
    if ($scope.busy)
      return;
    /* FIXME: Wenn Klasse schon Starter hat, muss sie weiterhin starten. (Verweis auf Starterliste.) */
    veranstaltung.sektionen_aus_wertung = sektionen_aus_wertung($scope.sektion_aus_wertung);

    /* Wenn die Daten aus dem Trialtool importiert wurden, ist das Feature
       sektionen_aus_wertung nicht gesetzt.  Sobald eine Sektion aus der
       Wertung genommen wird, solle s aber auf jeden Fall gesetzt werden! */
    var features = features_aus_liste(veranstaltung);
    features.sektionen_aus_wertung = true;
    veranstaltung.features = features_zu_liste(features);
    $scope.busy = true;
    veranstaltung_speichern($http, veranstaltung.id, veranstaltung).
      success(function(veranstaltung) {
	veranstaltung_zuweisen(veranstaltung);
      }).
      error(netzwerkfehler).
      finally(function() {
	delete $scope.busy;
      });
  };

  $scope.verwerfen = function() {
    if ($scope.busy)
      return;
    /* FIXME: Wenn Fahrer geladen, neu laden um Versionskonflikte aufzulösen. */
    veranstaltung_zuweisen(undefined);
  };

  $scope.keydown = function(event) {
    if (event.which == 13) {
      $timeout(function() {
	if ($scope.geaendert() && $scope.form.$valid)
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
}

sektionenController.resolve = {
  veranstaltung: function($q, $http, $route) {
    return http_request($q, $http.get('/api/veranstaltung',
				      {params: $route.current.params}));
  },
};
