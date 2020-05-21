'use strict';

var serieResultsController = [
  '$scope', '$sce', '$route', '$location', '$timeout', '$http', '$q', 'fractional', 'results',
  function ($scope, $sce, $route, $location, $timeout, $http, $q, fractional, results) {
    $scope.config = config;
    $scope.show = {
      fields: [],
      classes: [],
    };

    $scope.$root.context(results.serie.name);
    fractional.enabled = results.serie.split_score;

    var serie = results.serie;
    var features = serie.features;

    $scope.results = results;
    $scope.serie = serie;
    $scope.features = features;

    angular.forEach(results.events, function(event, index) {
      event.label = +index + 1;
    });

    $scope.events_by_location = (function(events) {
      let groups = [], last_event;
      angular.forEach(events, function(event) {
	if (!last_event || !event.location ||
	    last_event.location != event.location)
	  groups.push([]);
	groups[groups.length - 1].push(event);
	last_event = event;
      });
      return groups;
    }(results.events));

    $scope.have_drop_score = function(class_ranking) {
      if (class_ranking.class.drop_events) {
	let drop_events = class_ranking.events.length -
			  (class_ranking.class.max_events -
			   class_ranking.class.drop_events);
	return drop_events > 0;
      }
    };

    /*
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

      angular.forEach(search, function(value, key) {
	if (value === null || value === '' || value === false)
	  delete search[key];
      });

      return search;
    }
    */

    /*
    function update_url() {
      var url = $location.search();
      if (!url.length || !angular.equals($scope.show, from_url(url))) {
	$scope.ignoreRouteUpdate = true;
	$location.search(to_url($scope.show)).replace();
      }
    }
    */

    /*
    function update() {
	update_url();
    }
    */

    (function() {
      function summary(class_ranking) {
	let class_ = class_ranking.class;

	let summary = 'Stand nach ' + class_ranking.events.length;
	if (class_.max_events)
	  summary += ' von ' + class_.max_events
	summary += ' Läufen';

	if (class_.min_events) {
	  summary += ', Wertung ab ' + class_.min_events + ' ' +
		     (class_.min_events == 1 ?  'Lauf' : 'Läufen');
	}

	if (class_.drop_events) {
	  let drop_events = class_ranking.events.length -
			    (class_.max_events - class_.drop_events);
	  if (drop_events > 0) {
	    summary += ', ' + drop_events + ' von ' + class_.drop_events +
		       ' ' + (class_.drop_events == 1 ?
			      'Streichresultat' : 'Streichresultaten') +
		       ' berücksichtigt';
	  }
	}

	return summary + '.';
      }

      function all_equal(array, field) {
	let last_field;

	for (let element of array) {
	  if (!(field in element))
	    return;
	  if (last_field !== undefined && last_field != element[field])
	    return;
	  last_field = element[field];
	}
	return last_field;
      }

      for (let ranking of results.rankings) {
	for (let class_ranking of ranking.classes) {
	  class_ranking.summary = summary(class_ranking);
	}
      }

      if (results.rankings.length &&
	  results.rankings.every(function(ranking) {
	    return all_equal(ranking.classes, 'summary');
	  })) {
	results.summary = results.rankings[0].classes[0].summary;
	for (let ranking of results.rankings) {
	  for (let class_ranking of ranking.classes)
	    delete class_ranking.summary;
	}
      }
    })();

    function country_province(rider) {
      var country_province = [];
      if (rider.country &&
	  (rider.country != serie.country || !serie.hide_country))
	country_province.push(rider.country);
      if (rider.province)
	country_province.push('(' + rider.province + ')');
      return country_province.join(' ');
    };

    function flag_symbol(country) {
      var code = regional_indicator_symbol_codes[country];
      if (code)
	return String.fromCodePoint(0x1f1e6 + code.codePointAt(0) - 65,
				    0x1f1e6 + code.codePointAt(1) - 65)
    };

    let htmlEscape = (function() {
      let element = angular.element('<span/>');
      return function(text) {
	return element.text(text).html();
      };
    })();

    var defined_fields = {
      number:
	{ name: 'Startnummer',
	  heading: '<span title="Startnummer">Nr.</span>',
	  value: function(rider) {
	    return rider.number < 0 ? null : rider.number;
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'number' },
	  when: function() { return features.number } },
      name:
	{ name: 'Name',
	  heading: 'Name',
	  value: function(rider) {
	    return join(' ', rider.last_name, rider.first_name);
	  },
	  style: { 'text-align': 'left', 'padding-right': '1em' },
	  attr: { 'adjust-width': 'name' } },
      name_applicant:
	{ name: 'Name (Bewerber)',
	  heading: 'Name',
	  html_value: function(rider) {
	    let name = htmlEscape(join(' ', rider.last_name, rider.first_name));
	    let applicant = '';
	    if (rider.applicant != null)
	      applicant = '<br><em>' + htmlEscape(rider.applicant) + '</em>';
	    return $sce.trustAsHtml(name + applicant);
	  },
	  style: { 'text-align': 'left', 'padding-right': '1em' },
	  attr: { 'adjust-width': 'name' },
	  when: function() { return features.applicant } },
      vehicle:
	{ name: 'Fahrzeug',
	  heading: 'Fahrzeug',
	  value: function(rider) {
	    return rider.vehicle;
	  },
	  style: { 'text-align': 'left',
		   'max-width': '10em',
		   /* 'white-space': 'nowrap', */ /* FIXME: See commit message. */
		   'overflow': 'hidden' },
	  attr: { 'adjust-width': 'vehicle' },
	  when: function() { return features.vehicle } },
      year_of_manufacture:
	{ name: 'Baujahr',
	  heading: '<span title="Baujahr">Bj.</span>',
	  value: function(rider) {
	    return rider.year_of_manufacture;
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'year_of_manufacture' },
	  when: function() { return features.year_of_manufacture } },
      club:
	{ name: 'Club',
	  heading: 'Club',
	  value: function(rider) {
	    return rider.club;
	  },
	  style: { 'text-align': 'left',
		   'max-width': '13em',
		   /* 'white-space': 'nowrap', */ /* FIXME: See commit message. */
		   'overflow': 'hidden' },
	  attr: { 'adjust-width': 'club' },
	  when: function() { return features.club } },
      country_province:
	{ name: 'Land (Bundesland)',
	  heading: '<span title="Land (Bundesland)">Land</span>',
	  value: country_province,
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'country_province' },
	  when: function() { return features.country || features.province } },
      flag:
	{ name: 'Landesflagge',
	  value: function(rider) {
	    return flag_symbol(rider.country);
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'flag' } },
    };
    angular.forEach(defined_fields, function(field) {
      field.heading = $sce.trustAsHtml(field.heading);
      if (field.value) {
	field.html_value = function(rider) {
	  return $sce.trustAsHtml(htmlEscape(field.value(rider)));
	};
      }
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

    $scope.class_symbol = function(class_) {
      var color = class_.color
      if (color) {
	return $sce.trustAsHtml(
	  '<span style="display:inline-block; width:0.8em; height:0.8em; background-color:' + color + '"></span>');
      }
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

    /* $scope.$watch('show', update, true); */
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

      if (show['font-size'] !== undefined)
	show['font-size'] = +show['font-size'];

      show['page-break'] = !!show['page-break'];

      return show;
    };

    $scope.$on('$routeUpdate', function() {
      if ($scope.ignoreRouteUpdate) {
	delete $scope.ignoreRouteUpdate;
	return;
      }

      var fields = [];
      angular.forEach(['number', 'name'].concat(serie.result_columns), function(name) {
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

    var hide_settings_promise;

    $scope.$on('$destroy', function() {
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

    $scope.events = (function() {
      let events = results.events.reduce(function(events, event) {
	events[event.id] = event;
	return events;
      }, {});

      return function(ids) {
	return ids.map(function(id) {
	  return events[id];
        });
      };
    })();

    $scope.rank = function(rider) {
      if (rider.ranked && rider.rank != null)
	return rider.rank + '.';
    };

    $scope.same_day = same_day;
  }];

serieResultsController.resolve = {
  results: function($q, $http, $route) {
    return $http.get('/api/serie/' + $route.current.params.serie + '/results')
      .then(function(response) {
	return response.data;
      });
  },
};

angular.module('application').controller('serieResultsController', serieResultsController);
