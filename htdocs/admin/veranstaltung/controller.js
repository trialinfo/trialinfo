'use strict;'

function veranstaltungController($scope, $location, $http, veranstaltung) {
  $scope.veranstaltung = veranstaltung;
  $scope.fold = {};

  $scope.loeschen = function() {
    if (confirm('Veranstaltung wirklich löschen?\n\nDie Veranstaltung kann später nicht wiederhergestellt werden.')) {
      veranstaltung_loeschen($http, veranstaltung.id, veranstaltung.version).
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
	id: veranstaltung.id,
	version: veranstaltung.version,
	reset: reset
      };
      $http.post('/api/veranstaltung/reset', undefined, {params: params}).
	error(netzwerkfehler);
    }
    $scope.fold.zuruecksetzen = false;
  }
}

veranstaltungController.resolve = {
  veranstaltung: function($q, $http, $route) {
    return http_request($q, $http.get('/api/veranstaltung',
				      {params: $route.current.params}));
  }
};
