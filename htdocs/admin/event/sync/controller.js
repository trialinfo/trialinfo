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
	    ($scope.target_patch || []).length == 0 &&
	    Object.keys($scope.source_dump.scoring || {}).length == 0 &&
	    Object.keys($scope.target_dump.scoring || {}).length == 0)
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
      $scope.target_event_should_exist = false;
      $scope.source_seq = {};
      $scope.target_seq = {};
      delete $scope.source_dump;
      delete $scope.target_dump;
      delete $scope.target_patch;
      delete $scope.source_error;
      delete $scope.target_error;
      $scope.running = true;
      sync();
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

    function url_error(url, error) {
      if (url == '')
	url = $location.absUrl().match(/(^.*\/\/[^/]*)/)[1];
      if (error instanceof Error)
	return url + ': ' + error.toString();

      if (typeof error != 'string') {
	let response = error;
	if (response.status < 0)
	  error = 'Keine Verbindung';
	else {
	  error = response.status;
	  if (response.data && response.data.error)
	    error = error + ' ' + response.data.error;
	}
      }
      return url + ': ' + error;
    }

    const computed_fields = [
      'decisive_marks', 'decisive_round', 'marks', 'marks_distribution',
      'marks_per_round', 'penalty_marks', 'rank', 'rounds', 'unfinished_zones'
    ];

    function reduce_dump(dump) {
      delete dump.event.tag;
      delete dump.seq;

      /*
       * When using mobile scoring, the marks of the zones under scoring and
       * the penalty marks are determined by the scoring data, so leave those
       * and the other computed fields out of the diff.  Otherwise, if the two
       * sides don't have the same scoring data, the diff might not apply.
       *
       * We sync the scoring data in both ways, so eventually, the computed
       * fields on both sides will match as well.
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
	for (let field of computed_fields)
	  delete rider[field];
      }
      return dump;
    }

    function dump_without_scoring(dump) {
      dump = Object.assign({}, dump);
      delete dump.scoring;
      return dump;
    }

    function update_seq(seq, scoring) {
      for (device_tag in scoring) {
	let items = scoring[device_tag];
	let max_seq = items[items.length - 1].seq;
	if (!(seq[device_tag] >= max_seq))
	  seq[device_tag] = max_seq;
      }
    }

    function reduce_scoring(scoring, seq) {
      let reduced_scoring = {};
      for (let device_tag in scoring) {
	let items = scoring[device_tag];
	let n;
	for (n = 0; n < items.length; n++) {
	  if (!(seq[device_tag] >= items[n].seq))
	    break;
	}
	if (n != items.length) {
	  if (n != 0)
	    items = items.splice(n);
	  reduced_scoring[device_tag] = items;
	}
      }
      return reduced_scoring;
    }

    function source_patch_request() {
      let target_scoring =
	reduce_scoring($scope.target_dump.scoring, $scope.source_seq);
      $scope.target_dump.scoring = target_scoring;
      if (Object.keys(target_scoring).length) {
	let seq = Object.assign({}, $scope.source_seq);
	update_seq(seq, $scope.source_dump.scoring);
	var params = {
	  seq: encodeURIComponent(JSON.stringify(seq))
	};
	let cancel = $q.defer();
	let request =
	  $http.post('/api/event/' + $scope.from_tag + '/patch',
		     {patch: [],
		      scoring: target_scoring},
		     {params: params,
		      timeout: cancel.promise});
	return make_request('patch source request', request, cancel)
	  .then(function(response) {
	    update_seq($scope.source_seq, target_scoring);
	    $scope.target_dump.scoring = {};
	    /* response.scoring could end up non-empty here, but that doesn't
	     * matter because we'll pick up any additional scoring items in the
	     * next iteration.  */
	  })
	  .catch(function(response) {
	    $scope.source_error = url_error('', response);
	    if (response.status == 404 || response.status == 409)
	      $scope.stop();
	  });
      } else {
	let pass = $q.defer();
	pass.resolve();
	return pass.promise;
      }
    }

    function target_patch_request() {
      let source_scoring =
	reduce_scoring($scope.source_dump.scoring, $scope.target_seq);
      $scope.source_dump.scoring = source_scoring;
      let source_dump = dump_without_scoring($scope.source_dump);
      let target_dump = dump_without_scoring($scope.target_dump);
      $scope.target_patch = json_diff(target_dump, source_dump);

      let scoring_active = $scope.source_dump.event.scoring_zones
        .some(function(enabled) { return enabled; });

      if ($scope.target_patch.length ||
	  Object.keys(source_scoring).length ||
	  scoring_active) {
	let seq = Object.assign({}, $scope.target_seq);
	update_seq(seq, $scope.target_dump.scoring);
	var params = {
          seq: encodeURIComponent(JSON.stringify(seq))
	};
	var cancel = $q.defer();
	var request =
	  $http.post($scope.url + '/api/event/' + $scope.to_tag + '/patch',
		     {patch: $scope.target_patch,
		      scoring: source_scoring},
		     {restart: restart_param(),
		      params: params,
		      timeout: cancel.promise,
		      withCredentials: true});
	return make_request('patch target request', request, cancel)
	  .then(function(response) {
	    update_seq($scope.target_seq, source_scoring);
	    $scope.target_dump = Object.assign({}, $scope.source_dump);
	    $scope.target_dump.scoring = response.scoring;
	    $scope.source_dump.scoring = {};
	    delete $scope.target_patch;
	    delete $scope.target_error;
	  })
	  .catch(function(response) {
	    $scope.target_error = url_error($scope.url, response);
	    if (response.status == 404 || response.status == 409)
	      $scope.stop();
	  });
      } else {
	let pass = $q.defer();
	pass.resolve();
	return pass.promise;
      }
    }

    function source_dump_request() {
      delete $scope.source_dump;
      var cancel = $q.defer();
      var params = {
	seq: encodeURIComponent(JSON.stringify($scope.target_seq))
      };
      var request =
	$http.get('/api/event/' + $scope.from_tag + '/dump', {
	  params: params,
	  timeout: cancel.promise
	});
      return make_request('source request', request, cancel)
	.then(function(response) {
	  let dump = response.data;
	  if (!dump.format) {
	    $scope.source_error = 'Fehlerhafte Antwort vom Server';
	    return $q.reject();
	  }
	  $scope.source_seq = dump.seq || {};
	  $scope.source_dump = reduce_dump(dump);
	  $scope.title = dump.event.title;
	  delete $scope.source_error;
	})
	.catch(function(response) {
	  $scope.source_error = url_error('', response);
	  return $q.reject();
	});
    }

    function target_dump_request() {
      delete $scope.target_dump;
      var cancel = $q.defer();
      var params = {
	seq: encodeURIComponent(JSON.stringify($scope.source_seq))
      };
      var target_request =
	$http.get($scope.url + '/api/event/' + $scope.to_tag + '/dump', {
	  params: params,
	  restart: restart_param(),
	  timeout: cancel.promise,
	  withCredentials: true
	});
      return make_request('target request', target_request, cancel)
	.then(function(response) {
	  let dump = response.data;
	  if (!dump.format) {
	    $scope.target_error = 'Fehlerhafte Antwort vom Server';
	    return $q.reject();
	  }
	  delete $scope.target_error;
	  $scope.target_seq = dump.seq || {};
	  $scope.target_dump = reduce_dump(dump);
	  $scope.target_event_should_exist = true;
	})
	.catch(function(response) {
	  if (response.status == 404) {
	    if ($scope.target_event_should_exist) {
	      $scope.target_error = url_error($scope.url, new Error('Veranstaltung ' + $scope.to_tag + ' existiert nicht'));
	      return $q.reject();
	    }
	    let pass = $q.defer();
	    pass.resolve();
	    return pass.promise;
	  } else {
	    $scope.target_error = url_error('', response);
	    return $q.reject();
	  }
	});
    }

    function source_export_request() {
      var cancel = $q.defer();
      var export_request =
	$http.get('/api/event/' + $scope.from_tag + '/export',
		  {timeout: cancel.promise,
		   responseType: 'arraybuffer'});
      return make_request('export request', export_request, cancel)
	.then(function(response) {
	  /* FIXME: We could extract the source sequence numbers and
	     update $scope.source_seq here to save some bandwidth here,
	     but the data is compressed. */
	  return new Uint8Array(response.data);
	})
	.catch(function() {
	  $scope.source_error = url_error('', new Error('Export fehlgeschlagen'));
	  return $q.reject();
	});
    }

    function target_import_request(data) {
      var enc = window.btoa(String.fromCharCode.apply(null, data));
      var cancel = $q.defer();
      var import_request =
	$http.post($scope.url + '/api/event/import',
		   {data: enc},
		   {restart: restart_param(),
		    timeout: cancel.promise,
		    withCredentials: true});
	return make_request('import request', import_request, cancel)
	  .then(function() {
	    $scope.target_event_should_exist = true;
	    /* FIXME: We could extract the source sequence numbers
	       and update $scope.target_seq to save some bandwidth
	       here, but the data is compressed.  */
	  })
	  .catch(function(response) {
	    $scope.target_error = url_error($scope.url, response);
	    return $q.reject();
	  });
    }

    async function sync_step() {
      await source_dump_request();
      if (!$scope.target_dump) {
        await target_dump_request();
	if (!$scope.target_dump) {
	  if ($scope.target_event_should_exist) {
	    let error = new Error('Veranstaltung ' + $scope.to_tag + ' existiert nicht');
	    $scope.target_error = url_error($scope.url, error);
	    throw error;
	  }
	  let data = await source_export_request();
	  await target_import_request(data);
	  await target_dump_request();
	}
      }
      await source_patch_request();
      await target_patch_request();
      /* Re-patch the source in case we have additional scoring data now. */
      await source_patch_request();
    }

    async function sync() {
      if (!$scope.running)
	return;
      try {
	await sync_step();
	later('target timeout', sync, $scope.timeout);
      } catch (error) {
	$scope.stop();
      }
    }

    $scope.$on('sync', function(event, args) {
      $scope.stop();
      delete $scope.title;
      angular.extend($scope, args);
      $scope.from_tag = $scope.to_tag = $scope.tag;

      $scope.visible = true;
      $scope.start();
    });

    $scope.$on('get_sync_target', function(event, cb) {
      if ($scope.url != null)
        cb($scope.url);
    });
  }];

angular.module('application').controller('syncController', syncController);
