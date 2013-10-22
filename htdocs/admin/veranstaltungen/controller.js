'use strict;'

function veranstaltungenController($scope, $http, $location, veranstaltungen) {
  $scope.sichtbar = function(veranstaltung) {
    return !veranstaltung.verborgen;
  };

  $scope.kuerzel = function(vareihen) {
    var kuerzel = [];
    angular.forEach(vareihen, function(vareihe) {
      kuerzel.push(vareihe.kuerzel);
    });
    return kuerzel.length ? ' (' + kuerzel.sort().join(', ') + ')' : undefined;
  };

  $scope.neue_veranstaltung = function() {
    $location.path('/veranstaltung/neu/einstellungen');
  };

  $scope.veranstaltungen = veranstaltungen;
}

veranstaltungenController.resolve = {
  veranstaltungen: function($q, $http) {
    return http_request($q, $http.get('/api/veranstaltungen'));
  }
};
