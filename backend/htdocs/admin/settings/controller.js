'use strict;'

var settingsController = [
  '$scope', '$http', '$timeout', '$location', 'event', 'events',
  function ($scope, $http, $timeout, $location, event, events) {
    $scope.SYNC_TARGET = SYNC_TARGET;
    $scope.$root.context(event ? event.rankings[0].title : 'Neue Veranstaltung');
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

    $scope.event_name = event_name;
    $scope.veranstaltung_sichtbar = function(event) {
      return !event.abgeschlossen;
    };

    function assign_event(event, modify) {
      if (event === undefined)
	event = $scope.old_event;
      if (event === null) {
	event = {
	  version: 0,
	  type: null,
	  enabled: true,
	  classes: [],
	  card_colors: [],
	  zones: [],
	  features: ['number', 'class', 'last_name', 'first_name',
		     'start', 'skipped_zones'],
	  rankings: [{title: 'Neue Veranstaltung'}],
	  scores: [],
	  equal_marks_resolution: 0,
	  insurance: 0,
	  reset: 'registration',
	  base: { id: null }
	};
      }
      $scope.old_type = event.type;

      $scope.zones_list = zones_list(max_zone(event));
      for (var class_ = 1; class_ <= 15; class_++) {
	if (!event.classes[class_ - 1])
	  event.classes[class_ - 1] = {ranking_class: class_};
	if (!event.zones[class_ - 1])
	  event.zones[class_ - 1] = [];
      }
      for (var ranking = 1; ranking <= 4; ranking++)
	if (!event.rankings[ranking - 1])
	  event.rankings[ranking - 1] = {
	      title: null,
	      subtitel: null,
	      bezeichnung: null,
	  };

      if (event.date === undefined)
	event.date = $scope.$eval('today | date:"yyyy-MM-dd"', {today: Date.now()});
      expand_scores(event.scores);
      $scope.event = event;
      $scope.zones = zones_to_bool(event.zones);
      $scope.features = features_from_list(event);
      if (!modify) {
	$scope.old_event = angular.copy(event);
	$scope.old_zones = angular.copy($scope.zones);
	$scope.features_alt = angular.copy($scope.features);
      }
    }

    $scope.save = function() {
      if ($scope.busy)
	return;
      /* FIXME: Wenn Klasse schon Starter hat, muss sie weiterhin starten. (Verweis auf Starterliste.) */
      var event = angular.copy($scope.event);
      event.zones = zones_from_bool($scope.zones);
      event.features = features_to_list($scope.features);
      collapse_scores(event.scores);
      $scope.busy = true;
      var veranstaltung_ist_neu = !event.id;
      save_event($http, event.id, event).
	success(function(event) {
	  assign_event(event);
	  var path = '/event/' + event.id;
	  if (!veranstaltung_ist_neu)
	    path = path + '/einstellungen';
	  if (path != $location.path()) {
	    $location.path(path).replace();
	    /* FIXME: Wie Reload verhindern? */
	  }
	}).
	error(network_error).
	finally(function() {
	  delete $scope.busy;
	});
    };

    $scope.discard = function() {
      if ($scope.busy)
	return;
      assign_event(undefined);
    }

    $scope.keydown = function(event) {
      if (event.which == 13) {
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

      function eindeutiger_titel(title, events) {
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

      $scope.event.base = { id: null };
      $scope.$watch('event.base.id', function() {
	var base = $scope.event.base.id;
	if (base != null) {
	  $http.get('/api/event', {'params': {'id': base}}).
	    success(function(event) {
	      event.base = {
		tag: event.tag,
		id: event.id,
		title: event.rankings[0].title,
		anzahl_start_morgen: event.anzahl_start_morgen
	      };
	      delete event.anzahl_start_morgen;
	      delete event.id;
	      event.rankings[0].title =
		eindeutiger_titel(event.rankings[0].title,
				  $scope.events);
	      delete event.date;
	      event.dateiname = null;
	      event.reset = 'nennbeginn';
	      assign_event(event, true);
	    }).
	    error(network_error);
	} else
	  assign_event(null);
      });
    }

    $scope.type_blur = function() {
      var event = $scope.event;
      var type = $scope.event.type;
      if (type === $scope.old_type)
	return;
      $scope.old_type = type;
      if (type) {
	angular.forEach(event.classes, function(class_, index) {
	  class_.ranking_class =
	    ((type === 'otsv2014' ||
	      type === 'otsv2016') &&
	     index >= 10 && index <= 12) ? index - 9 :
	    ((type === 'otsv+osk2014' ||
	      type === 'otsv+osk2016') &&
	     index == 0) ? 11 : index + 1;
	  class_.no_ranking1 =
	    ((type === 'otsv2014' || type === 'otsv+osk2014') &&
	     index == 6) ||
	    ((type === 'otsv2014' ||
	      type === 'otsv2016') &&
	     (index == 0 || (index >= 10 && index <= 12)));
	  class_.non_competing =
	    ((type === 'otsv+osk2014' ||
	      type === 'otsv+osk2016') && index == 0);
	});
	if (type === 'otsv2014' || type === 'otsv+osk2014' ||
	    type === 'otsv2016' || type === 'otsv+osk2016') {
	  $scope.features.start_time = $scope.features.finish_time =
	    (type === 'otsv+osk2014' || type === 'otsv+osk2016');
	  $scope.features.start_tomorrow =
	    (type === 'otsv2014' || type === 'otsv2016');
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
