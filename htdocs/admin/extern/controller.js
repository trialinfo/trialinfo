'use strict;'

function externController($scope, $http, $location, veranstaltungen) {
  $scope.veranstaltungen = veranstaltungen;
  $scope.einstellungen = {
    operation: 'export',
    format: 'trial-auswertung'
  };

  $scope.veranstaltung_sichtbar = function(veranstaltung) {
    return !veranstaltung.verborgen;
  };

/*
  $scope.neue_veranstaltung = function() {
    $location.path('/veranstaltung/neu/einstellungen').replace();
  };
*/

  $scope.import = function() {
    if ($scope.einstellungen.format == 'trial-auswertung') {
      var tra_datei = document.getElementById('tra_datei');
      $scope.tra_datei_fehler = undefined;
      if (tra_datei && !tra_datei.value.match(/\.tra/)) {
	if (tra_datei.value != '')
	  $scope.tra_datei_fehler = 'Der Dateiname endet nicht in ".tra".';
	tra_datei = undefined;
      }

      if (tra_datei && tra_datei.files[0]) {
	var reader = new FileReader();
	reader.onloadend = function(e) {
	  var data = e.target.result;
	  $http.post('/api/veranstaltung/import', window.btoa(data)).
	    success(function(result) {
	      if (result.id != null)
		$location.path('/veranstaltung/' + result.id).replace();
	    }).
	    error(netzwerkfehler).
	    finally(function() {
	      $scope.busy = false;
	    });
	};
	$scope.busy = true;
	reader.readAsBinaryString(tra_datei.files[0]);
      }
    }
    if ($scope.einstellungen.format == 'trialtool') {
      var cfg_datei = document.getElementById('cfg_datei');
      $scope.cfg_datei_fehler = undefined;
      if (cfg_datei && !cfg_datei.value.match(/\.cfg/)) {
	if (cfg_datei.value != '')
	  $scope.cfg_datei_fehler = 'Der Dateiname endet nicht in ".cfg".';
	cfg_datei = undefined;
      }

      var dat_datei = document.getElementById('dat_datei');
      $scope.dat_datei_fehler = undefined;
      if (dat_datei && !dat_datei.value.match(/\.dat/)) {
	if (dat_datei.value != '')
	  $scope.dat_datei_fehler = 'Der Dateiname endet nicht in ".dat".';
	dat_datei = undefined;
      }

      if (cfg_datei && cfg_datei.files[0] && dat_datei && dat_datei.files[0]) {
	var cfg_data, dat_data;

	function datei_gelesen() {
	  if (cfg_data != null && dat_data != null) {
	    var data = angular.toJson({ cfg: window.btoa(cfg_data), dat: window.btoa(dat_data) });
	    $http.post('/api/trialtool/import', data).
	      success(function(result) {
		$location.path('/veranstaltung/' + result.id).replace();
	    }).
	    error(netzwerkfehler).
	    finally(function() {
	      $scope.busy = false;
	    });
	  }
	}

	var cfg_reader = new FileReader();
	cfg_reader.onloadend = function(e) {
	  cfg_data = e.target.result;
	  datei_gelesen();
	};
	var dat_reader = new FileReader();
	dat_reader.onloadend = function(e) {
	  dat_data = e.target.result;
	  datei_gelesen();
	};
	$scope.busy = true;
	cfg_reader.readAsBinaryString(cfg_datei.files[0]);
	dat_reader.readAsBinaryString(dat_datei.files[0]);
      }
    }
    $scope.$apply();
  }
}

externController.resolve = {
  veranstaltungen: function($q, $http) {
    return http_request($q, $http.get('/api/veranstaltungen'));
  },
};
