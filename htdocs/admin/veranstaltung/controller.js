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
	  $location.path('/');
	}).
	error(netzwerkfehler);
    }
    $scope.loeschen_sichtbar = false;
  };

  veranstaltung_laden($scope, $http, $routeParams.id);
}
