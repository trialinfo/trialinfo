'use strict;'

var importController = [
  '$scope', '$http', '$location', '$q', '$timeout', 'events',
  function ($scope, $http, $location, $q, $timeout, events) {
    $scope.config = config;
    $scope.events = events;
    $scope.settings = {
      operation: config.sync_target ? 'import-remote' : 'import-file',
      format: 'trialinfo',
      timeout: 30,
      url: config.sync_target,
    };
    try {
      $scope.settings.event = events[events.length - 1];
    } catch(_) { }
    $scope.remote = {};

    var query = $location.search();
    if (query.restart) {
      var args = JSON.parse(decodeURIComponent(query.restart));
      if (args.action == 'get-events') {
	$location.search('restart', null);
	$scope.settings.operation = 'import-remote';
	$scope.settings.url = args.url;
	$timeout(function() {
	  $scope.get_events();
	});
      }
    }

    $scope.import_file = function() {
      if ($scope.settings.format == 'trialinfo') {
	var filename = document.getElementById('filename');
	if (filename && filename.files[0]) {
	  var reader = new FileReader();
	  reader.onloadend = function(e) {
	    var data = window.btoa(e.target.result);
	    $http.post('/api/event/import', { data: data })
	      .then(function(response) {
		if (response.data.id != null)
		  $location.path('/event/' + response.data.id).replace();
	      })
	      .catch(network_error)
	      .finally(function() {
		$scope.busy = false;
	      });
	  };
	  $scope.busy = true;
	  reader.readAsBinaryString(filename.files[0]);
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
      $http.get($scope.settings.url + '/api/events', {
		restart: {
		    action: 'get-events',
		    url: $scope.settings.url
		  },
		timeout: cancel_remote.promise,
		withCredentials: true})
	.then(function(response) {
	  let events = response.data;
	  $scope.remote.events = events;
	  $scope.remote.event =
	    events.length ? events[events.length - 1] : null;
	})
	.catch(network_error)
	.finally(function() {
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
      $http.get($scope.settings.url + '/api/event/' + tag + '/export',
		{ timeout: cancel_remote.promise,
		  withCredentials: true,
		  responseType: 'arraybuffer'})
	.then(function(response) {
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
	  let data = window.btoa(
	    String.fromCharCode.apply(null,
	      new Uint8Array(response.data)));
	  cancel_remote = $q.defer();
	  $http.post('/api/event/import', { data: data },
		     {params: params, timeout: cancel_remote.promise})
	    .then(function(response) {
	      $location.path('/event/' + response.data.id).replace();
	    })
	    .catch(network_error)
	    .finally(function() {
	      $scope.busy = false;
	      cancel_remote = undefined;
	    });
	})
	.catch(function(response) {
	  $scope.busy = false;
	  cancel_remote = undefined;
	  network_error(response);
	});
    };

    $scope.$watch('settings.url', function(newValue, oldValue) {
      if (oldValue != newValue)
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
