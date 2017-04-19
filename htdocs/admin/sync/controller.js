var syncController = [
  '$scope', '$http', '$q', '$timeout', '$sce', '$location',
  function ($scope, $http, $q, $timeout, $sce, $location) {
    $scope.kill = {};

    var query = $location.search();
    if (query.sync) {
      var args = JSON.parse(decodeURIComponent(query.sync));
      $location.search('sync', null);
      $timeout(function() {
	$scope.$root.$broadcast('sync', args);
      });
    }

    // We put this in the config of remote $http requests.  The config is
    // available to response objects.  If a remote request fails
    // authentication, we redirect to the remote login page, with a redirect
    // URL that contains this additional sync parameter.  When the remote login
    // succeeds, it redirects back to us.  We find the sync parameter, and
    // start the sync as originally requested (see above).
    function sync_param() {
      return encodeURIComponent(JSON.stringify({
	tag: $scope.tag,
	url: $scope.url,
	timeout: $scope.timeout,
      }));
    }

    $scope.zustand = function() {
      var color;
      if ($scope.running) {
	if ($scope.source_dump && $scope.target_dump &&
	    !($scope.patch && $scope.patch.length))
	  color = '#27E833';  // "Green"
	else
	  color = '#FF7E00';  // "Orange"
      } else
	color = '#FF1700';  // "Red"
      return $sce.trustAsHtml(
	/* '<span style="position: absolute; z-index: 1">◻</span>' + */
	'<span style="color:' + color + '">◼</span>');
      // FIXME: Status auch im Fenstertitel anzeigen?
    };

    $scope.start = function() {
      delete $scope.source_dump;
      delete $scope.target_dump;
      delete $scope.patch
      delete $scope.source_error;
      delete $scope.target_error;
      $scope.running = true;
      make_target_request();
    };

    $scope.stop = function() {
      delete $scope.running;
      angular.forEach($scope.kill, function(kill) {
	kill.resolve();
      });
    };

    $scope.close = function() {
      $scope.stop();
      delete $scope.visible;
    };

    function later(name, action, timeout) {
      var promise = $timeout(function() {
	delete $scope.kill[name];
	action();
      }, timeout);
      $scope.kill[name] = $q.defer();
      $scope.kill[name].promise.
	then(function() {
	  // console.log(name + ' killed');
	  delete $scope.kill[name];
	  $timeout.cancel(promise);
	});
    }

    function make_request(name, request, cancel) {
      $scope.kill[name] = $q.defer();
      $scope.kill[name].promise.
	then(function() {
	  delete $scope.kill[name];
	  cancel.resolve();
	});

      // console.log(name);
      var next = $q.defer();
      request.
	success(function(result) {
	  // console.log(name + ' succeeded');
	  delete $scope.kill[name];
	  next.resolve(result);
	}).
	error(function(data, status) {
	  // console.log(name + ' ' +
	  //	    ($scope.running ? 'failed' : 'cancelled'));
	  delete $scope.kill[name];
	  next.reject([data, status]);
	});
      return next.promise;
    };

    function url_fehler(url, fehler) {
      if (url == '')
	url = $location.protocol() + '://' + $location.host();
      return url + ': ' + fehler;
    }

    function sync() {
      angular.forEach([$scope.source_dump, $scope.target_dump], function(dump) {
	delete dump.event.tag;
	delete dump.event.sync_erlaubt;
      });
      $scope.patch = json_diff($scope.target_dump, $scope.source_dump);
      if ($scope.patch.length) {
	// $scope.patch.unshift({op: 'test', path: '/event/fahrer_version',
	//			    value: data0.event.fahrer_version });
	//$scope.patch.unshift({op: 'test', path: '/event/version',
	//		      value: $scope.target_dump.event.version });
	//$scope.patch.unshift({op: 'test', path: '/format',
	//		      value: $scope.target_dump.format });

	var cancel = $q.defer();
	var request =
	  $http.post($scope.url + '/api/event/' + $scope.to_tag + '/patch',
		     {patch: $scope.patch},
		     {sync: sync_param(),
		      timeout: cancel.promise,
		      withCredentials: true});
	return make_request('patch request', request, cancel).
	  then(function() {
	    $scope.target_dump = $scope.source_dump;
	    delete $scope.patch;
	    delete $scope.target_error;
	  }, function(result) {
	    $scope.target_error = url_fehler($scope.url, result[0].error);
	    if (result[1] == 409)
	      $scope.stop();
	  });
      } else {
	// Ein Versionscheck am Target wäre vielleicht nicht blöd ...
	var deferred = $q.defer();
	deferred.resolve();
	return deferred.promise;
      }
    }

    function make_source_request() {
      delete $scope.source_dump;
      var cancel = $q.defer();
      var source_request =
	$http.get('/api/event/' + $scope.from_tag + '/dump',
		  {timeout: cancel.promise});
      return make_request('source request', source_request, cancel).
	then(function(dump) {
	  $scope.source_dump = dump;
	  $scope.title = dump.event.rankings[0].title;
	  delete $scope.source_error;
	  sync().
	    then(function() {
	      if ($scope.running)
		later('source timeout', make_source_request, $scope.timeout);
	    });
	}, function(result) {
	  $scope.source_error = url_fehler('', result[0].error);
	  later('source timeout', make_source_request, $scope.timeout);
	});
    }

    function make_target_request(kein_import) {
      delete $scope.target_dump;
      var cancel = $q.defer();
      var target_request =
	$http.get($scope.url + '/api/event/' + $scope.to_tag + '/dump', {
	  sync: sync_param(),
	  timeout: cancel.promise,
	  withCredentials: true
	});
      return make_request('target request', target_request, cancel).
	then(function(dump) {
	  if (dump.format) {
	    delete $scope.target_error;
	    $scope.target_dump = dump;
	    make_source_request();
	  } else {
	    $scope.target_error = 'Fehlerhafte Antwort vom Server';
	    $scope.stop();
	  }
	}, function(result) {
	  if (kein_import) {
	    $scope.target_error = url_fehler($scope.url, 'Veranstaltung ' + $scope.to_tag + ' existiert nicht');
	    $scope.stop();
	    return;
	  }

	  if (result[1] == 404) {
	    var cancel = $q.defer();
	    var export_request =
	      $http.get('/api/event/' + $scope.from_tag + '/export',
			{timeout: cancel.promise,
			 responseType: 'arraybuffer'});
	    make_request('export request', export_request, cancel).
	      then(function(data) {
		var enc = window.btoa(String.fromCharCode.apply(null, new Uint8Array(data)));
		var cancel = $q.defer();
		var import_request =
		  $http.post($scope.url + '/api/event/import',
			     {data: enc},
			     {sync: sync_param(),
			      timeout: cancel.promise,
			      withCredentials: true});
		  make_request('import request', import_request, cancel).
		    then(function() {
		      make_target_request(true);
		    }, function(result) {
		      $scope.target_error = url_fehler($scope.url, result[0].error);
		      $scope.stop();
		    });
	      }, function() {
		$scope.source_error = url_fehler('', 'Export fehlgeschlagen');
		$scope.stop();
	      });
	  } else {
	    $scope.target_error = url_fehler($scope.url, result[0].error);
	    later('target timeout', make_target_request, $scope.timeout);
	  }
	});
    }

    $scope.$on('sync', function(event, args) {
      $scope.stop();
      delete $scope.title;
      angular.extend($scope, args);
      $scope.from_tag = $scope.to_tag = $scope.tag;

      $scope.visible = true;
      $scope.start();
    });
  }];
