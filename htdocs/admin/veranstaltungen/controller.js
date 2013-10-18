'use strict;'

function veranstaltungenController($scope, $http, $location) {
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

  veranstaltungen_laden($scope, $http);
}
