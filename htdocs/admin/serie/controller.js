'use strict;'

function serieController($scope, $http, $routeParams, $timeout, $location, $window) {
  function sort_uniq(array, cmp) {
    array = array.sort(cmp);
    for (var n = 0; n < array.length - 1; n++)
      if (!cmp(array[n], array[n + 1])) {
	array.splice(n + 1, 1);
	n--;
      }
    return array;
  }

  function cmp_null(a, b) {
    if (a === null || b === null) {
      a = (a === null);
      b = (b === null);
    }
    return a > b ? 1 : a < b ? -1 : 0;
  }

  function klassen_normalisieren(vareihe) {
    var klassen = vareihe.klassen;
    if (!klassen.length ||
	klassen[klassen.length - 1].klasse !== null)
      klassen.push({klasse: null});
    else {
      for (var n = 0; n < klassen.length - 1; n++)
	if (klassen[n].klasse === null)
	  klassen = klassen.splice(n, 1);
    }
    var sorted = sort_uniq(klassen, function(a, b) {
      return cmp_null(a.klasse, b.klasse);
    });
    if (!angular.equals(klassen, sorted))
      vareihe.klassen = sorted;
  }

  $scope.$watch('vareihe.klassen', function() {
    try {
      klassen_normalisieren($scope.vareihe);
    } catch (_) {}
  }, true);

  var veranstaltungsdatum = {};
  function veranstaltungen_normalisieren(vareihe) {
    var veranstaltungen = vareihe.veranstaltungen;
    if (!veranstaltungen.length ||
	veranstaltungen[veranstaltungen.length - 1] !== null)
      veranstaltungen.push(null);
    else {
      for (var n = 0; n < veranstaltungen.length - 1; n++)
	if (veranstaltungen[n] === null)
	  veranstaltungen.splice(n, 1);
    }
    var sorted = sort_uniq(veranstaltungen, function (a, b) {
      return cmp_null((veranstaltungsdatum[a] || '9999-99-99'),
		      (veranstaltungsdatum[b] || '9999-99-99')) ||
	     cmp_null(a, b);
    });
    if (!angular.equals(veranstaltungen, sorted))
      vareihe.veranstaltungen = sorted;
  }

  $scope.$watch('vareihe.veranstaltungen', function() {
    try {
      veranstaltungen_normalisieren($scope.vareihe);
    } catch (_) {}
  }, true);

  function startnummern_normalisieren(vareihe) {
    var startnummern = vareihe.startnummern;
    if (!startnummern.length ||
	(startnummern[startnummern.length - 1].id !== null &&
	 startnummern[startnummern.length - 1].alt !== null))
	startnummern.push({
	  id: startnummern.length ? startnummern[startnummern.length - 1].id : null,
	  alt: null
	});
    else {
      for (var n = 0; n < startnummern.length - 1; n++)
	if (startnummern[n].id === null || startnummern[n].alt === null) {
	  startnummern.splice(n, 1);
	  n--;
	}
    }
  }

  $scope.$watch('vareihe.startnummern', function() {
    try {
      startnummern_normalisieren($scope.vareihe);
    } catch (_) {}
  }, true);

  function vareihe_zuweisen(vareihe) {
    if (vareihe === undefined)
      vareihe = $scope.vareihe_alt;
    else {
      klassen_normalisieren(vareihe);
      veranstaltungen_normalisieren(vareihe);
      startnummern_normalisieren(vareihe);
    }
    $scope.ist_neu = vareihe.vareihe === undefined;
    $scope.vareihe = vareihe;
    $scope.vareihe_alt = angular.copy(vareihe);
  }

  $scope.geaendert = function() {
    /* FIXME: Ändern der Veranstaltung in der zusätzlichen Zeile
       für Startnummernänderungen wird als Änderung der
       Serie interpretiert. */
    return !angular.equals($scope.vareihe_alt, $scope.vareihe);
  };

  $scope.speichern = function() {
    var vareihe = angular.copy($scope.vareihe);
    var veranstaltungen = vareihe.veranstaltungen;
    if (veranstaltungen.length && veranstaltungen[veranstaltungen.length - 1] === null)
	veranstaltungen.pop();
    var klassen = vareihe.klassen;
    if (klassen.length && klassen[klassen.length - 1].klasse === null)
	klassen.pop();
    var startnummern = [];
    angular.forEach(vareihe.startnummern, function(aenderung) {
      if (aenderung.id !== null && aenderung.alt !== null)
	startnummern.push(aenderung);
    });
    vareihe.startnummern = startnummern;
    vareihe_speichern($http, $routeParams.vareihe, vareihe).
      success(function(vareihe) {
	vareihe_zuweisen(vareihe);
	var path = '/serie/' + vareihe.vareihe;
	if ($location.path() != path) {
	  $location.path(path).replace();
	  /* FIXME: Wie Reload verhindern? */
	}
      }).
      error(netzwerkfehler);
  };

  $scope.verwerfen = function() {
    vareihe_zuweisen(undefined);
  };

  $scope.loeschen = function() {
    if (confirm('Serie wirklich löschen?\n\nDie Serie kann später nicht wiederhergestellt werden.'))
      vareihe_loeschen($http, $routeParams.vareihe, $scope.vareihe.version).
	success(function() {
	  $window.history.back();
        }).
        error(netzwerkfehler);
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

  veranstaltungen_laden($scope, $http).
    success(function (veranstaltungen) {
      veranstaltungen.reverse();
      angular.forEach(veranstaltungen, function (veranstaltung) {
	veranstaltungsdatum[veranstaltung.id] = veranstaltung.datum;
      });
    });
  if ($routeParams.vareihe) {
    $http.get('/api/vareihe?vareihe=' + $routeParams.vareihe).
      success(vareihe_zuweisen).
      error(netzwerkfehler);
  } else {
    vareihe_zuweisen({
      version: 0,
      bezeichnung: 'Neue Serie',
      klassen: [],
      veranstaltungen: [],
      startnummern: []
    });
  }
}