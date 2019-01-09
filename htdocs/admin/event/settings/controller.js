'use strict;'

var settingsController = [
  '$scope', '$http', '$timeout', '$location', 'event', 'events',
  function ($scope, $http, $timeout, $location, event, events) {
    $scope.$root.context(event ? event.title : 'Neue Veranstaltung');
    $scope.internal = {
      base: null,
      reset: null,
      main_ranking: [false, false, false, false],
    };
    min_zones = 8;

    assign_event(event);
    event = undefined;

    function expand_scores(scores) {
      var l = scores.length;
      if (l == 0) {
	scores.push(0);
	l++;
      }
      while (l < 20) {
	scores.push(scores[l - 1]);
	l++;
      }
    }

    function collapse_scores(scores) {
      var l = scores.length;
      while (l > 1 && scores[l - 1] === scores[l - 2]) {
	scores.pop();
	l--;
      }
    }

    function zones_to_bool(zones) {
      var zones_bool = [];
      angular.forEach(zones, function(class_zones) {
	var class_zones_bool = [];
	if (class_zones) {
	  angular.forEach(class_zones, function(zone) {
	    class_zones_bool[zone - 1] = true;
	  });
	}
	zones_bool.push(class_zones_bool);
      });

      // Alle Werte auffüllen, sonst funktioniert der spätere Vergleich zwischen
      // old_event und event nicht immer.
      var classes = $scope.event.classes.length;
      var zones = $scope.zones_list.length;
      for (var class_ = 1; class_ <= classes; class_++) {
	if (!zones_bool[class_ - 1])
	  zones_bool[class_ - 1] = [];
	for (var zone = 1; zone <= zones; zone++) {
	  if (zones_bool[class_ - 1][zone - 1] !== true)
	    zones_bool[class_ - 1][zone - 1] = false;
	}
      }
      return zones_bool;
    }

    function zones_from_bool(zones_bool) {
      var zones = [];
      angular.forEach(zones_bool, function(class_zones_bool) {
	var class_zones = [];
	for (var zone = 1; zone <= class_zones_bool.length; zone++) {
	  if (class_zones_bool[zone - 1])
	    class_zones.push(zone);
	}
	zones.push(class_zones);
      });
      return zones;
    }

    function max_zone(event) {
      var max_zone = min_zones;
      angular.forEach(event.zones, function(zones) {
	if (zones) {
	  angular.forEach(zones, function(zone) {
	    if (max_zone < zone)
	      max_zone = zone;
	  });
	}
      });
      max_zone++;
      return max_zone;
    }

    function zones_list(max_zone) {
      var zones_list = [];
      for (var zone = 1; zone < max_zone; zone++)
	zones_list.push(zone);
      zones_list.push('…');
      return zones_list;
    };

    $scope.modified = function() {
      try {
	angular.forEach($scope.features, function(value, key) {
	  if (!value)
	    delete $scope.features[key];
	});
	return !(angular.equals($scope.old_event, $scope.event) &&
		 angular.equals($scope.old_zones, $scope.zones) &&
		 angular.equals($scope.features_alt, $scope.features));
      } catch (_) {
	return false;
      }
    }

    $scope.event_name = function(event) {
      return event_name($scope, event);
    };

    $scope.event_visible = function(event) {
      return !event.closed;
    };

    function normalize_future_events(event) {
      var future_events = event.future_events.sort(function(a, b) {
	a = a.date;
	b = b.date;
	var cmp = (a == null) - (b == null);
	return cmp || (a < b ? -1 : (a > b ? 1 : 0));
      });
      event.future_events = future_events;
      var n, future_event;
      for (n = 0; n < future_events.length - 1; n++) {
	future_event = future_events[n];
	if (future_event.date == null && future_event.location == null)
	  future_events.splice(n, 1);
      }
      future_event = future_events[future_events.length - 1];
      if (!future_event || future_event.date != null || future_event.location != null) {
	future_events.push({
	  fid: null,
	  active: false,
	  date: null,
	  title: null,
	  series: null
	});
      }
    }

    $scope.future_name = function(future_event) {
      var name = future_event.location;
      if (future_event.date)
	name += ' am ' + $scope.$eval('date | date:"d.M."', future_event);
      if (future_event.series)
	name += ' (' + future_event.series + ')';
      return name;
    }

    function assign_event(event, modify) {
      if (event === undefined)
	event = $scope.old_event;
      if (event === null) {
	event = {
	  title: null,
	  location: null,
	  type: null,
	  enabled: true,
	  classes: [],
	  card_colors: [],
	  zones: [],
	  features: {
	    number: true,
	    'class': true,
	    last_name: true,
	    first_name: true,
	    start: true,
	    skipped_zones: true,
	  },
	  rankings: [],
	  scores: [],
	  equal_marks_resolution: 0,
	  insurance: 0,
	  future_events: [],
	};
	$scope.internal.base = null;
	$scope.internal.reset = null;
      }
      $scope.old_type = event.type;

      $scope.zones_list = zones_list(max_zone(event));
      for (var class_ = 1; class_ <= 15; class_++) {
	if (!event.classes[class_ - 1]) {
	  event.classes[class_ - 1] = {
	    ranking_class: class_,
	    order: class_
	  };
        }
	if (!event.zones[class_ - 1])
	  event.zones[class_ - 1] = [];
      }
      $scope.class_order = event.classes.reduce(function(indexes, value, index) {
	indexes.push(index);
	return indexes;
      }, []).sort(function(a, b) {
	return event.classes[a].order - event.classes[b].order;
      });
      for (var ranking = 1; ranking <= 4; ranking++)
	if (!event.rankings[ranking - 1])
	  event.rankings[ranking - 1] = {
	      name: null,
	  };

      expand_scores(event.scores);
      normalize_future_events(event);
      $scope.event = event;
      $scope.zones = zones_to_bool(event.zones);
      $scope.features = event.features;
      if (!modify) {
	$scope.old_event = angular.copy(event);
	$scope.old_zones = angular.copy($scope.zones);
	$scope.features_alt = angular.copy($scope.features);
      }
    }

    function swap_classes(index) {
      var class_order = $scope.class_order;
      var a = class_order[index - 1], b = class_order[index];
      class_order[index - 1] = b;
      class_order[index] = a;

      var classes = $scope.event.classes;
      tmp = classes[a].order;
      classes[a].order = classes[b].order;
      classes[b].order = tmp;
    }

    $scope.class_up = function(index) {
      if (index > 0)
	swap_classes(index);
    };

    $scope.class_down = function(index) {
      if (index < $scope.class_order.length - 1)
	swap_classes(index + 1);
    };

    $scope.save = function() {
      if ($scope.busy)
	return;
      /* FIXME: Wenn Klasse schon Starter hat, muss sie weiterhin starten. (Verweis auf Starterliste.) */
      var event = angular.copy($scope.event);
      event.zones = zones_from_bool($scope.zones);
      event.features = $scope.features;
      collapse_scores(event.scores);

      function trim_array(array) {
	while (array.length && array[array.length - 1] == null)
	  array.pop()
      }

      event.rankings.forEach(function(ranking, index) {
	if (ranking.name === null || ranking.name === '')
	  delete event.rankings[index];
      });
      trim_array(event.rankings);

      var future_events = event.future_events;
      var future_event = future_events[future_events.length - 1];
      if (future_event &&
	  future_event.date == null &&
	  future_event.location == null &&
	  future_event.series == null)
	future_events.pop();

      $scope.busy = true;
      var event_is_new = !event.id;
      var request;
      if (event_is_new) {
	var params = {};
	if ($scope.internal.reset)
	  params.reset = $scope.internal.reset;
	request = $http.post('/api/event', event, {params: params});
      } else {
	request = $http.put('/api/event/' + event.id, event);
      }
      request
	.then(function(response) {
	  let event = response.data;
	  assign_event(event);
	  var path = '/event/' + event.id;
	  if (!event_is_new)
	    path = path + '/settings';
	  if (path != $location.path()) {
	    $location.path(path).replace();
	    /* FIXME: Wie Reload verhindern? */
	  }
	})
	.catch(network_error)
	.finally(function() {
	  delete $scope.busy;
	});
    };

    $scope.discard = function() {
      if ($scope.busy)
	return;
      assign_event(undefined);
    }

    $scope.keydown = function(event) {
      if (event.which == 13 &&
	  (document.activeElement.tagName != "TEXTAREA" || event.ctrlKey)) {
	$timeout(function() {
	  if ($scope.modified())
	    $scope.save();
	});
      } else if (event.which == 27) {
	$timeout(function() {
	  if ($scope.modified())
	    $scope.discard();
	});
      }
    };

    warn_before_unload($scope, $scope.modified);

    if (events) {
      //events.reverse();
      $scope.events = events;

      function unique_title(title, events) {
	var vergeben = {};
	var n = 1;
	angular.forEach(events, function(event) {
	  vergeben[event.title] = true;
	});
	while (title in vergeben) {
	  title = title.replace(/ \(Kopie( \d+)?\)$/, '');
	  title += ' (Kopie' + (n == 1 ? '' : ' ' + n) + ')';
	  n++;
	}
	return title;
      }

      $scope.$watch('event.base', function() {
	$scope.internal.base = null;
	$scope.internal.reset = null;
	$scope.event.base_fid = null;
	var base = $scope.event.base;
	if (base == null)
	  return;

	var id = events.find(function(event) {
	  return event.tag == base;
	}).id;

	if (id != null) {
	  $http.get('/api/event/' + id)
	    .then(function(response) {
	      let event = response.data;
	      delete event.id;
	      $scope.unique_title =
		unique_title(event.title, $scope.events);
	      event.registration_ends = null;
	      event.base = base;
	      let future_events = angular.copy(event.future_events);
	      $scope.future_events = future_events;
	      event.base_fid = null;
	      if (future_events.length)
		event.base_fid = future_events[0].fid;
	      assign_event(event, true);
	      $scope.internal.reset = 'register';
	      watch_base_fid();
	    })
	    .catch(network_error);

	  $http.get('/api/event/' + base + '/as-base')
	    .then(function(response) {
	      $scope.internal.base = response.data;
	    });
	} else
	  assign_event(null);
      });

      $scope.future_event_active = function(fid) {
	var future_event = $scope.future_events.find(
	  function(future_event) {
	    return future_event.fid == fid;
	  });
	return future_event && future_event.active;
      };

      function watch_base_fid(fid) {
	var event = $scope.event;
	if (!event || !$scope.future_events)
	  return;

	if (fid == null) {
	  event.title = $scope.unique_title;
	  event.date = $scope.$eval('today | date:"yyyy-MM-dd"', {today: Date.now()});
	} else {
	  var future_event = $scope.future_events.find(
	    function(future_event) {
	      return future_event.fid == fid;
	    }) || {};
	  if (future_event.location) {
	    event.title = future_event.location + ' am ' + $scope.$eval('date | date:"d. MMMM"', future_event);
	    event.location = future_event.location;
	  }
	  if (future_event.date)
	    event.date = future_event.date;
	}
	event.future_events =
	  angular.copy($scope.future_events).reduce(
	    function(future_events, future_event) {
	      if (future_event.fid != fid) {
		future_events.push(future_event);
		if (event.date && future_event.date) {
		  var event_date = parse_timestamp(event.date);
		  var future_event_date = parse_timestamp(future_event.date);
		  var diff = parse_timestamp(future_event.date) -
			     parse_timestamp(event.date);
		  if (fid)
		    future_event.active =
		      diff >= 0 &&
		      diff <= 24 * 60 * 60 * 1000;
		}
	      }
	      return future_events;
	    }, []);
	$scope.internal.reset = 'register';
      }
      $scope.$watch('event.base_fid', watch_base_fid);
    }

    $scope.type_blur = function() {
      var event = $scope.event;
      var type = $scope.event.type;
      if (type === $scope.old_type)
	return;
      $scope.old_type = type;
      if (type) {
	angular.forEach(event.classes, function(class_, index) {
	  if (index != 4) {
	    class_.ranking_class =
	      (type == 'otsv' &&
	       index >= 10 && index <= 12) ? index - 9 :
	      (type == 'otsv+amf' &&
	       index == 0) ? 11 :
	      index + 1;
	    class_.no_ranking1 =
	      (type == 'otsv' &&
	       (index == 0 || (index >= 10 && index <= 12)));
	  }
	  class_.non_competing =
	    (type == 'otsv+amf' && index == 0);
	});
	if (type == 'otsv' || type == 'otsv+amf') {
	  $scope.features.start_time = $scope.features.finish_time =
	    (type == 'otsv+amf');
	}
      }
    };

    $scope.blur_ranking_class = function(class_, event) {
      if (event.target.value === class_ + '')
	event.target.value = '';
    };

    $scope.$watch('event.classes', function() {
      var class_active = {};
      angular.forEach($scope.event.classes, function(class_) {
	class_active[class_.ranking_class] = true;
      });
      $scope.class_active = class_active;
    }, true);

    function zone_active(zone) {
      for (var class_ = 1; class_ <= $scope.zones.length; class_++)
	if ($scope.zones[class_ - 1][zone - 1])
	  return true;
      return false;
    }

    $scope.$watch('zones', function() {
      var zones = $scope.zones;
      var max_zone = zones[0].length;
      var old_max_zone = max_zone;
      if (zone_active(max_zone)) {
	angular.forEach(zones, function(zones) {
	  zones.push(false);
	});
	max_zone++;
      } else {
	while (max_zone > min_zones + 1 &&
	       !zone_active(max_zone - 1)) {
	  angular.forEach(zones, function(zones) {
	    zones.pop();
	  });
	  max_zone--;
	}
      }
      if (old_max_zone != max_zone)
	$scope.zones_list = zones_list(max_zone);
    }, true);

    $scope.$watch('event.future_events', function() {
      normalize_future_events($scope.event);
    }, true);

    var main_ranking = $scope.internal.main_ranking;
    for (let n in main_ranking) {
      main_ranking[n] = ($scope.event.main_ranking == +n + 1);
      $scope.$watch('internal.main_ranking[' + n + ']', function(value, old_value) {
	var event = $scope.event;
	if (value != old_value) {
	  if (value) {
	    for (let m in main_ranking) {
	      if (main_ranking[m] && m != n)
		main_ranking[m] = false;
	    }
	    event.main_ranking = +n + 1;
	  } else {
	    if (!$scope.internal.main_ranking[event.main_ranking - 1])
	      event.main_ranking = null;
	  }
	}
      });
    }

    $scope.nonsplit_rankings = function() {
      var nonsplit_rankings = [];
      var rankings = $scope.event.rankings;
      for (var n = 0; n < rankings.length; n++) {
	var ranking = rankings[n];
	if (ranking.name != null && !ranking.split)
	  nonsplit_rankings.push(n + 1);
      }
      return nonsplit_rankings;
    }

    $scope.$watch('event.rankings', function() {
      var event = $scope.event;
      var rankings = $scope.nonsplit_rankings();
      var main_ranking = $scope.internal.main_ranking;
      if (rankings.length == 0) {
	for (let n in main_ranking) {
	  if (main_ranking[n])
	    main_ranking[n] = false;
	}
      } else if (rankings.indexOf(event.main_ranking) == -1)
	main_ranking[rankings[0] - 1] = true;
    }, true);

    function composed_title(location, date) {
      if (location == null)
	return null;
      if (date == null)
	return location;
      return location + ' am ' + $scope.$eval('date | date:"d. MMMM yyyy"', { date: date});
    }

    $scope.$watch('event.date', function(new_value, old_value) {
      var event = $scope.event;
      if (event.title == null ||
	  event.title == composed_title(event.location, old_value))
	event.title = composed_title(event.location, new_value);
    });

    $scope.$watch('event.location', function(new_value, old_value) {
      var event = $scope.event;
      if (event.title == null ||
	  event.title == composed_title(old_value, event.date))
	event.title = composed_title(new_value, event.date);
    });
  }];

settingsController.resolve = {
  event: [
    '$q', '$http', '$route',
    function($q, $http, $route) {
      if ($route.current.params.id !== undefined)
	return http_request($q, $http.get('/api/event/' + $route.current.params.id));
      else
	return null;
    }],
  events: [
    '$q', '$http', '$route',
    function($q, $http, $route) {
      if ($route.current.params.id === undefined)
	return http_request($q, $http.get('/api/events'));
    }]
};
