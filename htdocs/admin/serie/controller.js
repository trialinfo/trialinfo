'use strict';

var serieController = [
  '$scope', '$http', '$timeout', '$location', '$window', 'eventName', 'serie', 'events',
  function ($scope, $http, $timeout, $location, $window, eventName, serie, events) {
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

    $scope.eventName = eventName;

    $scope.event_visible = function(event) {
      return $scope.serie.closed || !event.closed;
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
      var cmp = (a == null) - (b == null);
      return cmp || (a > b ? 1 : a < b ? -1 : 0);
    }

    function normalize_classes(serie) {
      var classes = serie.classes;
      if (!classes.length)
	classes.push({ranking: 1, ranking_class: null});
      else if (classes[classes.length - 1].ranking_class !== null)
	classes.push({ranking: classes[classes.length - 1].ranking, ranking_class: null});
      else {
	for (var n = 0; n < classes.length - 1; n++)
	  if (classes[n].ranking_class === null)
	    classes = classes.splice(n, 1);
      }
      var sorted = sort_uniq(classes, function(a, b) {
	return (a.ranking_class == null) - (b.ranking_class == null) ||
	       cmp_null(a.ranking, b.ranking) ||
	       cmp_null(a.ranking_class, b.ranking_class);
      });
      if (!angular.equals(classes, sorted))
	serie.classes = sorted;
    }

    $scope.$watch('serie.classes', function() {
      try {
	normalize_classes($scope.serie);
      } catch (_) {}
    }, true);

    $scope.$watch('serie.closed', function(newval, oldval) {
      if (oldval && !newval) {
	/*
	 * Mark all events as open so that they won't disappear from the events
	 * list, and the list of visible events will stay the same.
	 */
	$scope.events.forEach(function(event) {
	  event.closed = false;
	});
      }
    });

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
      angular.forEach(serie.new_numbers, function(new_numbers) {
	if (!new_numbers.length ||
	    new_numbers[new_numbers.length - 1].number !== null) {
	  new_numbers.push({ number: null, new_number: null });
	} else {
	  for (var n = 0; n < new_numbers.length - 1; n++)
	    if (new_numbers[n].number == null) {
	      new_numbers.splice(n, 1);
	      n--;
	    }
	}
      });
    }

    function normalize_tie_break(serie) {
      var tie_break = serie.tie_break;

      if (!tie_break.length ||
	  tie_break[tie_break.length - 1].number !== null) {
	tie_break.push({ number: null, tie_break: null });
      } else {
	for (var n = 0; n < tie_break.length - 1; n++)
	  if (tie_break[n].number == null) {
	    tie_break.splice(n, 1);
	    n--;
	  }
      }
    }

    $scope.$watch('serie.new_numbers', function() {
      try {
	normalize_new_numbers($scope.serie);
      } catch (_) {}
    }, true);

    $scope.$watch('serie.tie_break', function() {
      try {
	normalize_tie_break($scope.serie);
      } catch (_) {}
    }, true);

    function new_numbers_from_api(new_numbers) {
      Object.keys(new_numbers).forEach(function(id) {
	new_numbers[id] = Object.keys(new_numbers[id])
	  .map(function(number) {
	    return {
	      number: number,
	      new_number: new_numbers[id][number]
	    };
	  });
      });
    }

    function new_numbers_to_api(new_numbers) {
      Object.keys(new_numbers).forEach(function(id) {
	new_numbers[id] = new_numbers[id].reduce(
	  function(hash, old_new) {
	    if (old_new.number)
	      hash[old_new.number] = old_new.new_number;
	    return hash;
	  }, {});
      });
    }

    function tie_break_from_api(serie) {
      var tie_break = [];
      Object.keys(serie.tie_break).sort(cmp_null)
        .forEach(function(number) {
	  tie_break.push({
	    number: +number,
	    tie_break: serie.tie_break[number]
	  });
	});
      serie.tie_break = tie_break;
    }

    function tie_break_to_api(serie) {
      serie.tie_break = serie.tie_break.reduce(
	function(hash, tie_break) {
	  if (tie_break.number)
	    hash[tie_break.number] = tie_break.tie_break;
	  return hash;
	}, {});
    }

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
	    tie_break: {}
	  };
	}
	new_numbers_from_api(serie.new_numbers);
	tie_break_from_api(serie);
	normalize_classes(serie);
	normalize_events(serie);
	normalize_new_numbers(serie);
	normalize_tie_break(serie);
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
      if (classes.length && classes[classes.length - 1].ranking_class === null)
	  classes.pop();
      new_numbers_to_api(serie.new_numbers);
      tie_break_to_api(serie);
      $scope.busy = true;
      var request;
      if (serie.serie)
	request = $http.put('/api/serie/' + serie.serie, serie);
      else
	request = $http.post('/api/serie', serie);
      request
	.then(function(response) {
	  let serie = response.data;
	  assign_serie(serie);
	  var path = '/serie/' + serie.serie;
	  if ($location.path() != path) {
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
      assign_serie(undefined);
    };

    $scope.remove = function() {
      if ($scope.busy)
	return;
      if (confirm('Veranstaltungsreihe wirklich löschen?\n\nDie Veranstaltungsreihe kann später nicht wiederhergestellt werden.')) {
	$scope.busy = true;
	var params = {};
	if ($scope.serie.version)
	  params.version = $scope.serie.version;
	$http.delete('/api/serie/' + $scope.serie.serie, {params: params})
	  .then(function() {
	    $window.history.back();
	  })
	  .catch(network_error)
	  .finally(function() {
	    delete $scope.busy;
	  });
      }
    };

    $scope.keydown = function(event) {
      if (event.which == 13) {
	event.preventDefault();
	$timeout(function() {
	  if ($scope.modified() && $scope.form.$valid)
	    $scope.save();
	});
      } else if (event.which == 27) {
	event.preventDefault();
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

angular.module('application').controller('serieController', serieController);
