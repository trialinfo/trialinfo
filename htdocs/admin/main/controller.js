'use strict;'

function mainController($scope, $http, $location, veranstaltungen, vareihen) {
  $scope.SYNC_SOURCE = SYNC_SOURCE;
  $scope.veranstaltungen = veranstaltungen;
  $scope.vareihen = vareihen;

  $scope.veranstaltung_sichtbar = function(veranstaltung) {
    return !veranstaltung.verborgen;
  };

  $scope.veranstaltung_kuerzel = function(vareihen) {
    var kuerzel = [];
    angular.forEach(vareihen, function(vareihe) {
      kuerzel.push(vareihe.kuerzel);
    });
    return kuerzel.length ? ' (' + kuerzel.sort().join(', ') + ')' : undefined;
  };

  $scope.neue_veranstaltung = function() {
    $location.path('/veranstaltung/neu/einstellungen');
  };

  $scope.sync_import_export = function() {
    $location.path('/extern');
  };

  $scope.neue_vareihe = function() {
    $location.path('/vareihe/neu');
  };
}

mainController.resolve = {
  veranstaltungen: function($q, $http) {
    return http_request($q, $http.get('/api/veranstaltungen'));
  },
  vareihen: function($q, $http) {
    return http_request($q, $http.get('/api/vareihen'));
  }
};
