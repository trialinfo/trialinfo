'use strict';

var marksController = [
  '$scope', '$sce', '$http', '$timeout', '$route', '$location', 'setFocus', 'riderName', 'riderInfo', 'event',
  function ($scope, $sce, $http, $timeout, $route, $location, setFocus, riderName, riderInfo, event) {
    $scope.$root.context(event.title);

    $scope.event = event;
    $scope.features = event.features;
    $scope.starting_classes = starting_classes(event);
    $scope.zone_wise_entry = false;

    $scope.flip_zone_wise_entry = function() {
      $scope.zone_wise_entry = !$scope.zone_wise_entry;
      focus_marks();
    };

    function ranking_class(rider) {
      if (!rider || !rider['class'])
	return null;
      return event.classes[rider['class'] - 1].ranking_class;
    }

    /* Um die Maske sinnvoll darstellen zu können, Felder für die befahrenen
     * Sektionen und Runden der ersten startenden Klasse anzeigen.  Das
     * stimmt zumindest bei allen Veranstaltungen, bei denen alle Klassen
     * die selben Sektionen und Runden befahren.  */
    for (var class_ = 1; class_ < event.zones.length + 1; class_++) {
      var rc = event.classes[class_ - 1].ranking_class;
      if (event.zones[rc - 1]) {
	$scope.ranking_class = rc;
	break;
      }
    }

    // Einzelpunkte auffüllen, sonst funktioniert der Vergleich zwischen
    // old_rider und rider nicht.
    function fill_marks_per_zone(rider) {
      try {
	var rc = ranking_class(rider);
	var marks_per_zone = rider.marks_per_zone;
	var rounds = event.classes[rc - 1].rounds;
	for (var n = 0; n < rounds; n++) {
	  if (marks_per_zone[n] == null)
	    marks_per_zone[n] = [];
	  angular.forEach(event.zones[rc - 1],
	    function(zone) {
	      if (marks_per_zone[n][zone - 1] === undefined)
		marks_per_zone[n][zone - 1] = null;
	    });
	}
      } catch(_) {}
    };

    function update_url() {
      var number;
      if ($scope.rider)
	number = $scope.rider.number;
      if ($location.search().number !== number) {
	var search = {};
	if (number)
	  search.number = number;
	$scope.ignoreRouteUpdate = true;
	$location.search(search).replace();
      }
    }

    function clear_search_result() {
      delete $scope.riders_list;
    }

    function assign_rider(rider) {
      if ($scope.form)
	$scope.form.$setPristine();
      if (rider) {
	fill_marks_per_zone(rider);
	$scope.rider = rider;
	$scope.ranking_class = ranking_class(rider);
	calculate_marks();
      } else
	$scope.rider = undefined;
      $scope.old_rider = angular.copy($scope.rider);
      $scope.search_term = '';

      update_url();
    }

    function focus_marks(current_zone) {
      try {
	var rider = $scope.rider;
	if (rider.start && !rider.failure) {
	  var rc = ranking_class(rider);
	  var zones = current_zone != null ? [current_zone] : event.zones[rc - 1];
	  var marks_per_zone = rider.marks_per_zone;

	  function try_to_focus(round, zone) {
	    var marks = marks_per_zone[round - 1][zone - 1];
	    if (marks == null && !zone_skipped(rc, round, zone)) {
	      setFocus('#marks_' + round + '_' + zone);
	      return true;
	    }
	  }

	  var rounds = event.classes[rc - 1].rounds;
	  if ($scope.zone_wise_entry) {
	    for (var index = 0; index < zones.length; index++) {
	      for (var round = rider.rounds || 1; round <= rounds; round++) {
		if (try_to_focus(round, zones[index]))
		  return;
	      }
	    }
	  } else {
	    for (var round = rider.rounds || 1; round <= rounds; round++) {
	      for (var index = 0; index < zones.length; index++) {
		if (try_to_focus(round, zones[index]))
		  return;
	      }
	    }
	  }
	}
      } catch (_) {};
    }

    function load_rider(promise, current_zone) {
      promise
	.then(function(response) {
	  let rider = response.data;
	  if (Object.keys(rider).length) {
	    assign_rider(rider);
	    focus_marks(current_zone);
	  }
	})
	.catch(network_error);
    }

    $scope.load_rider = function(number) {
      var params = {};
      load_rider($http.get('/api/event/' + event.id + '/rider/' + number, {params: params}));
    };

    $scope.load_first_rider = function() {
      var params = {
	start: 1
      };
      load_rider($http.get('/api/event/' + event.id + '/first-rider', {params: params}));
      clear_search_result();
    }

    $scope.load_previous_rider = function() {
      var params = {
	start: 1
      };
      load_rider($http.get('/api/event/' + event.id + '/previous-rider/' + $scope.rider.number, {params: params}));
      clear_search_result();
    }

    $scope.load_next_rider = function(current_zone) {
      var params = {
	start: 1
      };
      if (current_zone != null)
	params.zone = current_zone;
      load_rider($http.get('/api/event/' + event.id + '/next-rider/' + $scope.rider.number, {params: params}), current_zone);
      clear_search_result();
    }

    $scope.load_last_rider = function() {
      var params = {
	start: 1
      };
      load_rider($http.get('/api/event/' + event.id + '/last-rider', {params: params}));
      clear_search_result();
    }

    $scope.find_rider = function() {
      if ($scope.search_term != '') {
	var params = {
	  term: $scope.search_term,
	  active: 1
	};
	$http.get('/api/event/' + event.id + '/find-riders', {'params': params})
	  .then(function(response) {
	    let riders_list = response.data;
	    /*riders_list = riders_list.filter(function(rider) {
	      return rider.number !== null && rider['class'] !== null;
	    });*/
	    if (riders_list.length == 1) {
	      clear_search_result();
	      $scope.load_rider(riders_list[0].number);
	    } else {
	      $scope.riders_list = riders_list;
	      if (riders_list.length == 0)
		      assign_rider(undefined);
	    }
	  })
	  .catch(network_error);
      } else {
	clear_search_result();
      }
    };

    $scope.current_round = function(rider) {
      if (rider && rider.start) {
	var round = rider.rounds || 1;
	var rc = ranking_class(rider);
	if (!rc)
	  return null;
	var zones = event.zones[rc - 1] || [];
	for (var index = 0; index < zones.length; index++) {
	  var zone = zones[index];
	  var marks = rider.marks_per_zone[round - 1][zone - 1];
	  if ((marks == null) && !zone_skipped(rc, round, zone))
	    return round;
	}
	if (round < event.classes[rc - 1].rounds)
	  return round + 1;
      }
    }

    $scope.card_color = function() {
      var rider = $scope.rider;
      if (rider && !($scope.rider_does_not_start() || rider.failure)) {
	var round = $scope.current_round(rider);
	if (round)
	  return event.card_colors[round - 1];
      }
    };

    $scope.modified = function() {
      return !angular.equals($scope.old_rider, $scope.rider);
    };

    function zone_skipped(class_, round, zone) {
      try {
	return $scope.event.skipped_zones[class_][round][zone];
      } catch (_) {
	return false;
      }
    }

    let year_of_event = (date_of_event(event)).getFullYear();

    function calculate_marks() {
      var rider = $scope.rider;
      if (rider) {
	rider.additional_marks = null;

	if (event.type == 'otsv-acup' && !rider.group) {
	  if (rider.class >= 8 && rider.class <= 11) {
	   let year = rider.year_of_manufacture || year_of_event;
	   let m = Math.trunc(Math.max(0, (year - 1987 + 3) / 3));
	   if (m)
		   rider.additional_marks = m;
	  }
	}

	rider.marks = null;
	if (rider.additional_marks != null)
	  rider.marks += rider.additional_marks;
	if (rider.penalty_marks != null)
	  rider.marks += rider.penalty_marks;

	if (rider.group) {
	  for (round = 1; round <= rider.marks_per_zone.length; round++) {
	    rider.marks += rider.marks_per_round[round - 1];
	  }
	} else {
	  rider.marks_per_round = [];
	  if (rider.start) {
	    var rc = ranking_class(rider);
	    var zones = event.zones[rc - 1] || [];
	    rider.rounds = 0;
	    rider.marks_distribution = [0, 0, 0, 0, 0, 0];
	    if (event.uci_x10)
	      rider.marks_distribution.push(0);
	    delete $scope.zones_skipped;
	    var skipped = false;
	    var round;
	    for (round = 1; round <= rider.marks_per_zone.length; round++) {
	      var marks_in_round = 0;
	      var round_used = false;
	      for (var index = 0; index < zones.length; index++) {
		var zone = zones[index];
		if (!zone_skipped(rc, round, zone)) {
		  var marks = rider.marks_per_zone[round - 1][zone - 1];
		  if (marks == null)
		    skipped = true;
		  else if (!skipped) {
		    let actual_marks = (marks == -1) ? event.marks_skipped_zone : marks;
		    marks_in_round += actual_marks;
		    let index;
		    if (event.uci_x10) {
		      if (actual_marks % 10 == 0 && actual_marks >= 0 && actual_marks <= 60)
			index = actual_marks / 10;
		    } else {
		      if (actual_marks >= 0 && actual_marks <= 5)
			index = actual_marks;
		    }
		    if (index != null)
		      rider.marks_distribution[index]++;
		    round_used = true;
		  }
		}
	      }
	      if (round_used) {
		rider.marks_per_round[round - 1] = marks_in_round;
		rider.marks += marks_in_round;
		rider.rounds = round;
	      }
	    }

	    var was_null;
	    function check_skipped(round, zone) {
	      if (!zone_skipped(rc, round, zone)) {
		var marks = rider.marks_per_zone[round - 1][zone - 1];
		if (marks == null)
		  was_null = true;
		else
		  return was_null;
	      }
	    }

	    var rounds = event.classes[rc - 1].rounds;
	    if ($scope.zone_wise_entry) {
	      check:
	      for (var index = 0; index < zones.length; index++) {
		for (round = 1; round <= rounds; round++) {
		  if (check_skipped(round, zones[index])) {
		    $scope.zones_skipped = true;
		    break check;
		  }
		}
	      }
	    } else {
	      check:
	      for (round = 1; round <= rounds; round++) {
		for (var index = 0; index < zones.length; index++) {
		  if (check_skipped(round, zones[index])) {
		    $scope.zones_skipped = true;
		    break check;
		  }
		}
	      }
	    }
	  } else {
	    rider.rounds = null;
	    rider.marks_distribution = [null, null, null, null, null, null];
	    if (event.uci_x10)
	      rider.marks_distribution.push(null);
	  }
	}
      }
    }

    $scope.class_may_start = function(class_) {
      return class_may_start(class_, event);
    }

    $scope.rider_does_not_start = function() {
      return rider_does_not_start($scope.rider, event);
    }

    $scope.$watch('rider.marks_per_zone', function() {
      calculate_marks();
    }, true);
    $scope.$watch('rider.penalty_marks', function() {
      calculate_marks();
    });

    function get_current_zone() {
      if ($scope.zone_wise_entry) {
	var element = document.activeElement;
	if (element && element.getAttribute('marks') != null) {
	  var id = element.getAttribute('id');
	  if (id != null) {
	    var match = id.match(/^marks_\d+_(\d+)$/);
	    if (match)
	      return match[1];
	  }
	}
      }
    }

    $scope.save = function() {
      if ($scope.busy)
	return;

      /* FIXME: Wenn Start, dann muss die Klasse starten. */
      $scope.busy = true;
      var rider = $scope.rider;
      var params = {
	event_version: event.version
      };
      var current_zone = get_current_zone();
      $http.put('/api/event/' + event.id + '/rider/' + rider.number, rider,
		{params: params})
	.then(function(response) {
	  assign_rider(response.data);
	  setFocus('#search_term');
	  if ($scope.zone_wise_entry)
	    $scope.load_next_rider(current_zone);
	})
	.catch(network_error)
	.finally(function() {
	  delete $scope.busy;
	});
    };

    $scope.discard = function() {
      if ($scope.busy)
	return;
      /* FIXME: Wenn Fahrer geladen, neu laden um Versionskonflikte aufzulösen. */
      assign_rider($scope.old_rider);
    };

    $scope.rounds_list = function() {
      try {
	var rounds = 0;
	var rider = $scope.rider;
	if (rider && rider.group) {
	  angular.forEach(rider.classes, function(class_) {
	    var rc = event.classes[class_ - 1].ranking_class;
	    var r = event.classes[rc - 1].rounds;
	    rounds = Math.max(rounds, r);
	  });
	} else {
	  var rc = $scope.ranking_class;
	  rounds = event.classes[rc - 1].rounds;
	}
	var rounds_list = [];
	for (var n = 1; n <= rounds; n++)
	  rounds_list.push(n);
	return rounds_list;
      } catch (_) { }
    };

    $scope.zones_list = function() {
      var rider = $scope.rider;
      if (!rider || !rider.group) {
	var rc = $scope.ranking_class;
	return event.zones[rc - 1];
      }

      var zones = {};
      angular.forEach(rider.classes, function(class_) {
	var rc = event.classes[class_ - 1].ranking_class;
	angular.forEach(event.zones[rc - 1], function(zone) {
	  zones[zone] = true;
	});
      });
      return Object.keys(zones)
        .map(function(key) { return +key; })
	.sort((a, b) => a - b);
    };

    $scope.class_symbol = function() {
      if ($scope.ranking_class != null) {
	var color = event.classes[$scope.ranking_class - 1].color;
	if (color) {
	  return $sce.trustAsHtml(
	    `<span style="display:inline-block; width:8pt; height:8pt; background-color:${color}"></span>`
	  );
	}
      }
    };

    $scope.riderName = riderName;
    $scope.riderInfo = riderInfo;

    $scope.marks_tab_to = function(round, index) {
      var rider = $scope.rider;
      if (rider) {
	var rc = ranking_class(rider);
	var zones = event.zones[rc - 1];
	if ($scope.zone_wise_entry) {
	  while (round++ < event.classes[rc - 1].rounds) {
	    if (!zone_skipped(rc, round, zones[index]))
	      return 'marks_' + round + '_' + zones[index];
	  }
	} else {
	  while (++index < zones.length) {
	    if (!zone_skipped(rc, round, zones[index]))
	      return 'marks_' + round + '_' + zones[index];
	  }
	}
      }
    };

    $scope.marks_keydown = function(ev, round, index) {
      var rider = $scope.rider;
      if (rider) {
	function move_to(round, index) {
	  var rc = ranking_class(rider);
	  var zones = event.zones[rc - 1];
	  var rounds = event.classes[rc - 1].rounds;
	  if (index >= 0 && index < zones.length &&
	      round >= 1 && round <= rounds) {
	    setFocus('#marks_' + round + '_' + zones[index]);
	    ev.preventDefault();
	  }
	}

	function fully_selected(element) {
	  return !element ||
		 (element.selectionStart == 0 &&
		  element.selectionEnd == element.value.length);
	}

	function cursor_position(element) {
	  if (element && element.selectionStart == element.selectionEnd)
	    return element.selectionStart;
	}

	function value_length(element) {
	  if (element)
	    return element.value.length;
	}

	if (ev.key == 'ArrowLeft') {
	  if (fully_selected(ev.target) ||
	      cursor_position(ev.target) == 0)
	    move_to(round, index - 1);
	} else if (ev.key == 'ArrowRight') {
	  if (fully_selected(ev.target) ||
	      cursor_position(ev.target) == value_length(ev.target))
	    move_to(round, index + 1);
	} else if (ev.key == 'ArrowUp') {
	  move_to(round - 1, index);
	} else if (ev.key == 'ArrowDown') {
	  move_to(round + 1, index);
	}
      }
    };

    $scope.over_time = function() {
      try {
	var rider = $scope.rider;
	var rc = ranking_class(rider);
	var gesamt = event.classes[rc - 1].riding_time;
	if (rider.start_time && rider.finish_time && gesamt) {
	  var start_time = rider.start_time.match(/^(\d\d):(\d\d):(\d\d)$/);
	  start_time = (+start_time[1] * 60 + +start_time[2]) * 60 + +start_time[3];
	  var finish_time = rider.finish_time.match(/^(\d\d):(\d\d):(\d\d)$/);
	  finish_time = (+finish_time[1] * 60 + +finish_time[2]) * 60 + +finish_time[3];
	  gesamt = gesamt.match(/^(\d\d):(\d\d):(\d\d)$/);
	  gesamt = (+gesamt[1] * 60 + +gesamt[2]) * 60 + +gesamt[3];
	  var riding_time = finish_time - start_time;
	  if (riding_time < 0)
	    riding_time += 24 * 60 * 60;
	  riding_time -= gesamt;
	  if (riding_time > 0) {
	    var isotime = ('0' + Math.floor(riding_time / (60 * 60))).slice(-2) + ':' +
			  ('0' + Math.floor((riding_time / 60) % 60)).slice(-2) + ':' +
			  ('0' + (riding_time % 60)).slice(-2);
	    return '+' + format_iso_time($scope, isotime, 'H:mm', 'H:mm:ss');
	  }
	}
      } catch (_) {}
    };

    $scope.keydown = function(event) {
      if (event.which == 13) {
	event.preventDefault();
	$timeout(function() {
	  if ($scope.modified()) {
	    if ($scope.form.$valid)
	      $scope.save();
	  } else {
	    var current_zone = get_current_zone();
	    if (current_zone)
	      $scope.load_next_rider(current_zone);
	  }});
      } else if (event.which == 27) {
	event.preventDefault();
	$timeout(function() {
	  if ($scope.modified())
	    $scope.discard();
	});
      }
    };

    warn_before_unload($scope, $scope.modified);

    $scope.$on('$routeUpdate', function() {
      if ($scope.ignoreRouteUpdate) {
	delete $scope.ignoreRouteUpdate;
	return;
      }
      var number = $location.search().number;
      var current_number;
      if ($scope.rider)
	current_number = $scope.rider.number;
      if (current_number !== number) {
	if (number !== undefined)
	  $scope.load_rider(number);
	else {
	  assign_rider(undefined);
	  clear_search_result();
	}
      }
    });
    $scope.$emit('$routeUpdate');
  }];

marksController.resolve = {
  event: [
    '$q', '$http', '$route',
    function($q, $http, $route) {
      return http_request($q, $http.get('/api/event/' + $route.current.params.id));
    }]
};

angular.module('application').controller('marksController', marksController);
