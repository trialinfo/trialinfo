'use strict';

var marksController = [
  '$scope', '$sce', '$http', '$timeout', '$route', '$location', '$document', 'setFocus', 'riderName', 'riderInfo', 'classSymbol', 'event',
  function ($scope, $sce, $http, $timeout, $route, $location, $document, setFocus, riderName, riderInfo, classSymbol, event) {
    $scope.$root.context(event.title);

    $scope.event = event;
    $scope.features = event.features;
    $scope.starting_classes = starting_classes(event);
    $scope.zone_wise_entry = false;
    $scope.scoring_table = [];

    $scope.flip_zone_wise_entry = function() {
      $scope.zone_wise_entry = !$scope.zone_wise_entry;
      focus_marks();
    };

    /* Um die Maske sinnvoll darstellen zu können, Felder für die befahrenen
     * Sektionen und Runden der ersten startenden Klasse anzeigen.  Das
     * stimmt zumindest bei allen Veranstaltungen, bei denen alle Klassen
     * die selben Sektionen und Runden befahren.  */
    for (var class_ = 1; class_ < event.zones.length + 1; class_++) {
      if (event.zones[class_ - 1]) {
	$scope['class'] = class_;
	break;
      }
    }

    // Einzelpunkte auffüllen, sonst funktioniert der Vergleich zwischen
    // old_rider und rider nicht.
    function fill_marks_per_zone(rider) {
      try {
	var class_ = rider.class;
	var marks_per_zone = rider.marks_per_zone;
	var rounds = event.classes[class_ - 1].rounds;
	for (var n = 0; n < rounds; n++) {
	  if (marks_per_zone[n] == null)
	    marks_per_zone[n] = [];
	  angular.forEach(event.zones[class_ - 1],
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
	$scope.class = rider.class;
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
	  var class_ = rider.class;
	  var zones = current_zone != null ? [current_zone] : event.zones[class_ - 1];

	  function try_to_focus(round, zone) {
	    for (let marks_array of [rider.marks_per_zone, rider.computed_marks]) {
	      if ((marks_array[round - 1] || [])[zone - 1] != null)
		return false;
	    }
	    if (!zone_skipped(class_, round, zone)) {
	      setFocus('#marks_' + round + '_' + zone);
	      return true;
	    }
	  }

	  var rounds = event.classes[class_ - 1].rounds;
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

    function is_cancel_item(item) {
      return item.canceled_device != null && item.canceled_seq != null;
    }

    function is_null_item(item) {
      return item.marks == null && item.penalty_marks == null;
    }

    function scoring_item_eventually_canceled(item) {
      if (!item.canceled)
	return false;
      while (item.canceled)
	item = item.canceled;
      return is_null_item(item);
    }

    function load_scoring(number) {
      $scope.scoring_table = [];
      $http.get('/api/event/' + event.id + '/rider/' + number + '/scoring')
        .then(function(response) {
	  let scoring_table = [];
	  let items = response.data;
	  let canceled = {};

	  for (let item of items) {
	    if (!is_cancel_item(item))
	      continue;
	    let canceled_device = canceled[item.canceled_device];
	    if (!canceled_device) {
	      canceled_device = {};
	      canceled[item.canceled_device] = canceled_device;
	    }
	    canceled_device[item.canceled_seq] = item;
	  }

	  let num_in_round = 0;
	  for (let item of items) {
	    if (is_null_item(item))
	      continue;
	    let canceled_item = (canceled[item.device] || {})[item.seq];
	    if (canceled_item)
	      item.canceled = canceled_item;
	    delete item.device;
	    delete item.seq;
	    item.time = new Date(item.time);

	    let scoring_round = scoring_table[item.round - 1];
	    if (!scoring_round) {
	      scoring_round = [];
	      scoring_table[item.round - 1] = scoring_round;
	    }
	    let scoring_zone = scoring_round[item.zone - 1];
	    if (!scoring_zone) {
	      scoring_zone = [];
	      scoring_round[item.zone - 1] = scoring_zone;
	    }
	    scoring_zone.push(item);
	  }

	  function scoring_time(scoring_zone) {
	    for (let item of scoring_zone) {
	      if (!scoring_item_eventually_canceled(item))
		return item.time.getTime();
	    }
	    return 0;
	  };

	  for (let scoring_round of scoring_table) {
	    let scoring_zones = [];
	    for (let scoring_zone of scoring_round) {
	      if (scoring_zone)
		scoring_zones.push(scoring_zone);
	    }
	    scoring_zones.sort((a, b) => scoring_time(a) - scoring_time(b));
	    let num = 0;
	    for (let scoring_zone of scoring_zones) {
	      if (scoring_zone.length) {
		for (let item of scoring_zone)
		  item.num = num;
		num++;
	      }
	    }
	  }

	  $scope.scoring_table = scoring_table;
	  let class_ = $scope.rider.class;
	  let zones = event.zones[class_ - 1] || [];
	  $scope.num_zones = zones.length;
	})
	.catch(network_error);
    }

    $scope.enumerate = function(from, to) {
      var list = [];
      for (; from <= to; from++)
	list.push(from);
      return list;
    };

    function scoring_item_background_color(item) {
      if ($scope.num_zones > 1) {
	let n = item.num / ($scope.num_zones - 1);
	/* Yellow (h = 1/6) to red (h = 0) to blue-ish red (h = -1/24) transition: */
	let rgb = hsl2rgb(-1/24 + (5/24) * (1 - n), 1, 3/4);
	rgb = rgb.map(function(v) { return Math.floor(v * 0xff); });
	return '#' + ((rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).padStart(6, '0');
      }
    }

    function valid_scoring_item(round, zone) {
      let items = (($scope.scoring_table[round - 1] || [])[zone - 1] || []);
      for (let item of items) {
	if (!item.canceled)
	  return item;
      }
    }

    $scope.marks_class = function(round, zone) {
      let classes = {};

      let rider = $scope.rider;
      if (rider) {
	let marks = (rider.marks_per_zone[round - 1] || [])[zone - 1];
	let computed_marks = (rider.computed_marks[round - 1] || [])[zone - 1];
	if (marks != null && computed_marks != null && marks != computed_marks)
	  classes['marks-mismatch'] = true;
      }

      return classes;
    };

    $scope.penalty_marks_class = function() {
      let classes = {};

      let rider = $scope.rider;
      if (rider) {
	if (rider.penalty_marks != null && rider.computed_penalty_marks != null &&
	    rider.penalty_marks != rider.computed_penalty_marks)
	  classes['marks-mismatch'] = true;
      }
      return classes;
    };

    $scope.scoring_cell_style = function(round, zone) {
      let valid_item = valid_scoring_item(round, zone);
      if (valid_item) {
	return {
	  'background-color': scoring_item_background_color(valid_item)
	};
      }
    };

    $scope.scoring_item_time_style = function(round, zone, item) {
      let valid_item = valid_scoring_item(round, zone);
      let style = {};
      let color;
      if (valid_item) {
	let rgb = scoring_item_background_color(valid_item);
	let r = ('0x' + rgb.substr(1, 2)) / 0xff;
	let g = ('0x' + rgb.substr(3, 2)) / 0xff;
	let b = ('0x' + rgb.substr(5, 2)) / 0xff;
	let l = luminance(r, g, b);
	// Luminances of different greytones:
	// "#898989" ~ 0.25, "#bcbcbc" ~ 0.5, "#e1e1e1" ~ 0.75
	color = l < 0.5 ? '#e1e1e1' : '#898989';
	style.color = color;
      }
      if (scoring_item_eventually_canceled(item) ||
	  (is_cancel_item(item) && !is_null_item(item))) {
	style['text-decoration'] = 'line-through';
	if (color)
	  style['text-decoration-color'] = color;
      }
      return style;
    };

    $scope.scoring_item_marks_style = function(round, zone, item) {
      let valid_item = valid_scoring_item(round, zone);
      let style = {};
      let color;
      if (valid_item) {
	let rgb = scoring_item_background_color(valid_item);
	let r = ('0x' + rgb.substr(1, 2)) / 0xff;
	let g = ('0x' + rgb.substr(3, 2)) / 0xff;
	let b = ('0x' + rgb.substr(5, 2)) / 0xff;
	let l = luminance(r, g, b);
	color = l < 0.5 ? '#ffffff' : '#000000'
	style.color = color;
      }
      if (item && item.canceled) {
	style['text-decoration'] = 'line-through';
	if (color)
	  style['text-decoration-color'] = color;
      }
      return style;
    };

    $scope.scoring_marks = function(item) {
      let marks = '';
      if (item.marks != null)
	marks += item.marks;
      if (item.penalty_marks != null) {
	if (item.penalty_marks >= 0)
	  marks += '+';
	marks += item.penalty_marks;
      }
      return marks;
    };

    function load_rider(promise, current_zone) {
      promise
	.then(function(response) {
	  let rider = response.data;
	  if (Object.keys(rider).length) {
	    assign_rider(rider);
	    /* FIXME: Load scoring immediately as soon as we know the number;
	     * cancel loading the scoring when we switch riders. */
	    load_scoring(rider.number);
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

    function load_next_rider(current_zone) {
      var params = {
	start: 1
      };
      if (current_zone != null)
	params.zone = current_zone;
      load_rider($http.get('/api/event/' + event.id + '/next-rider/' + $scope.rider.number, {params: params}), current_zone);
      clear_search_result();
    }

    $scope.load_next_rider = function() {
      load_next_rider();
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

    function current_round(rider) {
      if (rider && rider.start) {
	var round = rider.rounds || 1;
	var class_ = rider.class;
	if (class_ == null)
	  return null;
	var zones = event.zones[class_ - 1] || [];
	for (var index = 0; index < zones.length; index++) {
	  var zone = zones[index], marks;
	  for (let marks_array of [rider.marks_per_zone, rider.computed_marks]) {
	    marks = (marks_array[round - 1] || [])[zone - 1];
	    if ((marks == null) && !zone_skipped(class_, round, zone))
	      return round;
	  }
	}
	if (round < event.classes[class_ - 1].rounds)
	  return round + 1;
      }
    }

    $scope.card_color = function() {
      var rider = $scope.rider;
      if (rider && !($scope.rider_does_not_start() || rider.failure)) {
	var round = current_round(rider);
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

    function resulting_marks_in_round(rider, round) {
      let marks_in_round = [];
      for (let marks_array of [rider.computed_marks, rider.marks_per_zone]) {
	let marks = marks_array[round - 1] || [];
	for (let idx in marks) {
	  if (marks[idx] != null)
	    marks_in_round[idx] = marks[idx];
	}
      }
      return marks_in_round;
    }

    function calculate_marks() {
      var rider = $scope.rider;
      if (rider) {
	rider.additional_marks = null;

	if (event.type == 'otsv-acup') {
	  if (rider.class >= 8 && rider.class <= 11) {
	    let year = rider.year_of_manufacture || year_of_event;
	    let m;
	    if (year_of_event <= 2021)
	      m = Math.trunc(Math.max(0, (year - 1987 + 3) / 3));
	    else
	      m = Math.trunc(Math.max(0, (year - 1999 + 5) / 5));
	   if (m)
		   rider.additional_marks = m;
	  }
	}

	rider.marks = null;
	if (rider.additional_marks != null)
	  rider.marks += rider.additional_marks;
	if (rider.penalty_marks != null)
	  rider.marks += rider.penalty_marks;
	else if (rider.computed_penalty_marks != null)
	  rider.marks += rider.computed_penalty_marks;

	rider.marks_per_round = [];
	if (rider.start) {
	  var class_ = rider.class;
	  var zones = event.zones[class_ - 1] || [];
	  var rounds = event.classes[class_ - 1].rounds;
	  rider.rounds = 0;
	  rider.marks_distribution = [0, 0, 0, 0, 0, 0];
	  if (event.uci_x10)
	    rider.marks_distribution.push(0);
	  var round;
	  for (round = 1; round <= rounds; round++) {
	    var marks_in_round = resulting_marks_in_round(rider, round);
	    var total_marks_in_round = 0;
	    var round_used = false;
	    for (var index = 0; index < zones.length; index++) {
	      var zone = zones[index];
	      if (!zone_skipped(class_, round, zone)) {
		var marks = marks_in_round[zone - 1];
		if (marks != null) {
		  let actual_marks = (marks == -1) ? event.marks_skipped_zone : marks;
		  total_marks_in_round += actual_marks;
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
	      rider.marks_per_round[round - 1] = total_marks_in_round;
	      rider.marks += total_marks_in_round;
	      rider.rounds = round;
	    }
	  }

	  var was_null;
	  function check_skipped(round, zone) {
	    if (!zone_skipped(class_, round, zone)) {
	      var marks;
	      for (let marks_array of [rider.marks_per_zone, rider.computed_marks]) {
		marks = (marks_array[round - 1] || [])[zone - 1];
		if (marks != null)
		  return was_null;
	      }
	      was_null = true;
	    }
	  }

	  delete $scope.zones_skipped;
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
	  if ($scope.zone_wise_entry)
	    load_next_rider(current_zone);
	  else
	    setFocus('#search_term');
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
	rounds = event.classes[$scope.class - 1].rounds;
	var rounds_list = [];
	for (var n = 1; n <= rounds; n++)
	  rounds_list.push(n);
	return rounds_list;
      } catch (_) { }
    };

    $scope.zones_list = function() {
      var rider = $scope.rider;
      return event.zones[$scope.class - 1];
    };

    $scope.classSymbol = classSymbol;

    $scope.riderName = riderName;
    $scope.riderInfo = riderInfo;

    $scope.marks_tab_to = function(round, index) {
      var rider = $scope.rider;
      if (rider) {
	var class_ = rider.class;
	var zones = event.zones[class_ - 1];
	if ($scope.zone_wise_entry) {
	  while (round++ < event.classes[class_ - 1].rounds) {
	    if (!zone_skipped(class_, round, zones[index]))
	      return 'marks_' + round + '_' + zones[index];
	  }
	} else {
	  while (++index < zones.length) {
	    if (!zone_skipped(class_, round, zones[index]))
	      return 'marks_' + round + '_' + zones[index];
	  }
	}
      }
    };

    $scope.marks_keydown = function(ev, round, index) {
      var rider = $scope.rider;
      if (rider) {
	function move_to(round, index) {
	  var class_ = rider.class;
	  var zones = event.zones[class_ - 1];
	  var rounds = event.classes[class_ - 1].rounds;
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
	var gesamt = event.classes[rider.class - 1].riding_time;
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

    function keydownHandler(event) {
      if (event.key == 'PageUp') {
	event.preventDefault();
	if (!$scope.modified()) {
	  if ($scope.rider)
	    $scope.load_previous_rider();
	  else
	    $scope.load_first_rider();
	}
      } else if (event.key == 'PageDown') {
	event.preventDefault();
	if (!$scope.modified()) {
	  if ($scope.rider)
	    load_next_rider();
	  else
	    $scope.load_last_rider();
	}
      } else if (event.key == 'Enter' &&
		 (document.activeElement.tagName != "TEXTAREA" ||
		  event.ctrlKey) &&
		 !event.target.hasAttribute('onchange')) {
	event.preventDefault();
	$timeout(function() {
	  if ($scope.modified()) {
	    if ($scope.form.$valid)
	      $scope.save();
	  } else {
	    var current_zone = get_current_zone();
	    if (current_zone)
	      load_next_rider(current_zone);
	  }});
      } else if (event.key == 'Escape') {
	event.preventDefault();
	$timeout(function() {
	  if ($scope.modified())
	    $scope.discard();
	});
      }
    }

    $document.on('keydown', keydownHandler);
    $scope.$on('$destroy', () => {
      $document.off('keydown', keydownHandler);
    });

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
