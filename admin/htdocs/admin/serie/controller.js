'use strict;'

var serieController = [
  '$scope', '$http', '$timeout', '$location', '$window', 'serie', 'events',
  function ($scope, $http, $timeout, $location, $window, serie, events) {
    $scope.$root.context(serie ? serie.name : 'Neue Veranstaltungsreihe');

    var event_dates = {};
    if (events) {
      if (serie && serie.serie !== undefined) {
	angular.forEach(events, function(event) {
	  event.series = event.series.filter(function(v) {
	    return v.serie !== serie.serie;
	  });
	});
      }

      //events.reverse();
      $scope.events = events;
      angular.forEach(events, function (event) {
	event_dates[event.id] = event.date;
      });
    }
    assign_serie(serie);

    $scope.event_name = event_name;
    $scope.event_visible = function(event) {
      return $scope.serie.closed ||
	     !(event.closed || false);
    };

    function sort_uniq(array, cmp) {
      array = array.sort(cmp);
      for (var n = 0; n < array.length - 1; n++)
	if (!cmp(array[n], array[n + 1])) {
	  array.splice(n + 1, 1);
	  n--;
	}
      return array;
    }

    function cmp_null(a, b) {
      if (a === null || b === null) {
	a = (a === null);
	b = (b === null);
      }
      return a > b ? 1 : a < b ? -1 : 0;
    }

    function normalize_classes(serie) {
      var classes = serie.classes;
      if (!classes.length ||
	  classes[classes.length - 1]['class'] !== null)
	classes.push({'class': null});
      else {
	for (var n = 0; n < classes.length - 1; n++)
	  if (classes[n]['class'] === null)
	    classes = classes.splice(n, 1);
      }
      var sorted = sort_uniq(classes, function(a, b) {
	return cmp_null(a['class'], b['class']);
      });
      if (!angular.equals(classes, sorted))
	serie.classes = sorted;
    }

    $scope.$watch('serie.classes', function() {
      try {
	normalize_classes($scope.serie);
      } catch (_) {}
    }, true);

    function normalize_events(serie) {
      var events = serie.events;
      if (!events.length ||
	  events[events.length - 1] !== null)
	events.push(null);
      else {
	for (var n = 0; n < events.length - 1; n++)
	  if (events[n] === null)
	    events.splice(n, 1);
      }
      var sorted = sort_uniq(events, function (a, b) {
	return cmp_null((event_dates[a] || '9999-99-99'),
			(event_dates[b] || '9999-99-99')) ||
	       cmp_null(a, b);
      });
      if (!angular.equals(events, sorted))
	serie.events = sorted;

      var new_numbers = {};
      angular.forEach(events, function(id) {
	if (id == null)
	  return;
	if (serie.new_numbers[id])
	  new_numbers[id] = serie.new_numbers[id];
	else
	  new_numbers[id] = [];
      });
      serie.new_numbers = new_numbers;
    }

    $scope.$watch('serie.events', function() {
      try {
	normalize_events($scope.serie);
      } catch (_) {}
    }, true);

    function normalize_new_numbers(serie) {
      angular.forEach(serie.new_numbers, function(aenderungen) {
	if (!aenderungen.length ||
	    aenderungen[aenderungen.length - 1].alt !== null)
	    aenderungen.push({ alt: null, neu: null });
	else {
	  for (var n = 0; n < aenderungen.length - 1; n++)
	    if (aenderungen[n].alt == null) {
	      aenderungen.splice(n, 1);
	      n--;
	    }
	}
      });
    }

    $scope.$watch('serie.new_numbers', function() {
      try {
	normalize_new_numbers($scope.serie);
      } catch (_) {}
    }, true);

    function assign_serie(serie) {
      if (serie === undefined)
	serie = $scope.old_serie;
      else {
	if (serie === null) {
	  serie = {
	    version: 0,
	    name: 'Neue Veranstaltungsreihe',
	    classes: [],
	    events: [],
	    new_numbers: {},
	    ranking: 1
	  };
	}
	normalize_classes(serie);
	normalize_events(serie);
	normalize_new_numbers(serie);
      }
      $scope.is_new = serie.serie === undefined;
      $scope.serie = serie;
      $scope.old_serie = angular.copy(serie);
    }

    $scope.modified = function() {
      return !angular.equals($scope.old_serie, $scope.serie);
    };

    $scope.save = function() {
      if ($scope.busy)
	return;
      var serie = angular.copy($scope.serie);
      var events = serie.events;
      if (events.length && events[events.length - 1] === null)
	  events.pop();
      var classes = serie.classes;
      if (classes.length && classes[classes.length - 1]['class'] === null)
	  classes.pop();
      $scope.busy = true;
      save_serie($http, serie.serie, serie).
	success(function(serie) {
	  assign_serie(serie);
	  var path = '/serie/' + serie.serie;
	  if ($location.path() != path) {
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
      assign_serie(undefined);
    };

    $scope.remove = function() {
      if ($scope.busy)
	return;
      if (confirm('Veranstaltungsreihe wirklich löschen?\n\nDie Veranstaltungsreihe kann später nicht wiederhergestellt werden.')) {
	$scope.busy = true;
	remove_serie($http, $scope.serie.serie, $scope.serie.version).
	  success(function() {
	    $window.history.back();
	  }).
	  error(network_error).
	  finally(function() {
	    delete $scope.busy;
	  });
      }
    };

    $scope.keydown = function(event) {
      if (event.which == 13) {
	$timeout(function() {
	  if ($scope.modified() && $scope.form.$valid)
	    $scope.save();
	});
      } else if (event.which == 27) {
	$timeout(function() {
	  if ($scope.modified())
	    $scope.discard();
	});
      }
    };

    $scope.in_serie = function(event) {
      var events = $scope.serie.events;
      for (var n = 0; n < events.length; n++)
	if (event.id == events[n])
	  return true;
      return false;
    };

    warn_before_unload($scope, $scope.modified);
  }];

serieController.resolve = {
  events: [
    '$q', '$http', '$route',
    function($q, $http, $route) {
      return http_request($q, $http.get('/api/events'));
     }],
  serie: [
    '$q', '$http', '$route',
    function($q, $http, $route) {
      if ($route.current.params.serie !== undefined)
	return http_request($q, $http.get('/api/serie/' + $route.current.params.serie));
      else
	return null;
    }]
};
