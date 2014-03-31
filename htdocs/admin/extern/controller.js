'use strict;'

function externController($scope, $http, $location, veranstaltungen) {
  $scope.WITH_SYNC = WITH_SYNC;
  $scope.veranstaltungen = veranstaltungen;
  $scope.einstellungen = {
    operation: $scope.WITH_SYNC ? 'sync' : 'export',
    format: 'trial-auswertung',
    timeout: 30,
    url: 'http://www4.otsv.at'
  };
  try {
    $scope.einstellungen.veranstaltung = veranstaltungen[veranstaltungen.length - 1];
  } catch(_) { }

  $scope.veranstaltung_sichtbar = function(veranstaltung) {
    return !veranstaltung.verborgen;
  };

  $scope.import = function() {
    if ($scope.einstellungen.format == 'trial-auswertung') {
      var tra_datei = document.getElementById('tra_datei');
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
      var dat_datei = document.getElementById('dat_datei');
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
  }

  $scope.dateiname = function(veranstaltung) {
    if (veranstaltung.dateiname != null)
      return veranstaltung.dateiname;
    else if (veranstaltung.datum != null)
      return 'Trial ' + veranstaltung.datum;
    else
      return 'Trial';
  };

  $scope.synchronize = function() {
    var args = {
      titel: $scope.einstellungen.veranstaltung.titel,
      tag: $scope.einstellungen.veranstaltung.tag,
      url: $scope.einstellungen.url,
      timeout: $scope.einstellungen.timeout * 1000
    };
    $scope.$root.$broadcast('sync', args);
  }
}

externController.resolve = {
  veranstaltungen: function($q, $http) {
    return http_request($q, $http.get('/api/veranstaltungen'));
  },
};
