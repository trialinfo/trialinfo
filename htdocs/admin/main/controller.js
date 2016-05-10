'use strict;'

var mainController = [
  '$scope', '$http', '$location', 'AuthService', 'veranstaltungen', 'vareihen',
  function ($scope, $http, $location, AuthService, veranstaltungen, vareihen) {
    $scope.SYNC_SOURCE = SYNC_SOURCE;
    $scope.veranstaltungen = veranstaltungen;
    $scope.vareihen = vareihen;
    $scope.anzeige = {};

    angular.forEach(veranstaltungen, function(veranstaltung) {
      if (veranstaltung.abgeschlossen)
	$scope.abgeschlossene_veranstaltungen = true;
    });

    angular.forEach(vareihen, function(vareihe) {
      if (vareihe.abgeschlossen)
	$scope.abgeschlossene_vareihen = true;
    });

    $scope.veranstaltung_sichtbar = function(veranstaltung) {
      return $scope.anzeige.abgeschlossene_veranstaltungen ||
	     !veranstaltung.abgeschlossen;
    };

    $scope.vareihe_sichtbar = function(vareihe) {
      return $scope.anzeige.abgeschlossene_vareihen ||
	      !vareihe.abgeschlossen;
    };

    $scope.veranstaltung_bezeichnung = veranstaltung_bezeichnung;

    $scope.neue_veranstaltung = function() {
      $location.path('/veranstaltung/neu/einstellungen');
    };

    $scope.sync_import_export = function() {
      $location.path('/extern');
    };

    $scope.neue_vareihe = function() {
      $location.path('/vareihe/neu');
    };

    $scope.logout = function() {
      AuthService.logout();
      $location.path('/login').replace();
    };
  }];

mainController.resolve = {
  veranstaltungen: [
    '$q', '$http',
    function($q, $http) {
      return http_request($q, $http.get('/api/veranstaltungen'));
    }],
  vareihen: [
    '$q', '$http',
    function($q, $http) {
      return http_request($q, $http.get('/api/vareihen'));
    }]
};
