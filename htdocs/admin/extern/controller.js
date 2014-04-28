'use strict;'

function externController($scope, $http, $location, $q, veranstaltungen) {
  $scope.$root.kontext((SYNC_SOURCE ? 'Synchronisieren, ' : '') + 'Import und Export');
  $scope.SYNC_SOURCE = SYNC_SOURCE;
  $scope.veranstaltungen = veranstaltungen;
  $scope.einstellungen = {
    operation: $scope.SYNC_SOURCE ? 'sync' : 'export-file',
    format: 'trial-auswertung',
    timeout: 30,
    url: 'http://www2.otsv.at'
  };
  try {
    $scope.einstellungen.veranstaltung = veranstaltungen[veranstaltungen.length - 1];
  } catch(_) { }
  $scope.remote = {};

  $scope.veranstaltung_sichtbar = function(veranstaltung) {
    return !veranstaltung.verborgen;
  };

  $scope.import_file = function() {
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

  var cancel_remote;
  $scope.get_veranstaltungen = function() {
    $scope.busy = true;
    cancel_remote = $q.defer();
    $http.get($scope.einstellungen.url + '/api/veranstaltungen',
	      {timeout: cancel_remote.promise, withCredentials: true}).
      success(function(veranstaltungen) {
	$scope.remote.veranstaltungen = veranstaltungen;
	$scope.remote.veranstaltung =
	  veranstaltungen.length ? veranstaltungen[veranstaltungen.length - 1] : null;
	$scope.liste_abgerufen = true;
      }).
      error(netzwerkfehler).
      finally(function() {
	$scope.busy = false;
	cancel_remote = undefined;
      });
  };

  $scope.$watch('remote.veranstaltung', function() {
    var exists = false;
    if ($scope.remote.veranstaltung) {
      angular.forEach(veranstaltungen, function(veranstaltung) {
	if (veranstaltung.tag == $scope.remote.veranstaltung.tag)
	  exists = true;
      });
    }
    $scope.remote.exists = exists;
  });

  $scope.import_remote = function() {
    $scope.busy = true;
    var tag = $scope.remote.veranstaltung.tag;
    if (cancel_remote)
      cancel_remote.resolve();
    cancel_remote = $q.defer();
    $http.get($scope.einstellungen.url + '/api/veranstaltung/export',
	      {params: {tag: tag}, timeout: cancel_remote.promise, withCredentials: true, responseType: 'arraybuffer'}).
      success(function(data) {
	var params;
	if (!$scope.remote.exists) {
	  params = {
	    tag: tag,
	    create: true,  // Veranstaltung darf noch nicht existieren
	  };
	}
	var enc = window.btoa(String.fromCharCode.apply(null, new Uint8Array(data)));
	cancel_remote = $q.defer();
	$http.post('/api/veranstaltung/import', enc,
		   {params: params, timeout: cancel_remote.promise}).
	  success(function(result) {
	    $location.path('/veranstaltung/' + result.id).replace();
	  }).
	  error(netzwerkfehler).
	  finally(function() {
	    $scope.busy = false;
	    cancel_remote = undefined;
	  });
      }).
      error(function() {
	$scope.busy = false;
	cancel_remote = undefined;
	netzwerkfehler();
      });
  };

  $scope.$watch('einstellungen.url', function() {
    $scope.liste_abgerufen = false;
  });

  $scope.$on('$destroy', function() {
    if (cancel_remote)
      cancel_remote.resolve();
  });
}

externController.resolve = {
  veranstaltungen: function($q, $http) {
    return http_request($q, $http.get('/api/veranstaltungen'));
  },
};
