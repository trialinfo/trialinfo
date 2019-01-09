'use strict;'

var eventResultsController = [
  '$scope', '$sce', '$route', '$location', '$timeout', '$http', '$q', 'fractional', 'results',
  function ($scope, $sce, $route, $location, $timeout, $http, $q, fractional, results) {
    $scope.config = config;
    $scope.show = {
      fields: [],
      classes: [],
      subtitle: results.event.subtitle
    };

    fractional.enabled = results.event.split_score;

    var old_results, event, features;

    function assign_results(a) {
      old_results = angular.copy(a);
      results = a;
      event = results.event;
      $scope.event = event;
      features = event.features;
      $scope.features = features;
      $scope.$root.context(event.title);

      if (event.type && event.type.match(/^otsv/)) {
	results.riders.forEach(function(class_) {
	  if (!class_)
	    return;
	  class_.forEach(function(rider) {
	    if (rider.country == 'A')
	      rider.country = null;
	  });
	});
      }

      $scope.distribution = [];
      $scope.marks_distribution_columns = 0;
      if (!features.individual_marks) {
	$scope.distribution[0] = true;
	$scope.marks_distribution_columns++;
	if (event.type != 'otsv-acup') {
	  $scope.distribution[1] = true;
	  $scope.distribution[2] = true;
	  $scope.distribution[3] = true;
	  $scope.marks_distribution_columns += 3;
	  if (event.four_marks) {
	    $scope.distribution[4] = true;
	    $scope.marks_distribution_columns++;
	  }
	  if (features.column_5) {
	    $scope.distribution[5] = true;
	    $scope.marks_distribution_columns++;
	  }
	}
      }

      $scope.classes = (function() {
	var classes = [];
	angular.forEach(results.riders, function(value, index) {
	  if (value)
	    classes.push(index + 1);
	});
	return classes.sort(function(a, b) {
	  return event.classes[a - 1].order - event.classes[b - 1].order;
	});
      })();
      angular.forEach($scope.classes, function(class_) {
	if ($scope.show.classes[class_ - 1] === undefined)
	  $scope.show.classes[class_ - 1] = true;
      });

      $scope.is_class_of_riders = function(class_) {
	return !event.classes[class_ - 1].groups;
      };
      $scope.riders_groups = event.classes.some(function(class_) { return class_ && class_.groups; });

      $scope.rankings = (function() {
	var rankings = [];
	angular.forEach(event.rankings, function(ranking, index) {
	  if (event.rankings[index])
	    rankings.push({ ranking: index + 1, name: ranking.name });
	});
	return rankings;
      })();

      (function() {
	var skipped_zones = [];
	angular.forEach(event.zones, function(zones_in_class, class_index) {
	  if (zones_in_class) {
	    skipped_zones[class_index] = [];
	    try {
	      for (var round = 1; round <= event.classes[class_index].rounds; round++)
		skipped_zones[class_index][round - 1] = [];
	    } catch(_) { }
	  }
	});
	angular.forEach(event.skipped_zones, function(zones_in_class, class_index) {
	  if (zones_in_class) {
	    angular.forEach(zones_in_class, function(zones_in_round, round_index) {
	      angular.forEach(zones_in_round, function(zone) {
		try {
		  skipped_zones[class_index][round_index][zone - 1] = true;
		} catch (_) { }
	      });
	    });
	  }
	});

	angular.forEach(results.riders, function(riders_in_class, class_index) {
	  angular.forEach(riders_in_class, function(rider) {
	    var individual_marks = [];
	    for (round = 1; round <= event.classes[class_index].rounds; round++) {
	      var marks = [];
	      try {
		angular.forEach(event.zones[class_index], function(zone) {
		  if (skipped_zones[class_index][round - 1][zone - 1])
		    marks.push('-');
		  else {
		    var p = rider.marks_per_zone[round - 1][zone - 1];
		    if (p == -1)
		      p = '-';
		    marks.push(p);
		  }
		});
	      } catch (_) { }
	      individual_marks.push(marks);
	    }

	    rider.individual_marks = function(round, zone) {
	      var e;
	      try {
		e = individual_marks[round - 1][zone - 1];
	      } catch (_) { };
	      if (e === undefined && this.failure)
		return '-';
	      return e;
	    };

	    rider.marks_in_round = function(round) {
	      var marks_in_round = this.marks_per_round[round - 1];
	      if (marks_in_round === undefined)
		marks_in_round = this.failure ? '-' : '';
	      if (!features.individual_marks) {
		var marks = individual_marks[round - 1];
		if (marks) {
		  return $sce.trustAsHtml(
		    '<span title="' + marks.join(' ') + '">' + marks_in_round + '</span>'
		  );
		}
	      }
	      return $sce.trustAsHtml(marks_in_round + '');
	    };
	  });
	});
      })();
    }
    assign_results(results);

    $scope.$watch('show.riders_groups', function() {
      var riders_groups = $scope.show.riders_groups;
      $scope.show.riders = riders_groups != 'groups';
      $scope.show.groups = riders_groups != 'rider';
    });

    $scope.show_class = function(class_) {
      return $scope.show.classes[class_ - 1] &&
	     $scope.riders_in_classes[class_ - 1] &&
	     $scope.riders_in_classes[class_ - 1].filter($scope.show_rider).length &&
	     (($scope.show.riders && !event.classes[class_ - 1].groups) ||
	      ($scope.show.groups && event.classes[class_ - 1].groups));
    };


    function to_url(show) {
      var search = angular.copy(show);

      var hidden_classes = [];
      angular.forEach(search.classes, function(value, index) {
	if (value === false)
	  hidden_classes.push(index + 1);
      });
      if (hidden_classes.length)
	search['hide-class'] = hidden_classes;
      delete search.classes;

      var fields = search.fields;
      if (fields[fields.length - 1] === '')
	fields.pop();
      search.field = fields;
      delete search.fields;

      search['not-all'] = !search.all;
      delete search.all;

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
	$location.search(to_url($scope.show)).replace();
      }
    }

    function compare_riders(riders_in_class) {
      angular.forEach(riders_in_class, function(rider) {
	rider.distribution_class = [];
	rider.round_class = [];
      });

      function compare(a, b) {
	if (a.marks === b.marks && a.tie_break === b.tie_break &&
	    !a.failure && !b.failure) {
	  for (var n = 0; n < 6; n++) {
	    if (a.marks_distribution[n] !== b.marks_distribution[n]) {
	      a.distribution_class[n] = 'important';
	      b.distribution_class[n] = 'important';
	      return;
	    }
	  }
	  var rounds = Math.min(a.marks_per_round.length, b.marks_per_round.length);
	  if (event.equal_marks_resolution == 1) {
	    for (var n = 0; n < rounds; n++) {
	      if (a.marks_per_round[n] !== b.marks_per_round[n]) {
		a.round_class[n] = 'important';
		b.round_class[n] = 'important';
		break;
	      }
	    }
	  } else if (event.equal_marks_resolution == 2) {
	    for (var n = rounds - 1; n >= 0; n--) {
	      if (a.marks_per_round[n] !== b.marks_per_round[n]) {
		a.round_class[n] = 'important';
		b.round_class[n] = 'important';
		break;
	      }
	    }
	  }
	}
      }

      for (var n = 0; n < riders_in_class.length - 1; n++)
	compare(riders_in_class[n], riders_in_class[n + 1]);
    }

    function update() {
      var ranking = $scope.show.ranking;

      $scope.$root.context(event.title);
      if (ranking == null)
	$scope.show.all = true;
      else if ((event.rankings[ranking - 1] || {}).groups)
	$scope.show.all = false;

      $scope.columns = [];

      function rider_visible(rider) {
	  return ranking == null || rider.rankings[ranking - 1] || $scope.show.all;
      }

      var riders_in_classes = [];
      angular.forEach(results.riders, function(all_riders_in_class, class_index) {
	var riders_in_class = [];
	if ($scope.show.classes[class_index]) {
	  angular.forEach(all_riders_in_class, function(rider) {
	    if (rider_visible(rider))
	      riders_in_class.push(rider);
	  });
	}
	if (riders_in_class.length == 0)
	  riders_in_class = null;
	riders_in_classes.push(riders_in_class);
      });

      angular.forEach(riders_in_classes, function(riders_in_class, class_index) {
	if (riders_in_class) {
	  var columns = $scope.columns[class_index] = {};
	  angular.forEach(riders_in_class, function(rider) {
	    if (rider.additional_marks)
	      columns.additional_marks = true;
	    if (rider.tie_break)
	      columns.tie_break = true;
	    try {
	      if (rider.rankings[ranking - 1].score)
		columns.score = true;
	    } catch (_) { }
	    /* FIXME: Andere leere Spalten auch unterdrücken ... */
	    /* Spalte Startnummer für Gruppenwertungen verstecken */
	  });

	  riders_in_class = riders_in_class.sort(function(a, b) {
	      var rank_a, rank_b;
	      if (ranking == null || $scope.show.all) {
		rank_a = a.rank;
		rank_b = b.rank;
	      } else {
		rank_a = a.rankings[ranking - 1].rank;
		rank_b = b.rankings[ranking - 1].rank;
	      }
	      if (rank_a == null || rank_b == null) {
		rank_a = (rank_a == null);
		rank_b = (rank_a == null);
	      }
	      if (rank_a != rank_b)
		return rank_a - rank_b;
	      if (a.number >= 0 || b.number >= 0)
		  return a.number - b.number;
	      else
		return generic_compare(a.last_name, b.last_name) ||
		       generic_compare(a.first_name, b.first_name);
	  });

	  compare_riders(riders_in_class);
	}
      });
      $scope.riders_in_classes = riders_in_classes;

      $scope.summary = (function() {
	var num_riders = 0, num_groups = 0;
	var failures = [];
	var non_competing = 0;
	angular.forEach(riders_in_classes, function(riders_in_class, class_index) {
	  if (riders_in_class) {
	    if (event.classes[class_index].groups)
	      num_groups += riders_in_class.length;
	    else
	      num_riders += riders_in_class.length;
	    angular.forEach(riders_in_class, function(rider) {
	      if (rider.failure)
		failures[rider.failure] = (failures[rider.failure] || 0) + 1;
	      if (rider.non_competing)
		non_competing++;
	    });
	  }
	});
	var list = [];
	if (num_riders)
	  list.push(num_riders + ' ' + 'Fahrer');
	if (num_groups)
	  list.push(num_groups + ' ' + (num_groups == 1 ? 'Gruppe' : 'Gruppen'));
	var gesamt = list.join(' und ');
	list = [];
	if (failures[5] || failures[6])
	  list.push(((failures[5] || 0) + (failures[6] || 0)) + ' nicht gestartet');
	if (failures[3])
	  list.push(failures[3] + ' ausgefallen');
	if (failures[4])
	  list.push(failures[4] + ' nicht gewertet');
	if (non_competing)
	  list.push(non_competing + ' außer Konkurrenz');
	if (list.length)
	  gesamt += ' (davon ' + list.join(', ') + ')';
	return gesamt ? gesamt + '.' : null;
      })();
      update_url();
    }

    $scope.rounds_list = function(class_, first) {
      var rounds = [];
      try {
	for (var round = first; round <= event.classes[class_ - 1].rounds; round++)
	  rounds.push(round);
      } catch(_) { }
      return rounds;
    }

    $scope.country_province = function(rider) {
      var country_province = [];
      if (rider.country)
	country_province.push(rider.country);
      if (rider.province)
	country_province.push('(' + rider.province + ')');
      return country_province.join(' ');
    };

    var defined_fields = {
      number:
	{ name: 'Startnummer',
	  heading: '<span title="Startnummer">Nr.</span>',
	  expr: "number < 0 ? null : number",
	  style: { 'text-align': 'center' },
	  when: function() { return features.number } },
      name:
	{ name: 'Name',
	  heading: 'Name',
	  /* FIXME: <br> nach Bewerber! */
	  expr: "(bewerber ? bewerber + ': ' : '') + join(' ', last_name, first_name)",
	  style: { 'text-align': 'left', 'padding-right': '1em' } },
      vehicle:
	{ name: 'Fahrzeug',
	  heading: 'Fahrzeug',
	  expr: "vehicle",
	  style: { 'text-align': 'left' },
	  when: function() { return features.vehicle } },
      year_of_manufacture:
	{ name: 'Baujahr',
	  heading: '<span title="Baujahr">Bj.</span>',
	  expr: "year_of_manufacture",
	  style: { 'text-align': 'center' },
	  when: function() { return features.year_of_manufacture } },
      club:
	{ name: 'Club',
	  heading: 'Club',
	  expr: "club",
	  style: { 'text-align': 'left' },
	  when: function() { return features.club } },
      country_province:
	{ name: 'Land (Bundesland)',
	  heading: '<span title="Land (Bundesland)">Land</span>',
	  expr: "country_province(rider)",
	  style: { 'text-align': 'left' },
	  when: function() { return features.country || features.province } },
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
      if (rider.failure)
	reasons.push(failures[rider.failure]);
      return reasons.join(', ');
    };

    $scope.class_symbol = function(class_) {
      try {
	var color = event.classes[class_ - 1].color;
	if (color) {
	  return $sce.trustAsHtml(
	    '<span style="display:block; width:10pt; height:10pt; background-color:' + color + '"></span>');
	}
      } catch(_) { }
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
      return $sce.trustAsHtml('\n\
@media print {\n\
  @page {\n\
    size:' + (show['page-size'] || 'A4') + ';\n\
    margin-left:' + (show['margin-left'] || '2cm') + ';\n\
    margin-top:' + (show['margin-top'] || '2cm') + ';\n\
    margin-right:' + (show['margin-right'] || '2cm') + ';\n\
    margin-bottom:' + (show['margin-bottom'] || '2cm') + ';\n\
  }\n\
  body { font-size:' + scalefont(show['font-size'] || 10, 0) + 'pt; }\n\
  h2 { font-size:' + scalefont(show['font-size'] || 10, 1) + 'pt; }\n\
  h1 { font-size:' + scalefont(show['font-size'] || 10, 2) + 'pt; }\n\
}\n');
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
    }, true);

    function from_url(search) {
      var show = angular.copy(search);

      var classes = [];
      angular.forEach($scope.classes, function(class_) {
	classes[class_ - 1] = true;
      });
      var hidden_classes = show['hide-class'] || [];
      if (typeof hidden_classes === 'string')
	hidden_classes = [hidden_classes];
      angular.forEach(hidden_classes, function(class_) {
	classes[class_ - 1] = false;
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

      show.all = !show['not-all'];
      delete show['not-all'];

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

      var fields = [];
      angular.forEach(['number', 'name'].concat(event.result_columns), function(name) {
	var field = defined_fields[name];
	if (field && (!field.when || field.when()))
	  fields.push(name);
      });

      var search = $location.search();
      var defaults = {
	ranking: event.rankings[0] ? 1 : null,
	field: fields,
	'page-size': 'A4',
	'font-size': 8,
	'margin-left': '1cm',
	'margin-top': '2cm',
	'margin-right': '1cm',
	'margin-bottom': '1cm',
      };
      angular.forEach(defaults, function(value, key) {
	if (search[key] === undefined)
	  search[key] = value;
      });
      angular.extend($scope.show, from_url(search));
    });
    $scope.$emit('$routeUpdate');

    function seite_zu_lange() {
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
	position = [undefined, 0];
      var classes = document.querySelectorAll('.class');
      var k, rider, num_classes = 0, num_riders = 0;

      for (k = 0; k < classes.length; k++)
	angular.element(classes[k]).addClass('ng-hide');
      if (position[0] !== undefined) {
	for (k = 0; k < classes.length; k++) {
	  if (k == position[0]) {
	    rider = classes[k].querySelectorAll('.rider');
	    if (position[1] >= rider.length) {
	      rider = undefined;
	      k++;
	    }
	    break;
	  }
	}
      }
      if (k == classes.length) {
	position = [0, 0, 0];
	k = 0;
      }

      var offset = position[1];
      var undo = false;
      for(; k < classes.length; k++, offset = 0) {
	if (!rider)
	  rider = classes[k].querySelectorAll('.rider');
	for (var f = 0; f < rider.length; f++)
	  angular.element(rider[f]).addClass('ng-hide');
	if (offset < rider.length) {
	  angular.element(classes[k]).removeClass('ng-hide');
	  num_classes++;
	}
	while (offset < rider.length) {
	  var old_offset = offset;

	  offset++;
	  if (k == position[0] &&
	      offset == position[1] + 1 &&
	      offset < rider.length)
	    offset++;
	  while (offset < 5 && offset < rider.length)
	    offset++;
	  if (offset + 1 == rider.length)
	    offset++;
	  for (var o = old_offset; o < offset; o++)
	    angular.element(rider[o]).removeClass('ng-hide');
	  num_riders += offset - old_offset;

	  if (seite_zu_lange()) {
	    if (undo) {
	      num_riders -= offset - old_offset;
	      if (old_offset == 0) {
		angular.element(classes[k]).addClass('ng-hide');
		num_classes--;
		offset = old_offset;
	      } else {
		while (offset > old_offset) {
		  offset--;
		  angular.element(rider[offset]).addClass('ng-hide');
		}
	      }
	    }
	    return [k, offset, num_classes, num_riders];
	  }
	  undo = true;
	}
	rider = undefined;
      }
      return [k, 0, num_classes, num_riders];
    }

    function show_all() {
      var classes = document.querySelectorAll('.class');

      angular.forEach(classes, function(class_) {
	var rider = class_.querySelectorAll('.rider');

	angular.forEach(rider, function(rider) {
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

	(function animieren() {
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
	    http_request = $http.get('/api/event/' + $route.current.params.id + '/results',
				     {timeout: cancel_http_request.promise});

	    var duration = (position[2] * 1500 + position[3] * 600) * Math.pow(2, $scope.show.duration / 2);
	    timeout_promise = $timeout(animieren, duration);
	  }
	})();
      } else
	show_all();
    });
    $scope.$watch('show.ranking', function(ranking) {
      $scope.show.subtitle = event.subtitle;
    });

    $scope.rank = function(rider) {
      var rank = $scope.show.all ? rider.rank : rider.rankings[$scope.show.ranking - 1].rank;
      if (rank != null)
	return rank + '.';
    }

    $scope.show_rider = function(rider) {
      if ($scope.show.ranking == null || $scope.show.all)
	return rider.rank != null;
      return rider.rankings[$scope.show.ranking - 1];
    };

    $scope.same_day = same_day;
  }];

eventResultsController.resolve = {
  results: function($q, $http, $route) {
    return http_request($q, $http.get('/api/event/' + $route.current.params.id + '/results'));
  },
};
