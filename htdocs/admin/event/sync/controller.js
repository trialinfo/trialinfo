var syncController = [
  '$scope', '$http', '$q', '$timeout', '$sce', '$location',
  function ($scope, $http, $q, $timeout, $sce, $location) {
    $scope.kill = {};

    var query = $location.search();
    if (query.restart) {
      var args = JSON.parse(decodeURIComponent(query.restart));
      if (args.action == 'sync') {
	// Note: this requires reloadOnSearch to be false for the active route
	// or else an unnecessary route reload will happen.
	$location.search('restart', null);
	$timeout(function() {
	  $scope.$root.$broadcast('sync', args);
	});
      }
    }

    // We put this in the config of remote $http requests.  The config is
    // available to response objects.  If a remote request fails
    // authentication, we redirect to the remote login page, with a redirect
    // URL that contains this additional restart parameter.  When the remote
    // login succeeds, it redirects back to us.  We find the restart parameter,
    // and start the sync as originally requested (see above).
    function restart_param() {
      return {
	action: 'sync',
	tag: $scope.tag,
	url: $scope.url,
	timeout: $scope.timeout,
      };
    }

    $scope.status = function() {
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
	'<span style="display:inline-block; width:8pt; height:8pt; background-color:' + color + '"></span>');
      // FIXME: Status auch im Fenstertitel anzeigen?
    };

    $scope.start = function() {
      delete $scope.source_dump;
      delete $scope.target_dump;
      delete $scope.patch
      delete $scope.source_error;
      delete $scope.target_error;
      $scope.running = true;
      make_target_request(false);
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
      request
	.then(function(response) {
	  // console.log(name + ' succeeded');
	  delete $scope.kill[name];
	  next.resolve(response);
	})
	.catch(function(response) {
	  // console.log(name + ' ' +
	  //	    ($scope.running ? 'failed' : 'canceled'));
	  delete $scope.kill[name];
	  next.reject(response);
	});
      return next.promise;
    };

    function url_error(url, fehler) {
      if (url == '')
	url = $location.protocol() + '://' + $location.host();
      if (typeof fehler != 'string') {
	let response = fehler;
	if (response.status < 0)
	  fehler = 'Keine Verbindung';
	else {
	  fehler = response.status;
	  if (response.data && response.data.error)
	    fehler = fehler + ' ' + response.data.error;
	}
      }
      return url + ': ' + fehler;
    }

    const computed_fields = [
      'decisive_marks', 'decisive_round', 'marks', 'marks_distribution',
      'marks_per_round', 'penalty_marks', 'rank', 'rounds', 'unfinished_zones'
    ];

    function reduce_dump(dump) {
      delete dump.event.tag;
      delete dump.scoring;

      /*
       * When using mobile scoring, the marks of the zones under scoring and
       * the penalty marks are determined by the scoring data, so leave those
       * and the other computed fields out of the diff.  Otherwise, if the two
       * sides don't have the same scoring data, the diff might not apply.
       */
      let scoring_zones = dump.event.scoring_zones;
      if (!scoring_zones.some(function(enabled) { return enabled }))
	return dump;
      let riders = dump.riders;
      for (let number in riders) {
	let rider = riders[number];
	if (!rider.scoring)
	  continue;
	let marks_per_zone = [];
	for (let round_index = 0;
	     round_index < rider.marks_per_zone.length;
	     round_index++) {
	  let rider_marks_in_round =
	    rider.marks_per_zone[round_index];
	  if (!rider_marks_in_round)
	    continue;
	  let marks_in_round;
	  for (let zone_index = 0;
	       zone_index < rider_marks_in_round.length;
	       zone_index++) {
	    if (scoring_zones[zone_index])
	      continue;
	    let marks = rider_marks_in_round[zone_index];
	    if (marks == null)
	      continue;
	    if (!marks_in_round) {
	      marks_in_round = [];
	      marks_per_zone[round_index] = marks_in_round;
	    }
	    marks_in_round[zone_index] = marks;
	  }
	}
	rider.marks_per_zone = marks_per_zone;
	for (let field in computed_fields)
	  delete rider[field];
      }
    }

    function sync() {
      reduce_dump($scope.source_dump);
      reduce_dump($scope.target_dump);
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
		     {restart: restart_param(),
		      timeout: cancel.promise,
		      withCredentials: true});
	return make_request('patch request', request, cancel)
	  .then(function() {
	    $scope.target_dump = $scope.source_dump;
	    delete $scope.patch;
	    delete $scope.target_error;
	  })
	  .catch(function(response) {
	    $scope.target_error = url_error($scope.url, response);
	    if (response.status == 409)
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
      return make_request('source request', source_request, cancel)
	.then(function(response) {
	  let dump = response.data;
	  $scope.source_dump = dump;
	  $scope.title = dump.event.title;
	  delete $scope.source_error;
	  sync()
	    .then(function() {
	      if ($scope.running)
		later('source timeout', make_source_request, $scope.timeout);
	    });
	})
	.catch(function(response) {
	  $scope.source_error = url_error('', response);
	  later('source timeout', make_source_request, $scope.timeout);
	});
    }

    function make_target_request(prevent_import) {
      delete $scope.target_dump;
      var cancel = $q.defer();
      var target_request =
	$http.get($scope.url + '/api/event/' + $scope.to_tag + '/dump', {
	  restart: restart_param(),
	  timeout: cancel.promise,
	  withCredentials: true
	});
      return make_request('target request', target_request, cancel)
	.then(function(response) {
	  let dump = response.data;
	  if (dump.format) {
	    delete $scope.target_error;
	    $scope.target_dump = dump;
	    make_source_request();
	  } else {
	    $scope.target_error = 'Fehlerhafte Antwort vom Server';
	    $scope.stop();
	  }
	})
	.catch(function(response) {
	  if (prevent_import) {
	    $scope.target_error = url_error($scope.url, 'Veranstaltung ' + $scope.to_tag + ' existiert nicht');
	    $scope.stop();
	    return;
	  }

	  if (response.status == 404) {
	    var cancel = $q.defer();
	    var export_request =
	      $http.get('/api/event/' + $scope.from_tag + '/export',
			{timeout: cancel.promise,
			 responseType: 'arraybuffer'});
	    make_request('export request', export_request, cancel)
	      .then(function(response) {
		var enc = window.btoa(String.fromCharCode.apply(null, new Uint8Array(response.data)));
		var cancel = $q.defer();
		var import_request =
		  $http.post($scope.url + '/api/event/import',
			     {data: enc},
			     {restart: restart_param(),
			      timeout: cancel.promise,
			      withCredentials: true});
		  make_request('import request', import_request, cancel)
		    .then(function() {
		      make_target_request(true);
		    })
		    .catch(function(response) {
		      $scope.target_error = url_error($scope.url, response);
		      $scope.stop();
		    });
	      })
	      .catch(function() {
		$scope.source_error = url_error('', 'Export fehlgeschlagen');
		$scope.stop();
	      });
	  } else {
	    $scope.target_error = url_error($scope.url, response);
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

angular.module('application').controller('syncController', syncController);
