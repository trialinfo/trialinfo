'use strict;'

var importController = [
  '$scope', '$http', '$location', '$q', 'events',
  function ($scope, $http, $location, $q, events) {
    $scope.SYNC_SOURCE = SYNC_SOURCE;
    $scope.TRIALTOOL = TRIALTOOL;
    $scope.events = events;
    $scope.settings = {
      operation: SYNC_SOURCE ? 'import-remote' : 'import-file',
      format: 'trialinfo',
      timeout: 30,
      url: SYNC_REMOTE_URL,
    };
    try {
      $scope.settings.event = events[events.length - 1];
    } catch(_) { }
    $scope.remote = {};

    $scope.import_file = function() {
      if ($scope.settings.format == 'trialinfo') {
	var filename = document.getElementById('filename');
	if (filename && filename.files[0]) {
	  var reader = new FileReader();
	  reader.onloadend = function(e) {
	    var data = e.target.result;
	    $http.post('/api/event/import', { data: window.btoa(data) }).
	      success(function(result) {
		if (result.id != null)
		  $location.path('/event/' + result.id).replace();
	      }).
	      error(network_error).
	      finally(function() {
		$scope.busy = false;
	      });
	  };
	  $scope.busy = true;
	  reader.readAsBinaryString(filename.files[0]);
	}
      }
      if ($scope.settings.format == 'trialtool') {
	var cfg_datei = document.getElementById('cfg_datei');
	var dat_datei = document.getElementById('dat_datei');
	if (cfg_datei && cfg_datei.files[0] && dat_datei && dat_datei.files[0]) {
	  var cfg_data, dat_data;

	  function datei_gelesen() {
	    if (cfg_data != null && dat_data != null) {
	      var data = angular.toJson({ cfg: window.btoa(cfg_data), dat: window.btoa(dat_data) });
	      $http.post('/api/trialtool/import', data).
		success(function(result) {
		  $location.path('/event/' + result.id).replace();
		}).
		error(network_error).
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

    $scope.dateiname = function(event) {
      if (event.dateiname != null)
	return event.dateiname;
      var title = event.title;
      if (title) {
	title = title.replace(/[:\/\\]/g, '')
	if (title)
	  return title
      }
      if (event.date != null)
	return 'Trial ' + event.date;
      else
	return 'Trial';
    };

    var cancel_remote;
    $scope.get_events = function() {
      $scope.busy = true;
      cancel_remote = $q.defer();
      $http.get($scope.settings.url + '/api/events',
		{timeout: cancel_remote.promise, withCredentials: true}).
	success(function(events) {
	  $scope.remote.events = events;
	  $scope.remote.event =
	    events.length ? events[events.length - 1] : null;
	}).
	error(network_error).
	finally(function() {
	  $scope.busy = false;
	  cancel_remote = undefined;
	});
    };

    $scope.event_name = event_name;
    $scope.event_visible = function(event) {
      return !event.closed;
    };

    $scope.$watch('remote.event', function() {
      var exists = false;
      if ($scope.remote.event) {
	angular.forEach(events, function(event) {
	  if (event.tag == $scope.remote.event.tag)
	    exists = true;
	});
      }
      $scope.remote.exists = exists;
    });

    $scope.import_remote = function() {
      $scope.busy = true;
      var tag = $scope.remote.event.tag;
      if (cancel_remote)
	cancel_remote.resolve();
      cancel_remote = $q.defer();
      $http.get($scope.settings.url + '/api/event/export',
		{params: {tag: tag}, timeout: cancel_remote.promise, withCredentials: true, responseType: 'arraybuffer'}).
	success(function(data) {
	  var params;
	  if (!$scope.remote.exists) {
	    params = {
	      tag: tag,
	      create: true,  // Veranstaltung darf noch nicht existieren
	    };
	  } else if ($scope.remote.replace) {
	    params = {
	      tag: tag,
	    };
	  }
	  var enc = window.btoa(String.fromCharCode.apply(null, new Uint8Array(data)));
	  cancel_remote = $q.defer();
	  $http.post('/api/event/import', enc,
		     {params: params, timeout: cancel_remote.promise}).
	    success(function(result) {
	      $location.path('/event/' + result.id).replace();
	    }).
	    error(network_error).
	    finally(function() {
	      $scope.busy = false;
	      cancel_remote = undefined;
	    });
	}).
	error(function() {
	  $scope.busy = false;
	  cancel_remote = undefined;
	  network_error();
	});
    };

    $scope.$watch('settings.url', function() {
      delete $scope.remote.events;
    });

    $scope.$on('$destroy', function() {
      if (cancel_remote)
	cancel_remote.resolve();
    });
  }];

importController.resolve = {
  events: [
    '$q', '$http',
    function($q, $http) {
      return http_request($q, $http.get('/api/events'));
    }],
};
