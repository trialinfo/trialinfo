'use strict';

var eventResultsController = [
  '$scope', '$sce', '$route', '$location', '$timeout', '$http', '$q', 'fractional', 'results',
  function ($scope, $sce, $route, $location, $timeout, $http, $q, fractional, results) {
    $scope.config = config;
    $scope.show = {
      fields: [],
      classes: {},
      subtitle: results.event.subtitle
    };

    fractional.enabled = results.event.split_score;

    var old_results, event, features;

    function ranking_class_tag(ranking, class_) {
      return (ranking.ranking ? ranking.ranking + ':' : '') +
             (Array.isArray(class_.ranking_class) ?
	      class_.ranking_class : [class_.ranking_class]).join('+');
    }

    function filter_rankings(rankings) {
      let filtered_rankings = [];

      angular.forEach(rankings, function(ranking) {
	let filtered_classes = [];
	angular.forEach(ranking.classes, function(class_) {
	  if ($scope.show.classes[ranking_class_tag(ranking, class_)])
	    filtered_classes.push(class_);
	});
	if (filtered_classes.length) {
	  filtered_rankings.push(Object.assign({}, ranking, {classes: filtered_classes}));
	}
      });
      return filtered_rankings;
    }

    function set_event_labels(events) {
      function is_unique(array) {
	let hash = {};
	for (let value of array) {
	  if (value in hash)
	    return false;
	  hash[value] = true;
	}
	return true;
      }

      let choices = [
	// Location
	events.map(function(event) {
	  return event.location; }),

	// Day of week
	events.map(function(event) {
	  return $scope.$eval(
	    'date | date:"EEEE"',
	    {date: new Date(event.date)}); }),

	// Day and month
	events.map(function(event) {
	  return $scope.$eval(
	    'date | date:"d.M."',
	    {date: new Date(event.date)}); }),

	// Event number (starting from 1); guaranteed to be unique
	events.map(function(event, index) {
	  return index + 1; })
      ];

      for (let choice of choices) {
	if (is_unique(choice)) {
	  for (let n = 0; n < events.length; n++)
	    events[n].label = choice[n];
	  break;
	}
      }
    }

    function assign_results(r) {
      old_results = angular.copy(r);
      results = r;
      event = results.event;
      $scope.results = results;
      $scope.event = event;
      $scope.events = results.events;
      features = event.features;
      $scope.features = features;
      $scope.$root.context(event.title);

      if (results.events.length > 1)
	set_event_labels(results.events);

      if (results.registered) {
	let registered = results.registered;
	angular.forEach(registered.classes, function(class_) {
	  angular.forEach(class_.riders, function(rider) {
	    if (rider.start && rider.future_starts.length == Object.keys(registered.future_events).length)
	      return;
	    var all_starts = [];
	    if (rider.start)
	      all_starts.push(event.date);
	    rider.future_starts.forEach(function(fid) {
	      all_starts.push(registered.future_events[fid].date);
	    });
	    rider.all_starts = all_starts
	      .map(function(date) {
		return $scope.$eval('date | date:"EEE"', {date: new Date(date)});
	      }).join(', ');
	  });
	});
      }

      angular.forEach(results.rankings, function(ranking) {
	angular.forEach(ranking.classes, function(class_) {
	  angular.forEach(class_.riders, function(rider) {
	    for (var round = 1; round <= class_.rounds; round++) {
	      if (!rider.marks_per_zone[round - 1])
		rider.marks_per_zone[round - 1] = [];
	      angular.forEach(class_.zones, function(zone) {
		if ((class_.skipped_zones[round] || {})[zone])
		  rider.marks_per_zone[round - 1][zone - 1] = '-';
		else {
		  if (rider.marks_per_zone[round - 1][zone - 1] == -1)
		    rider.marks_per_zone[round - 1][zone - 1] = '-';
		}
	      });
	    }

	    rider.results.forEach(function(result) {
	      if (result) {
		result.marks_in_round = function(round) {
		  var marks_in_round = this.marks_per_round[round - 1];
		  if (marks_in_round === undefined)
		    marks_in_round = this.failure ? '-' : null;
		  if (marks_in_round == null)
		    marks_in_round = '\u200B';  // zero-width space
		  if (features.individual_marks)
		    return $sce.trustAsHtml(marks_in_round + '');
		  else {
		    var marks = this.marks_per_zone[round - 1] || [];
		    marks = marks.map((marks) => marks == -1 ? '-' : marks);
		    return $sce.trustAsHtml(
		      '<span title="' + marks.join(' ') + '">' + marks_in_round + '</span>'
		    );
		  }
		};
		result.marks_in_zone = function(round, zone) {
		  let marks = (this.marks_per_zone[round - 1] || [])[zone - 1];
		  return marks == -1 ? '-' : marks;
		};
	      }
	    });
	  });
	});
      });

      $scope.distribution = [];
      $scope.marks_distribution_columns = 0;
      if (!features.individual_marks && !features.explain_rank) {
	if (event.type == 'otsv-acup') {
	  $scope.distribution = [0];
	  $scope.marks_distribution_columns++;
	} else if (event.uci_x10) {
	  $scope.distribution = [6,5,4,3,2,1];
	  $scope.marks_distribution_columns += 6;
	} else {
	  $scope.distribution = [0,1,2,3];
	  $scope.marks_distribution_columns += 4;
	  if (event.four_marks) {
	    $scope.distribution.push(4);
	    $scope.marks_distribution_columns++;
	  }
	  if (features.column_5) {
	    $scope.distribution.push(5);
	    $scope.marks_distribution_columns++;
	  }
	}
      }

      $scope.classes = (function() {
	var classes = [];
	angular.forEach(results.rankings, function(ranking) {
	  angular.forEach(ranking.classes, function(class_) {
	    classes.push(ranking_class_tag(ranking, class_));
	  });
	});
	return classes;
      })();

      angular.forEach($scope.classes, function(class_) {
	if ($scope.show.classes[class_] === undefined)
	  $scope.show.classes[class_] = true;
      });
    }
    assign_results(results);

    function to_url() {
      var search = angular.copy($scope.show);

      var hidden_classes = {};
      angular.forEach(Object.keys(search.classes), function(tag) {
	if (!search.classes[tag])
	  hidden_classes[tag] = true;
      });
      if (Object.keys(hidden_classes).length)
	search['hide-class'] = Object.keys(hidden_classes);
      delete search.classes;

      var fields = search.fields;
      if (fields[fields.length - 1] === '')
	fields.pop();
      search.field = fields;
      delete search.fields;

      if (search.ranking === null)
	search.ranking = '-';

      angular.forEach(search, function(value, key) {
	if (value === null || value === '' || value === false)
	  delete search[key];
      });

      if (search.subtitle == event.subtitle)
	delete search.subtitle;
      else if (search.subtitle == null)
	search.subtitle = '';

      return search;
    }

    function update_url() {
      var url = $location.search();
      if (!url.length || !angular.equals($scope.show, from_url(url))) {
	$scope.ignoreRouteUpdate = true;
	$location.search(to_url()).replace();
      }
    }

    function update() {
      $scope.$root.context(event.title);

      var rankings = filter_rankings(results.rankings);
      if (!angular.equals(rankings, $scope.rankings))
	$scope.rankings = rankings;

      var summary = (function() {
	var gesamt = '';
	if (results.rankings.length)
	  gesamt = results.event.riders + ' ' + 'Fahrer';
	else if (results.registered)
	  gesamt = results.event.riders + ' vorgenannte Fahrer';
	else
	  gesamt = 'Keine Fahrer';
	var list = [];
	if (results.event.failures[5] || results.event.failures[6]) {
	  list.push(((results.event.failures[5] || 0) +
		     (results.event.failures[6] || 0)) + ' nicht gestartet');
	}
	if (results.event.failures[3])
	  list.push(results.event.failures[3] + ' ausgefallen');
	if (results.event.failures[4])
	  list.push(results.event.failures[4] + ' nicht gewertet');
	if (results.event.non_competing)
	  list.push(results.event.non_competing + ' außer Konkurrenz');
	if (list.length)
	  gesamt += ' (davon ' + list.join(', ') + ')';
	return gesamt ? gesamt + '.' : null;
      })();
      if (summary != $scope.summary)
	$scope.summary = summary;
      update_url();
    }

    $scope.enumerate = function(from, to) {
      var list = [];
      for (; from <= to; from++)
	list.push(from);
      return list;
    }

    $scope.class_symbol = function(class_) {
      if (class_.color) {
	return $sce.trustAsHtml(
	  '<span style="display:inline-block; width:0.8em; height:0.8em; background-color:' + class_.color + '"></span>');
      }
    };

    $scope.country_province = function(rider) {
      var country_province = [];
      if (rider.country &&
	  (rider.country != event.country || !event.hide_country))
	country_province.push(rider.country);
      if (rider.province)
	country_province.push('(' + rider.province + ')');
      return country_province.join(' ');
    };

    $scope.explain_rank = function(riders, index) {
      let rider = riders[index];
      let previous_rider;
      if (index > 0)
	previous_rider = riders[index - 1];

      let marks = [];
      if (previous_rider && previous_rider.decisive_marks != null)
	marks.push(previous_rider.decisive_marks);
      if (rider.decisive_marks != null)
	marks.push(rider.decisive_marks);
      if (marks.length == 2) {
	if (marks[0] == marks[1])
	  marks.pop();
	else if (marks[0] > marks[1])
	  [marks[0],marks[1]] = [marks[1],marks[0]];
      }
      return marks.map(
        (marks) => rider.marks_distribution[marks] + '×' +
		   marks + (features.uci_x10 ? '0' : '')
      ).join(', ');
    }

    $scope.flag_symbol = function(country) {
      var code = regional_indicator_symbol_codes[country];
      if (code)
	return String.fromCodePoint(0x1f1e6 + code.codePointAt(0) - 65,
	                            0x1f1e6 + code.codePointAt(1) - 65)
    };

    var defined_fields = {
      number:
	{ name: 'Startnummer',
	  heading: '<span title="Startnummer">Nr.</span>',
	  expr: "number < 0 ? null : number",
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'number' },
	  when: function() { return features.number } },
      name:
	{ name: 'Name',
	  heading: 'Name',
	  /* FIXME: <br> nach Bewerber! */
	  expr: "(bewerber ? bewerber + ': ' : '') + join(' ', last_name, first_name)",
	  style: { 'text-align': 'left', 'padding-right': '1em' },
	  attr: { 'adjust-width': 'name' } },
      vehicle:
	{ name: 'Fahrzeug',
	  heading: 'Fahrzeug',
	  expr: "vehicle",
	  style: { 'text-align': 'left',
		   'max-width': '10em',
		   /* 'white-space': 'nowrap', */ /* FIXME: See commit message. */
		   'overflow': 'hidden' },
	  attr: { 'adjust-width': 'vehicle' },
	  when: function() { return features.vehicle } },
      year_of_manufacture:
	{ name: 'Baujahr',
	  heading: '<span title="Baujahr">Bj.</span>',
	  expr: "year_of_manufacture",
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'year_of_manufacture' },
	  when: function() { return features.year_of_manufacture } },
      club:
	{ name: 'Club',
	  heading: 'Club',
	  expr: "club",
	  style: { 'text-align': 'left',
		   'max-width': '13em',
		   /* 'white-space': 'nowrap', */ /* FIXME: See commit message. */
		   'overflow': 'hidden' },
	  attr: { 'adjust-width': 'club' },
	  when: function() { return features.club } },
      country_province:
	{ name: 'Land (Bundesland)',
	  heading: '<span title="Land (Bundesland)">Land</span>',
	  expr: "country_province(rider)",
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'country_province' },
	  when: function() { return features.country || features.province } },
      flag:
        { name: 'Landesflagge',
	  expr: "flag_symbol(country)",
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'flag' } },
      start_time:
        { name: 'Startzeit',
	  heading: 'Startzeit',
	  expr: "start_time",
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'time' },
	  when: function() { return features.start_time } },
      finish_time:
        { name: 'Zielzeit',
	  heading: 'Zielzeit',
	  expr: "finish_time",
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'time' },
	  when: function() { return features.finish_time } },
    };
    angular.forEach(defined_fields, function(field) {
      field.heading = $sce.trustAsHtml(field.heading);
    });
    $scope.field_list = (function() {
      var field_list = [];
      angular.forEach(defined_fields, function(field, key) {
	if (!field.when || field.when())
	  field_list.push({ key: key, name: field.name });
      });
      field_list = field_list.sort(function(a, b) { return a.name.localeCompare(b.name); });
      field_list.unshift({ key: '', name: '' });
      return field_list;
    })();

    var failures = {
      3: 'ausgefallen',
      4: 'nicht gewertet',
      5: 'nicht gestartet',
      6: 'nicht gestartet, entschuldigt'
    };

    $scope.failure = function(rider) {
      var reasons = [];
      if (rider.non_competing)
	reasons.push('außer konkurrenz');
      else if (rider.failure)
	reasons.push(failures[rider.failure]);
      return reasons.join(', ');
    };

    $scope.fold = {};
    $scope.settings = function(event) {
      event.preventDefault();
      event.target.blur();
      $scope.fold.settings = !$scope.fold.settings;
    }

    function scalefont(size, scale) {
      return Math.round(size * Math.pow(Math.sqrt(2), scale));
    };

    $scope.print_style = function() {
      var show = $scope.show;
      return $sce.trustAsHtml(`
@media print {
  @page {
    size:${show['page-size'] || 'A4'};
    margin-left:${show['margin-left'] || '2cm'};
    margin-top:${show['margin-top'] || '2cm'};
    margin-right:${show['margin-right'] || '2cm'};
    margin-bottom:${show['margin-bottom'] || '2cm'};
  }
  body { font-size:${scalefont(show['font-size'] || 10, 0)}pt; }
  h2 { font-size:${scalefont(show['font-size'] || 10, 1)}pt; }
  h1 { font-size:${scalefont(show['font-size'] || 10, 2)}pt; }
}
`);
    }

    $scope.create_pdf = function(event) {
      event.preventDefault();
      $timeout(function() {
	$scope.html = document.all[0].outerHTML;
	$scope.url = $location.absUrl();
	$timeout(function() {
	  document.getElementById('pdf').submit();
	  delete $scope.html;
	  delete $scope.url;
	});
      });
    };

    $scope.$watch('show', update, true);
    $scope.$watch('show.fields', function() {
      var fields = $scope.show.fields;
      for (var n = 0; n < fields.length - 1; n++)
	if (fields[n] === '')
	  fields.splice(n, 1);
      if (fields[fields.length - 1] !== '')
	fields.push('');

      $scope.fields = [];
      for (var n = 0; n < fields.length - 1; n++) {
	var field = defined_fields[fields[n]];
	if (field)
	  $scope.fields.push(field);
      }
      $timeout(adjust_width);
    }, true);

    function from_url(search) {
      var show = angular.copy(search);

      var classes = {};
      angular.forEach($scope.classes, function(tag) {
	classes[tag] = true;
      });
      var hidden_classes = show['hide-class'] || [];
      if (typeof hidden_classes === 'string')
	hidden_classes = [hidden_classes];
      angular.forEach(hidden_classes, function(tag) {
	classes[tag] = false;
      });
      show.classes = classes;
      delete show['hide-class'];

      var fields = show.field || [];
      if (typeof fields === 'string')
	fields = [fields];
      if (fields.length == 0 || fields[fields.length - 1] !== '')
	fields.push('');
      show.fields = fields;
      delete show.field;

      if (show.ranking === '-')
	show.ranking = null;
      else if (show.ranking != null)
	show.ranking = +show.ranking;

      if (show['font-size'] !== undefined)
	show['font-size'] = +show['font-size'];

      if (show.duration !== undefined)
	show.duration = +show.duration;

      show['page-break'] = !!show['page-break'];

      return show;
    };

    $scope.$on('$routeUpdate', function() {
      if ($scope.ignoreRouteUpdate) {
	delete $scope.ignoreRouteUpdate;
	return;
      }

      var default_fields = ['number', 'name'].concat(event.result_columns);
      if (results.registered)
	default_fields.push('start_time');

      var fields = [];
      angular.forEach(default_fields, function(name) {
	var field = defined_fields[name];
	if (field && (!field.when || field.when()))
	  fields.push(name);
      });

      var search = $location.search();
      var defaults = {
	field: fields,
      };
      if (config.weasyprint) {
	Object.assign(defaults, {
	  'page-size': 'A4',
	  'font-size': 8,
	  'margin-left': '1cm',
	  'margin-top': '2cm',
	  'margin-right': '1cm',
	  'margin-bottom': '1cm',
	});
      }
      angular.forEach(defaults, function(value, key) {
	if (search[key] === undefined)
	  search[key] = value;
      });
      angular.extend($scope.show, from_url(search));
    });
    $scope.$emit('$routeUpdate');

    function page_too_long() {
      var body = document.body;
      var doc = document.documentElement;
      var documentHeight = Math.max(
	body.scrollHeight, doc.scrollHeight,
	body.offsetHeight, doc.offsetHeight,
	doc.clientHeight);

      var doc = window.document.documentElement;
      var windowHeight = doc.clientHeight;

      return documentHeight > windowHeight;
    }

    function show_page(position) {
      if (!position)
	position = [undefined, 0, 0, 0];
      var classes = document.querySelectorAll('.class');
      var class_index, riders, num_classes = 0, num_riders = 0;

      for (class_index = 0; class_index < classes.length; class_index++)
	angular.element(classes[class_index]).addClass('ng-hide');
      if (position[0] !== undefined) {
	for (class_index = 0; class_index < classes.length; class_index++) {
	  if (class_index == position[0]) {
	    riders = classes[class_index].querySelectorAll('.rider');
	    if (position[1] >= riders.length) {
	      riders = undefined;
	      class_index++;
	    }
	    break;
	  }
	}
      }
      if (class_index == classes.length) {
	position = [0, 0, 0, 0];
	class_index = 0;
      }

      var offset = position[1];
      var undo = false;
      for(; class_index < classes.length; class_index++, offset = 0) {
	if (!riders)
	  riders = classes[class_index].querySelectorAll('.rider');
	for (var f = 0; f < riders.length; f++)
	  angular.element(riders[f]).addClass('ng-hide');
	if (offset < riders.length) {
	  angular.element(classes[class_index]).removeClass('ng-hide');
	  num_classes++;
	}
	while (offset < riders.length) {
	  var old_offset = offset;

	  offset++;
	  if (class_index == position[0] &&
	      offset == position[1] + 1 &&
	      offset < riders.length)
	    offset++;
	  while (offset < 5 && offset < riders.length)
	    offset++;
	  if (offset + 1 == riders.length)
	    offset++;
	  for (var o = old_offset; o < offset; o++)
	    angular.element(riders[o]).removeClass('ng-hide');
	  num_riders += offset - old_offset;

	  if (page_too_long()) {
	    if (undo) {
	      num_riders -= offset - old_offset;
	      if (old_offset == 0) {
		angular.element(classes[class_index]).addClass('ng-hide');
		num_classes--;
		offset = old_offset;
	      } else {
		while (offset > old_offset) {
		  offset--;
		  angular.element(riders[offset]).addClass('ng-hide');
		}
	      }
	    }
	    return [class_index, offset, num_classes, num_riders];
	  }
	  undo = true;
	}
	riders = undefined;
      }
      return [class_index, 0, num_classes, num_riders];
    }

    function show_all() {
      var classes = document.querySelectorAll('.class');

      angular.forEach(classes, function(class_) {
	var riders = class_.querySelectorAll('.rider');

	angular.forEach(riders, function(rider) {
	  angular.element(rider).removeClass('ng-hide');
	});
	angular.element(class_).removeClass('ng-hide');
      });
    }

    var timeout_promise;
    var http_request;
    var cancel_http_request;
    var hide_settings_promise;

    function stop() {
      if (timeout_promise)
	$timeout.cancel(timeout_promise);
      if (cancel_http_request)
	cancel_http_request.resolve();
    }

    $scope.$on('$destroy', function() {
      stop();
      if (hide_settings_promise)
	$timeout.cancel(hide_settings_promise);
    });

    function hide_settings_later() {
      if (hide_settings_promise)
	$timeout.cancel(hide_settings_promise);
      if ($scope.fold.settings) {
	hide_settings_promise = $timeout(function() {
	  $scope.fold.settings = false;
	}, 30000);
      }
    }
    $scope.$watch('fold.settings', hide_settings_later);
    $scope.$watch('show', hide_settings_later, true);

    $scope.$watch('show.duration', function() {
      stop();

      if ($scope.show.duration != null) {
	var position;

	(function animate() {
	  if ($scope.show.duration != null) {
	    if (http_request) {
	      http_request
		.then(function(response) {
		  let new_results = response.data;
		  if (!angular.equals(old_results, new_results)) {
		    assign_results(new_results);
		    update();
		  }
		});
	      http_request = undefined;
	    }

	    position = show_page(position);

	    cancel_http_request = $q.defer();
	    http_request = $http
	      .get('/api/event/' + $route.current.params.id + '/results',
		   {timeout: cancel_http_request.promise})
	      .catch(angular.noop);

	    var duration = (1500 + position[2] * 500 + position[3] * 500) * Math.pow(2, $scope.show.duration / 2);
	    timeout_promise = $timeout(animate, duration);
	  }
	})();
      } else
	show_all();
    });

    $scope.max_rounds = function(class_ranking) {
      return class_ranking.events.reduce(function(rounds, event) {
	return Math.max(rounds, event.rounds);
      }, 0);
    };

    $scope.rank = function(rider) {
      if (rider.rank != null)
	return rider.rank + '.';
    }

    $scope.on_day_of_event = function() {
      let last_event = $scope.results.events.slice(-1)[0];
      return !last_event.date || same_day(last_event.date);
    };
  }];

eventResultsController.resolve = {
  results: function($http, $route) {
    return $http.get('/api/event/' + $route.current.params.id + '/results')
      .then(function(response) {
	return response.data;
      });
  },
};

angular.module('application').controller('eventResultsController', eventResultsController);
