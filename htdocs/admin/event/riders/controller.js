'use strict';

var ridersController = [
  '$scope', '$sce', '$http', '$timeout', '$q', '$route', '$location', '$window', 'setFocus',
  'riderName', 'riderInfo', 'event', 'suggestions', 'groups', 'riders_hash', 'groups_hash',
  function ($scope, $sce, $http, $timeout, $q, $route, $location, $window, setFocus,
	    riderName, riderInfo, event, suggestions, groups, riders_hash, groups_hash) {
    $scope.$root.context(event.title);

    /* Im Fahrer-Nennformular Gruppenwertungen herausfiltern und im
       Gruppen-Nennformular Fahrerwertungen herausfiltern.  Eine Wertung ist eine
       Fahrerwertung, wenn startende Fahrer in der Wertung sind, und eine
       Gruppenwertung, wenn startende Gruppen in der Wertung sind; wenn in einer
       Wertung niemand startet, ist auch die Art der Wertung nicht definiert. */

    angular.forEach(event.rankings, function(ranking, index) {
      if ((groups ? ranking.rider : ranking.groups) && ranking.rider != ranking.groups) {
	event.features = event.features.filter(
	  function(feature) {
	    return feature != 'ranking' + (index + 1);
	  });
      }
    });

    $scope.config = config;
    $scope.event = event;

    var features = event.features;
    features.rankings = [];
    for (var n = 1; n <= event.rankings.length; n++) {
      if (event.rankings[n - 1])
	features.rankings.push(n);
    }
    if (groups) {
      /* Folgende Features deaktivieren wir für Gruppen: */
      angular.forEach(['number', 'first_name', 'guardian', 'date_of_birth', 'street',
		       'zip', 'city', 'phone', 'emergency_phone', 'license', 'vehicle',
		       'displacement', 'email', 'registration', 'frame_number'], function(feature) {
	delete features[feature];
      });
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
    $scope.groups = groups;
    $scope.enabled = {neu: true};

    $scope.internal = {};
    $scope.search = {};
    $scope.member_search = {};

    function visible_number(rider) {
      var number = rider ? rider.number : null;
      return number == null || number < 0 ? null : number;
    }

    function focus_rider() {
      var rider = $scope.rider;
      if (rider) {
	var enabled = $scope.enabled;
	if (enabled.rider && groups)
	  setFocus('#member_search_term');
	else if (enabled.rider && features['class'] && rider['class'] === null)
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
      $scope.member_search.term = '';
      $scope.members_list = [];

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
      var params = {
	group: +groups
      };
      load_rider($http.get('/api/event/' + event.id + '/rider/' + number,
			   {params: params}));
    };

    $scope.load_first_rider = function() {
      var params = {
	group: +groups
      };
      load_rider($http.get('/api/event/' + event.id + '/first-rider',
			   {params: params}));
      clear_search_result();
    };

    $scope.load_previous_rider = function() {
      var params = {
	group: +groups
      };
      if ($scope.rider && $scope.rider.number != null)
        load_rider($http.get('/api/event/' + event.id + '/previous-rider/' + $scope.rider.number,
		   {params: params}));
      clear_search_result();
    };

    $scope.load_next_rider = function() {
      var params = {
	group: +groups
      };
      if ($scope.rider && $scope.rider.number != null)
        load_rider($http.get('/api/event/' + event.id + '/next-rider/' + $scope.rider.number,
		   {params: params}));
      clear_search_result();
    };

    $scope.load_last_rider = function() {
      var params = {
	group: +groups
      };
      load_rider($http.get('/api/event/' + event.id + '/last-rider',
			   {params: params}));
      clear_search_result();
    };

    $scope.find_riders = function() {
      if ($scope.search.term !== '') {
	var url = '/api/event/' + event.id + '/find-riders';
	var params = {
	  term: $scope.search.term,
	  group: +groups
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
	  update_hashes($scope.old_rider, new_rider);
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
	'group': groups,
	'class': null,
	'number': null,
	'rankings': event.rankings.map(function(ranking) { return ranking.default; }),
	'insurance': event.insurance,
	'verified': true,
	'future_starts': {}
      };
      if (groups) {
	rider.riders = [];

	var max = Object.values(groups_hash).reduce(function(max, group) {
	  return Math.max(alpha2num(group.last_name), max);
	}, 0);
	rider.last_name = num2alpha(max + 1);
      }
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
	if (future_event.active ||
	    (event.registration_ends != null &&
	     parse_timestamp(event.registration_ends).getTime() >= Date.now()))
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

    $scope.$watchCollection("rider.rankings", function(value) {
      if (value) {
	while (value.length && !value[value.length - 1])
	  value.pop();
	value.forEach(function(v, index) {
	  if (!v && v != null)
	    value[index] = null;
	});
      }
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

    if (event.type && event.type.match(/^otsv/)) {
      var country_codes = {};
      countries.forEach(function(country) {
	if (country.codes[0]) {
	  country_codes[country.name.toLocaleUpperCase()] = country.codes[0];
	  country.codes.forEach(function(code) {
	    country_codes[code.toLocaleUpperCase()] = country.codes[0];
	  });
	}
      });

      $scope.blur_country = function() {
	var country = $scope.rider.country;
	if (country) {
	  var code = country_codes[country.toLocaleUpperCase()];
	  if (code && country != code)
	    $scope.rider.country = code;
	}
      };

      var province_codes = {};
      provinces['A'].forEach(function(province) {
	if (province.codes[0]) {
	  province_codes[province.name.toLocaleUpperCase()] = province.codes[0];
	  province.codes.forEach(function(code) {
	    province_codes[code.toLocaleUpperCase()] = province.codes[0];
	  });
	}
      });

      $scope.blur_province = function() {
	var province = $scope.rider.province;
	if (province) {
	  var code = province_codes[province.toLocaleUpperCase()];
	  if (code && province != code)
	    $scope.rider.province = code;
	}
      };
    } else {
      $scope.blur_country = function() {
      };
      $scope.blur_province = function() {
      };
    }

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
      if (confirm((groups ? 'Gruppe' : 'Fahrer') + ' ' + riderName($scope.rider) + ' wirklich löschen?')) {
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
	    update_hashes(old_rider, null);
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
      var ranking_class = event.classes[rider['class'] - 1].ranking_class;
      return rider.start && event.zones[ranking_class - 1];
    };

    $scope.member_starts = function(number) {
      var rider = riders_hash[number];
      return !rider || rider_starts(rider);
    };

    $scope.memberName = function(number) {
      var name;
      var list = [];
      if (number >= 0)
	list.push(number);
      var rider = riders_hash[number];
      if (rider) {
	name = join(' ', rider.last_name, rider.first_name);
	angular.forEach(rider.groups, function(number) {
	  if (number == $scope.rider.number)
	    return;
	  var group = groups_hash[number];
	  if (!group)
	    return;
	  var name = join(' ', group.last_name, group.first_name);
	  if (name != '')
	    list.push(name);
	});
      } else {
	name = 'Unbekannter Fahrer';
      }
      return name +
	     (list.length ? ' (' + list.join(', ') + ')' : '');
    };

    $scope.member_info = function(number, action) {
      var rider = riders_hash[number];
      if (!rider)
	return;

      var info = '';
      if (action)
	info = action + ':\n';
      info += riderInfo(rider);
      if (!rider_starts(rider))
	info += '\n(Fahrer startet nicht)';
      return info;
    };

    function not_equal(v1) {
      return function(v2) {
	return v1 != v2;
      };
    }

    $scope.members_list = [];

    $scope.remove_member = function(number) {
      $scope.member_search.term = '';

      var rider = $scope.rider;
      $scope.rider.riders = rider.riders.filter(not_equal(number));
      $scope.members_list.push(number);
      $scope.members_list = normalize_riders_list($scope.members_list);
      setFocus('#member_search_term');
    };

    $scope.add_member = function(number) {
      $scope.member_search.term = '';

      $scope.members_list = $scope.members_list.filter(not_equal(number));

      var rider = $scope.rider;
      for (var n = 0; n < rider.riders.length; n++)
	if (rider.riders[n] == number)
	  return;
      rider.riders.push(number);
      rider.riders = normalize_riders_list(rider.riders);
      setFocus('#member_search_term');
    };

    function normalize_hash_list(hash, numbers) {
      return numbers.sort(function(a, b) {
	var fa = hash[a], fb = hash[b];
	if (!fa || !fb)
	  return !fa - !fb;
	return generic_compare(fa.last_name, fb.last_name) ||
	       generic_compare(fa.first_name, fb.first_name) ||
	       a - b;
      });
    }

    function normalize_riders_list(numbers) {
      return normalize_hash_list(riders_hash, numbers);
    }

    function normalize_groups_list(numbers) {
      return normalize_hash_list(groups_hash, numbers);
    }

    $scope.find_members = function() {
      if ($scope.member_search.term !== '') {
	var url = '/api/event/' + event.id + '/find-riders';
	var params = {
	  term: $scope.member_search.term,
	  group: 0,
	  active: true,
	};
	$http.get(url, {params: params})
	  .then(function(response) {
	    let riders_list = response.data;
	    var found = normalize_riders_list(
	      riders_list.map(function(rider) {
		return rider.number;
	      }).filter(function(number) {
		return !$scope.rider.riders.some(function(s) {
		  return s == number;
		});
	      }));
	    $scope.members_list = found;
	    if (found.length == 1)
	      $scope.add_member(found[0]);
	  })
	  .catch(network_error);
      } else {
	delete $scope.members_list;
      }
    }

    function update_hashes(old_group, group) {
      if (old_group && old_group.group) {
	var hashed = groups_hash[old_group.number];
	if (hashed) {
	  angular.forEach(old_group.riders || [], function(number) {
	    var rider = riders_hash[number];
	    rider.groups = rider.groups.filter(not_equal(old_group.number));
	  });
	  delete groups_hash[old_group.number];
	}
      }
      if (group && group.group) {
	var hashed = {};
	angular.forEach(['first_name', 'last_name', 'class', 'date_of_birth'], function(name) {
	  hashed[name] = group[name];
	});
	hashed.riders = angular.copy(group.riders);
	groups_hash[group.number] = hashed;
	angular.forEach(group.riders || [], function(number) {
	  var rider = riders_hash[number];
	  rider.groups.push(group.number);
	  rider.groups = normalize_groups_list(rider.groups);
	});
      }
    }

    $scope.is_austria = function(land) {
      try {
	land = land.toLocaleLowerCase();
      } catch (_) { }
      return ['a', 'at', 'aut', 'austria', 'ö', 'österreich']
	.find(function(_) { return land == _ });
    };

    $scope.class_symbol = function() {
      if ($scope.rider && $scope.rider.class != null) {
	var color = event.classes[$scope.rider.class - 1].color;
	if (color) {
	  return $sce.trustAsHtml(
	    `<span style="display:inline-block; width:8pt; height:8pt; background-color:${color}"></span>`
	  );
	}
      }
    };

    function create_ranking_labels() {
      /* FIXME: Vergebene Accesskeys dynamisch ermitteln. */
      var accesskeys = 'aknvpsuäl' + (groups ? 'g' : 'f');
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

    /* FIXME: Wie kann dieser Code für alle Formulare verallgemeinert werden? */
    $scope.keydown = function(event) {
      if (event.which == 13 &&
	  (document.activeElement.tagName != "TEXTAREA" || event.ctrlKey)) {
	$timeout(function() {
	  if ($scope.modified() && $scope.form.$valid)
	    $scope.save();
	});
      } else if (event.which == 27) {
	$timeout(function() {
	  if ($scope.modified() || $scope.enabled.discard)
	    $scope.discard();
	});
      }
    };

    warn_before_unload($scope, $scope.modified);

    $scope.regform = function(name) {
      $window.location.href =
	'/api/event/' + event.id + '/regform?number=' +
	encodeURIComponent($scope.rider.number) + '&name=' +
	encodeURIComponent(name);
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
	  if (class_ == 3) {
	    $scope.max_age_year = 44;
	  } else if (class_ == 4 || class_ == 7) {
	    $scope.min_age_year = 45;
	  } else if (class_ == 5) {
	    $scope.max_age_year = 11;
	  } else if (class_ == 6) {
	    $scope.min_age_year = 12;
	    $scope.max_age_year = 44;
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
	    $scope.max_age_year = 6;
	  } else if (class_ == 2) {
	    $scope.min_age_year = 7;
	    $scope.max_age_year = 8;
	  } else if (class_ == 3) {
	    // $scope.min_age_year = 7;
	    $scope.max_age_year = 9;
	  } else if (class_ == 4) {
	    $scope.min_age_year = 10;
	    $scope.max_age_year = 15;
	  } else if (class_ == 5 || class_ == 6) {
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

ridersController.resolveFactory = function (groups) {
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
    riders_hash: [
      '$q', '$http', '$route',
      function($q, $http, $route) {
	if (groups)
	  return http_request($q, $http.get('/api/event/' + $route.current.params.id + '/riders'));
      }],
    groups_hash: [
      '$q', '$http', '$route',
      function($q, $http, $route) {
	if (groups)
	  return http_request($q, $http.get('/api/event/' + $route.current.params.id + '/groups'));
      }],
    groups: [
      function() {
	return groups;
      }],
  };
};

angular.module('application').controller('ridersController', ridersController);
