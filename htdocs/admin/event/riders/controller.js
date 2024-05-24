'use strict';

var ridersController = [
  '$scope', '$sce', '$http', '$timeout', '$q', '$route', '$location', '$window', '$document', 'setFocus',
  'riderName', 'riderInfo', 'classSymbol', 'event', 'suggestions',
  function ($scope, $sce, $http, $timeout, $q, $route, $location, $window, $document, setFocus,
	    riderName, riderInfo, classSymbol, event, suggestions) {
    $scope.$root.context(event.title);

    $scope.config = config;
    $scope.event = event;

    var features = event.features;
    features.rankings = [];
    for (var n = 1; n <= event.rankings.length; n++) {
      if (event.rankings[n - 1])
	features.rankings.push(n);
    }
    $scope.features = features;

    $scope.defined_classes = [];
    angular.forEach(event.classes, function(class_, index) {
      if (class_ && class_.rounds && event.zones[index]) {
	$scope.defined_classes.push(
	  angular.extend({'class': index + 1}, class_));
      }
    });
    $scope.starting_classes = starting_classes(event);
    create_ranking_labels();

    $scope.suggestions = suggestions;
    $scope.enabled = {neu: true};

    $scope.internal = {};
    $scope.search = {};

    function visible_number(rider) {
      var number = rider ? rider.number : null;
      return number == null || number < 0 ? null : number;
    }

    function focus_rider() {
      var rider = $scope.rider;
      if (rider) {
	var enabled = $scope.enabled;
	if (enabled.rider && features['class'] && rider['class'] === null)
	  setFocus('#class');
	else if (features.number && enabled.number &&
		 rider && !(rider.number > 0))
	  setFocus('#number');
	else if (enabled.rider) {
	  var fields = ['first_name', 'last_name', 'date_of_birth'];
	  for (var n = 0; n < fields.length; n++) {
	    var field = fields[n];
	    if ($scope.features[field] &&
		(rider[field] === null || rider[field] === '')) {
	      setFocus('#' + field);
	      break;
	    }
	  }
	}
      }
      $scope.error = undefined;
    }

    function url_aktualisieren() {
      var number = $scope.rider ? $scope.rider.number : null;
      if ($location.search().number != number) {
	var search = {};
	if (number != null)
	  search.number = number;
	$location.search(search).replace();
      }
    }

    function assign_rider(rider) {
      if ($scope.form)
	$scope.form.$setPristine();
      if (rider) {
	if (rider.riders)
	  rider.riders = normalize_riders_list(rider.riders);
      }
      $scope.rider = rider;
      $scope.internal.number = visible_number(rider);
      $scope.old_rider = angular.copy(rider);
      $scope.search.term = '';

      $scope.fahrer_ist_neu = false;
      angular.extend($scope.enabled, {
	'number': rider && !(rider.number > 0),
	'rider': rider && true,
	'remove': rider && rider.number != null,
	neu: true,
	discard: false,
      });

      url_aktualisieren();
    };

    var cancel_user_info;
    function get_user_info(rider) {
      if (cancel_user_info)
	cancel_user_info.resolve();
      delete $scope.user;
      if (rider.user_tag) {
	var timer = $timeout(function() {
	  cancel_user_info = $q.defer();
	  $http.get('/api/user/' + rider.user_tag,
		    {timeout: cancel_user_info.promise})
	  .then(function(response) {
	    $scope.user = response.data;
	  })
	  .catch(network_error);
	}, 500);
	cancel_user_info = $q.defer();
	cancel_user_info.promise.then(function() {
	  $timeout.cancel(timer);
	});
      }
    }

    $scope.user_title = function() {
      var rider = $scope.rider;
      var user = $scope.user;
      if (user && user.email != null) {
	if (rider && rider.email != null &&
	    rider.email.toLowerCase() == user.email.toLowerCase())
	  return 'Registriert.';
	else
	  return 'Registriert durch ' + user.email + '.';
      }
    };

    function load_rider(promise) {
      promise
	.then(function(response) {
	  let rider = response.data;
	  if (Object.keys(rider).length) {
	    assign_rider(rider);
	    focus_rider();
	    get_user_info(rider);
	  }
	})
	.catch(network_error);
    };

    function clear_search_result() {
      delete $scope.riders_list;
    }

    $scope.load_rider = function(number) {
      load_rider($http.get('/api/event/' + event.id + '/rider/' + number));
    };

    $scope.load_first_rider = function() {
      load_rider($http.get('/api/event/' + event.id + '/first-rider'));
      clear_search_result();
    };

    $scope.load_previous_rider = function() {
      if ($scope.rider && $scope.rider.number != null)
        load_rider($http.get('/api/event/' + event.id + '/previous-rider/' + $scope.rider.number));
      clear_search_result();
    };

    $scope.load_next_rider = function() {
      if ($scope.rider && $scope.rider.number != null)
        load_rider($http.get('/api/event/' + event.id + '/next-rider/' + $scope.rider.number));
      clear_search_result();
    };

    $scope.load_last_rider = function() {
      load_rider($http.get('/api/event/' + event.id + '/last-rider'));
      clear_search_result();
    };

    $scope.find_riders = function() {
      if ($scope.search.term !== '') {
	var url = '/api/event/' + event.id + '/find-riders';
	var params = {
	  term: $scope.search.term
	};
	$http.get(url, {params: params})
	  .then(function(response) {
	    let riders_list = response.data;
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

    $scope.modified = function() {
      return !angular.equals($scope.old_rider, $scope.rider);
    };

    $scope.guardian_visible = function(rider) {
      return guardian_visible(rider, event);
    }

    $scope.$watch('rider.date_of_birth', function(date_of_birth) {
      var match;
      if (date_of_birth == null ||
	  !(match = date_of_birth.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
	delete $scope.age;
	delete $scope.age_year;
	return;
      }
      date_of_birth = new Date(match[1], match[2] - 1, match[3]);
      var year_of_birth = new Date(match[1], 0, 1);

      var now = date_of_event(event);

      var age = new Date();
      age.setTime(now - date_of_birth);
      $scope.age = age.getFullYear() - 1970;

      var age_year = new Date();
      age_year.setTime(now - year_of_birth);
      $scope.age_year = age_year.getFullYear() - 1970 - 1;
    });

    var year_of_event = (date_of_event(event) || new Date()).getFullYear();
    $scope.year_for_age = function(age) {
      return year_of_event - age - 1;
    }

    function update_numbers(old_number, new_number) {
      if (old_number && old_number != new_number) {
	($scope.riders_list || []).forEach(function(rider) {
	  if (rider.number == old_number)
	    rider.number = new_number;
	});
      }
    }

    $scope.save = function() {
      if ($scope.busy)
	return;
      var number;
      var version;
      if ($scope.old_rider.number) {
	number = $scope.old_rider.number;
	version = $scope.old_rider.version;
      }
      var rider = $scope.rider;

      rider = angular.copy(rider);
      rider.verified = true;

      /* Nicht gültige Wertungen deaktivieren.  Das umfasst für Fahrer die
	 Gruppenwertungen, und für Gruppen die Fahrerwertungen. */
      if (rider.start) {
	angular.forEach(rider.rankings, function(ranking, index) {
	  if (ranking && !event.rankings[index])
	    rider.rankings[index] = false;
	});
      }

      $scope.busy = true;
      var request;
      var params = {
	event_version: event.version
      };
      if (number)
	request = $http.put('/api/event/' + event.id + '/rider/' + number, rider,
			    {params: params});
      else
	request = $http.post('/api/event/' + event.id + '/rider', rider,
			     {params: params});

      request
	.then(function(response) {
	  let new_rider = response.data;
	  update_numbers($scope.old_rider.number, new_rider.number);
	  assign_rider(new_rider);
	  setFocus('#search_term');
	})
	.catch(function (response) {
	  let data = response.data;
	  let status = response.status;
	  if (status == 409 && 'error' in data && data.error.match('Duplicate'))
	    $scope.error = 'Startnummer ' + rider.number + ' existiert bereits.';
	  else
	    network_error(response);
	})
	.finally(function() {
	  delete $scope.busy;
	});
    };

    $scope.discard = function() {
      if ($scope.busy)
	return;
      /* FIXME: Wenn Fahrer geladen, neu laden um Versionskonflikte aufzulösen. */
      assign_rider($scope.fahrer_ist_neu ? undefined : $scope.old_rider);
    }

    $scope.new_rider = function() {
      /* FIXME: Wenn Felder gesetzt werden, werden hier die entsprechenden
       * Properties gesetzt; wenn die Felder dann gelöscht werden, bleiben die
       * Properties gesetzt.  Dadurch hat sich das Modell dann für angular.equals()
       * geändert, obwohl alles gleich ist.  Wir könnten hier alle Properties
       * setzen, aber das dupliziert nur den HTML-Code und ist fehleranfällig. */
      var rider = {
	'class': null,
	'number': null,
	'country': event.country,
	'rankings': normalize_rankings(event.rankings.map((ranking) => ranking.default)),
	'insurance': event.insurance,
	'verified': true,
	'future_starts': {}
      };
      assign_rider(rider);
      $scope.fahrer_ist_neu = true;
      angular.extend($scope.enabled, {
	neu: false,
	discard: true,
      });
      focus_rider();
      clear_search_result();
    };

    $scope.change_number = function() {
      angular.extend($scope.enabled, {
	number: true,
	discard: true,
	remove: false,
	neu: false
      });
      setFocus('#number');
    };

    $scope.riderName = riderName;
    $scope.riderInfo = riderInfo;

    $scope.future_events = event.future_events.reduce(
      function(future_events, future_event) {
	if (future_event.active || config.show_all_future_events)
	  future_events.push(future_event);
	return future_events;
      }, []);

    $scope.$watch('rider.future_starts', function() {
      if ($scope.rider) {
	var future_starts = $scope.rider.future_starts;
	Object.keys(future_starts).forEach(function(fid) {
	  if (!future_starts[fid])
	    delete future_starts[fid];
	});
      }
    }, true);

    var canceler;
    function check_number(number) {
      if (!$scope.rider ||
	  ($scope.rider.number == null && $scope.rider.class == null) ||
	  ($scope.rider.number > 0 && $scope.old_rider &&
	   $scope.rider.number == $scope.old_rider.number)) {
	$scope.number_used = undefined;
	$scope.form.$setValidity('number', true);
	return;
      }
      if (canceler)
	canceler.resolve();
      var params = {};
      if ($scope.rider.number > 0) {
	$scope.form.$setValidity('number', undefined);
	params.number = $scope.rider.number;
      } else {
	$scope.form.$setValidity('number', true);
      }
      if ($scope.rider.class)
	params.class = $scope.rider.class;
      canceler = $q.defer();
      $http.get('/api/event/' + event.id + '/check-number',
		{params: params, timeout: canceler.promise})
	.then(function(response) {
	  let data = response.data;
	  $scope.number_used = data;
	  $scope.form.$setValidity('number', !data.number || data.id);
	})
	.catch(function(response) {
	  $scope.number_used = undefined;
	  $scope.form.$setValidity('number', null);
	  network_error(response);
	});
    };

    $scope.$watch('rider.class', check_number);
    $scope.$watch('rider.number', check_number);

    $scope.$watch('internal.number', function(number) {
      if ($scope.rider) {
	if (number == null && $scope.old_rider.number <= 0)
	  number = $scope.old_rider.number;
	if ($scope.rider.number != number)
	  $scope.rider.number = number;
      }
    });

    function normalize_rankings(rankings) {
      if (rankings) {
	while (rankings.length && !rankings[rankings.length - 1])
	  rankings.pop();
	rankings.forEach(function(v, index) {
	  if (!v && v != null)
	    rankings[index] = null;
	});
      }
      return rankings;
    }

    $scope.$watchCollection("rider.rankings", function(value) {
      normalize_rankings(value);
    });

    $scope.class_may_start = function(class_) {
      return class_may_start(class_, event);
    }

    $scope.rider_does_not_start = function() {
      return rider_does_not_start($scope.rider, event);
    }

    $scope.otsv_amf_event =
      event.type != null &&
      event.type.match(/^otsv(\+amf)?$/);

    $scope.amf_license = function(rider) {
      return rider.license.match(/^(IJM|JM|JMJ) ?[0-9]+$/);
    };

    $scope.rider_in_ranking1 = function(rider) {
      if (!rider.rankings[0])
	return false;
      if (rider['class'] != null) {
	var class_ = event.classes[rider['class'] - 1];
	return !class_.no_ranking1;
      }
    };

    var country_codes = {};
    for (let country of countries) {
      if (country.codes[0]) {
	country_codes[country.name.toLocaleUpperCase()] = country.codes[0];
	for (let code of country.codes) {
	  country_codes[code.toLocaleUpperCase()] = country.codes[0];
	}
      }
    }

    $scope.blur_country = function() {
      var rider = $scope.rider;
      if (rider.country) {
	var code = country_codes[rider.country.toLocaleUpperCase()];
	if (code && rider.country != code)
	  rider.country = code;
      }
    };

    var province_codes = {};
    if (provinces[event.country]) {
      for (let province of provinces[event.country]) {
	if (province.codes[0]) {
	  province_codes[province.name.toLocaleUpperCase()] = province.codes[0];
	  for (let code of province.codes) {
	    province_codes[code.toLocaleUpperCase()] = province.codes[0];
	  }
	}
      }
    }

    $scope.blur_province = function() {
      var rider = $scope.rider;
      if (rider.province) {
	var code = province_codes[rider.province.toLocaleUpperCase()];
	if (code && rider.province != code)
	  rider.province = code;
      }
    };

    $scope.clone = function() {
      let rider = angular.copy($scope.rider);
      delete rider.rider_tag;
      angular.extend(rider, {
	'number': null,
	'class': null,
	'registered': false,
	'start': false,
	'future_starts': {}
      });
      assign_rider(rider);
    };

    $scope.remove = function() {
      if (confirm('Fahrer ' + riderName($scope.rider) + ' wirklich löschen?')) {
	var old_rider = $scope.old_rider;
	var number = old_rider.number;
	var version = old_rider.version;
	var params = {
	  version: version,
	  event_version: event.version
	};
	$http.delete('/api/event/' + event.id + '/rider/' + number, {params: params})
	  .then(function() {
	    assign_rider(undefined);
	    setFocus('#search_term');

	    if ($scope.riders_list) {
	      $scope.riders_list = $scope.riders_list.filter(function(rider) {
		return rider.number != number;
	      });
	    }
	  })
	  .catch(network_error);
      }
    };

    function rider_starts(rider) {
      if (!rider.class || !event.classes[rider['class'] - 1])
	return false;
      return rider.start && event.zones[rider['class'] - 1];
    };

    function not_equal(v1) {
      return function(v2) {
	return v1 != v2;
      };
    }

    $scope.is_austria = function(land) {
      try {
	land = land.toLocaleLowerCase();
      } catch (_) { }
      return ['a', 'at', 'aut', 'austria', 'ö', 'österreich']
	.find(function(_) { return land == _ });
    };

    $scope.classSymbol = function() {
      if ($scope.rider && $scope.rider.class != null) {
	return classSymbol(event.classes[$scope.rider.class - 1].color);
      }
    };

    function create_ranking_labels() {
      /* FIXME: Vergebene Accesskeys dynamisch ermitteln. */
      var accesskeys = 'aknvpsuälf';
      $scope.rankings = [];
      angular.forEach(features.rankings, function(ranking) {
	var name = event.rankings[ranking - 1].name || '';
	var label = name, accesskey;
	for (var n = 0; n < name.length; n++) {
	  var key = name[n].toLowerCase();
	  if (accesskeys.indexOf(key) == -1) {
	    accesskey = key;
	    label = name.substr(0, n) +
		    '<span class="accesskey">' + name[n] + '</span>' +
		    name.substr(n + 1);
	    break;
	  }
	}
	label = $sce.trustAsHtml(label);
	$scope.rankings[ranking - 1] = {label: label, accesskey: accesskey};
      });
    }

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
	    $scope.load_next_rider();
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
	  }});
      } else if (event.key == 'Escape') {
	event.preventDefault();
	$timeout(function() {
	  if ($scope.modified() || $scope.enabled.discard)
	    $scope.discard();
	});
      }
    }

    $document.on('keydown', keydownHandler);
    $scope.$on('$destroy', () => {
      $document.off('keydown', keydownHandler);
    });

    warn_before_unload($scope, $scope.modified);

    $scope.pdf_form = function(form) {
      $window.location.href =
	'/api/event/' + event.id + '/pdf-form?name=' +
	encodeURIComponent(form.name) + '&number=' +
	encodeURIComponent($scope.rider.number);
    };

    $scope.print_direct = function(form) {
      $http.post('/api/event/' + event.id + '/pdf-form?&name=' +
	encodeURIComponent(form.name) + '&number=' +
	encodeURIComponent($scope.rider.number), '')
      /**/.then(function(response) {
	console.log(response.data)
      })/**/
      .catch(network_error);
    };

    $scope.$watch("rider.class", function(class_) {
      $scope.no_ranking1 = class_ &&
	event.classes[class_ - 1].no_ranking1;
      $scope.non_competing = class_ &&
	event.classes[class_ - 1].non_competing;

      delete $scope.min_age;
      delete $scope.max_age;
      delete $scope.min_age_year;
      delete $scope.max_age_year;

      if (event.type != null) {
	if (event.type.match(/^otsv(\+amf)?$/)) {
	  if (class_ == 3 || class_ == 5) {
	    $scope.max_age_year = 44;
	  } else if (class_ == 4 || class_ == 6) {
	    $scope.min_age_year = 45;
	  } else if (class_ == 11) {
	    $scope.min_age = 14;
	  } else if (class_ == 12) {
	    $scope.min_age = 12;
	    $scope.max_age_year = 17;
	  } else if (class_ == 13) {
	    $scope.min_age = 10;
	    $scope.max_age_year = 15;
	  }
	} else if (event.type.match(/^otsv-ecup/)) {
	  if (class_ == 1) {
	    $scope.min_age_year = 2;
	    $scope.max_age_year = 6;
	  } else if (class_ == 2) {
	    $scope.min_age_year = 7;
	    $scope.max_age_year = 8;
	  } else if (class_ == 3) {
	    $scope.min_age_year = 2;
	    $scope.max_age_year = 9;
	  } else if (class_ == 4) {
	    $scope.min_age_year = 10;
	    $scope.max_age_year = 14;
	  } else if (class_ == 5 || class_ == 6) {
	    $scope.min_age_year = 2;
	    $scope.max_age_year = 15;
	  } else if (class_ == 7) {
	    $scope.min_age_year = 10;
	    $scope.max_age_year = 15;
	  }
	}
      }
    });

    $scope.$watch('rider.date_of_birth', function(date_of_birth) {
      var match;
      if (date_of_birth == null ||
	  !(match = date_of_birth.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
	delete $scope.age;
	delete $scope.age_year;
	return;
      }
      date_of_birth = new Date(match[1], match[2] - 1, match[3]);
      var year_of_birth = new Date(match[1], 0, 1);

      var now = date_of_event(event);

      var age = new Date();
      age.setTime(now - date_of_birth);
      $scope.age = age.getFullYear() - 1970;

      var age_year = new Date();
      age_year.setTime(now - year_of_birth);
      $scope.age_year = age_year.getFullYear() - 1970 - 1;
    });

    $scope.$on('$routeUpdate', function() {
      var number = $scope.rider ? $scope.rider.number : null;
      if ($location.search().number != number) {
	number = $location.search().number;
	if (number != null)
	  $scope.load_rider(number);
	else
	  assign_rider(undefined);
      }
    });
    $scope.$emit('$routeUpdate');
  }];

ridersController.resolveFactory = function () {
  return {
    event: [
      '$q', '$http', '$route',
      function($q, $http, $route) {
	return http_request($q, $http.get('/api/event/' + $route.current.params.id));
      }],
    suggestions: [
      '$q', '$http', '$route',
      function($q, $http, $route) {
	return http_request($q, $http.get('/api/event/' + $route.current.params.id + '/suggestions'));
      }],
  };
};

angular.module('application').controller('ridersController', ridersController);
