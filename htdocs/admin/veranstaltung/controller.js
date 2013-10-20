'use strict;'

function veranstaltungController($scope, $location, $routeParams, $http) {
  $scope.id = $routeParams.id;
  $scope.fold = {};

  function netzwerkfehler(data, status) {
    if (status == 500)
      $scope.fehler = 'Interner Serverfehler.';
    else
      $scope.fehler = data.error;
  }

  $scope.loeschen = function() {
    if (confirm('Veranstaltung wirklich löschen?\n\nDie Veranstaltung kann später nicht wiederhergestellt werden.')) {
      veranstaltung_loeschen($http, $routeParams.id, $scope.veranstaltung.version).
	success(function() {
	  $location.path('/veranstaltungen');
	}).
	error(netzwerkfehler);
    }
    $scope.fold.loeschen = false;
  };

  $scope.reset = function(reset) {
    var was = reset.substr(0, 1).toUpperCase() + reset.substr(1);
    if (confirm('Veranstaltung wirklich auf ' + was + ' zurücksetzen?\n\n' +
		'Diese Änderung kann nicht rückgängig gemacht werden.')) {
      var params = {
	id: $routeParams.id,
	version: $scope.veranstaltung.version,
	reset: reset
      };
      $http.post('/api/veranstaltung/reset', undefined, {params: params}).
	error(netzwerkfehler);
    }
    $scope.fold.zuruecksetzen = false;
  }

  veranstaltung_laden($scope, $http, $routeParams.id);
}
