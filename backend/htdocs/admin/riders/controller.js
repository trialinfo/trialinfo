'use strict;'

var ridersController = [
  '$scope', '$sce', '$http', '$timeout', '$q', '$route', '$location',
  'event', 'suggestions', 'groups', 'riders_hash', 'groups_hash',
  function ($scope, $sce, $http, $timeout, $q, $route, $location,
	    event, suggestions, groups, riders_hash, groups_hash) {
    $scope.$root.context(event.rankings[0].title);

    /* Im Fahrer-Nennformular Gruppenwertungen herausfiltern und im
       Gruppen-Nennformular Fahrerwertungen herausfiltern.  Eine Wertung ist eine
       Fahrerwertung, wenn startende Fahrer in der Wertung sind, und eine
       Gruppenwertung, wenn startende Gruppen in der Wertung sind; wenn in einer
       Wertung niemand startet, ist auch die Art der Wertung nicht definiert. */

    angular.forEach(event.rankings, function(wertung, index) {
      if ((groups ? wertung.rider : wertung.groups) && wertung.rider != wertung.groups) {
	event.features = event.features.filter(
	  function(feature) {
	    return feature != 'wertung' + (index + 1);
	  });
      }
    });

    $scope.event = event;

    var features = features_from_list(event);
    if (groups) {
      /* Folgende Features deaktivieren wir für Gruppen: */
      angular.forEach(['number', 'first_name', 'date_of_birth', 'street',
		       'zip', 'city', 'phone', 'license', 'vehicle',
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
	  set_focus('#member_search_term', $timeout);
	else if (enabled.rider && features['class'] && rider['class'] === null)
	  set_focus('#class', $timeout);
	else if (features.number && enabled.number &&
		 visible_number(rider) == null)
	  set_focus('#number', $timeout);
	else if (enabled.rider) {
	  var felder = ['first_name', 'last_name', 'date_of_birth'];
	  for (var n = 0; n < felder.length; n++) {
	    var feld = felder[n];
	    if ($scope.features[feld] &&
		(rider[feld] === null || rider[feld] === '')) {
	      set_focus('#' + feld, $timeout);
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
	  rider.riders = normalize_rider_list(rider.riders);
      }
      $scope.rider = rider;
      $scope.internal.number = visible_number(rider);
      $scope.old_rider = angular.copy(rider);
      $scope.search.term = '';
      $scope.member_search.term = '';
      $scope.members_list = [];

      $scope.fahrer_ist_neu = false;
      angular.extend($scope.enabled, {
	'number': rider && visible_number(rider) == null,
	'rider': rider && true,
	'remove': rider && rider.number != null,
	neu: true,
	discard: false,
      });

      url_aktualisieren();
    };

    function load_rider(promise) {
      promise.
	success(function(rider) {
	  if (Object.keys(rider).length) {
	    assign_rider(rider);
	    focus_rider();
	    delete $scope.rider_list;
	  }
	}).
	error(network_error);
    };

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
      if (!groups)
	params.active = 1;
      load_rider($http.get('/api/event/' + event.id + '/first-rider',
			   {params: params}));
    };

    $scope.load_previous_rider = function() {
      var params = {
	group: +groups
      };
      if (!groups)
	params.active = 1;
      if ($scope.rider && $scope.rider.number != null)
        load_rider($http.get('/api/event/' + event.id + '/previous-rider/' + $scope.rider.number,
		   {params: params}));
    };

    $scope.load_next_rider = function() {
      var params = {
	group: +groups
      };
      if (!groups)
	params.active = 1;
      if ($scope.rider && $scope.rider.number != null)
        load_rider($http.get('/api/event/' + event.id + '/next-rider/' + $scope.rider.number,
		   {params: params}));
    };

    $scope.load_last_rider = function() {
      var params = {
	group: +groups
      };
      if (!groups)
	params.active = 1;
      load_rider($http.get('/api/event/' + event.id + '/last-rider',
			   {params: params}));
    };

    $scope.find_riders = function() {
      if ($scope.search.term !== '') {
	var url = '/api/event/' + event.id + '/find-riders';
	var params = {
	  term: $scope.search.term,
	  group: +groups
	};
	$http.get(url, {params: params}).
	  success(function(rider_list) {
	    if (rider_list.length == 1)
	      $scope.load_rider(rider_list[0].number);
	    else
	      $scope.rider_list = rider_list;
	  }).
	  error(network_error);
      } else {
	delete $scope.rider_list;
      }
    };

    $scope.modified = function() {
      return !(angular.equals($scope.old_rider, $scope.rider) &&
	       visible_number($scope.old_rider) == $scope.internal.number);
    };

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

      var now;
      if (event.date &&
	  (match = event.date.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
	now = new Date(match[1], match[2] - 1, match[3]);
      else
	now = new Date();

      var age = new Date();
      age.setTime(now - date_of_birth);
      $scope.age = age.getFullYear() - 1970;

      var age_year = new Date();
      age_year.setTime(now - year_of_birth);
      $scope.age_year = age_year.getFullYear() - 1970 - 1;
    });

    $scope.year_for_age = function(age) {
      return new Date().getFullYear() - age - 1;
    }

    $scope.save = function() {
      if ($scope.busy)
	return;
      var number;
      var version;
      if ($scope.old_rider) {
	number = $scope.old_rider.number;
	version = $scope.old_rider.version;
      }
      if (version === undefined)
	version = 0;
      var rider = $scope.rider;
      if (rider.start)
	rider.nennungseingang = true;

      if ($scope.internal.number != visible_number(rider)) {
	rider = angular.copy(rider);
	rider.number = $scope.internal.number;
      }

      /* Nicht gültige Wertungen deaktivieren.  Das umfasst für Fahrer die
	 Gruppenwertungen, und für Gruppen die Fahrerwertungen. */
      if (rider.start) {
	angular.forEach(rider.rankings, function(wertung, index) {
	  if (wertung && !features['wertung' + (index + 1)])
	    rider.rankings[index] = false;
	});
      }

      $scope.busy = true;
      save_rider($http, event.id, number, version, rider).
	success(function(fahrer_neu) {
	  update_hashes(rider, fahrer_neu);
	  assign_rider(fahrer_neu);
	  set_focus('#search_term', $timeout);
	}).
	error(function (data, status) {
	  if (status == 409 && 'error' in data && data.error.match('Duplicate'))
	    $scope.error = 'Startnummer ' + rider.number + ' existiert bereits.';
	  else
	    network_error(data, status);
	}).
	finally(function() {
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
	'rankings': [ event.wertung1_markiert ],
	'versicherung': event.versicherung
      };
      if (groups)
	rider.riders = [];
      assign_rider(rider);
      $scope.fahrer_ist_neu = true;
      angular.extend($scope.enabled, {
	neu: false,
	discard: true,
      });
      focus_rider();
    };

    $scope.change_number = function() {
      angular.extend($scope.enabled, {
	number: true,
	discard: true,
	remove: false,
	neu: false
      });
      set_focus('#number', $timeout);
    };

    $scope.rider_name = function(rider) {
      return rider_name(rider, $scope);
    };
    $scope.rider_info = rider_info;

    var canceler;
    $scope.number_valid = function(number) {
      if (canceler)
	canceler.resolve();
      if (typeof number == 'string') {
	/* ui-validate calls the validator function too early for numeric form
	 * fields which convert input fields to numbers or undefined; maybe this can be
	 * fixed there instead of here. */
	if (number == '')
	  number = null;
	else
	  number = +number;
      }
      if (number == null ||
	  number === $scope.old_rider.number) {
	$scope.number_used = undefined;
	return true;
      }
      var params = {
	id: event.id,
	number: number
      };
      canceler = $q.defer();
      checker = $q.defer();
      /* FIXME */
      $http.get('/api/number', {params: params, timeout: canceler.promise}).
	success(function(data, status, headers, config) {
	  if (data.number) {
	    $scope.number_used = data;
	    if (!('id' in data) || data.id == event.id)
	      checker.reject();
	    else
	      checker.resolve();
	  } else {
	    $scope.number_used = undefined;
	    checker.resolve();
	  }
	}).
	error(function(data, status) {
	  if (data) {
	    $scope.number_used = undefined;
	    network_error(data, status);
	    checker.reject();
	  }
	});
      return checker.promise;
    };

    function next_number() {
      if (canceler)
	canceler.resolve();
      canceler = $q.defer();
      var rider = $scope.rider;
      if (rider && rider.number == null && rider['class'] != null) {
	var params = {
	  id: event.id,
	  'class': rider['class']
	};
	$http.get('/api/number', {params: params, timeout: canceler.promise}).
	  success(function(data, status, headers, config) {
	    if (data.next_number)
	      $scope.number_used = data;
	    else
	      $scope.number_used = undefined;
	  }).
	  error(function() {
	    $scope.number_used = undefined;
	  });
      }
    }
    $scope.$watch("rider['class']", next_number);

    $scope.class_may_start = function(class_) {
      return event.zones[event.classes[class_ - 1].ranking_class - 1] &&
	     event.classes[class_ - 1].rounds;
    }

    $scope.class_does_not_start = function() {
      var rider = $scope.rider;
      if (!rider || rider.group)
	return;

      var class_ = rider['class'];
      if (class_ == null)
	return ($scope.groups ? 'Gruppe' : 'Fahrer') + ' ist keiner Klasse zugewiesen.';
      if (!$scope.class_may_start(class_))
	return 'Klasse ' + rider.class + ' startet nicht.'
    }

    $scope.does_not_start = function() {
      var rider = $scope.rider;
      var reasons = [];
      var reason = $scope.class_does_not_start();
      if (reason)
	reasons.push(reason);
      if (rider) {
	if (!rider.verified)
	  reasons.push(($scope.groups ? 'Gruppe' : 'Fahrer') + ' ist nicht verifiziert.');
	if ($scope.features.registered && !rider.registered)
	  reasons.push('Nennungseingang ist nicht markiert.');
      }
      return reasons.join(' ');
    }

    $scope.osk_license = function(rider) {
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

    $scope.remove = function() {
      if (confirm((groups ? 'Gruppe' : 'Fahrer') + ' ' + rider_name($scope.rider, $scope) + ' wirklich löschen?')) {
	var old_rider = $scope.old_rider;
	var number = old_rider.number;
	var version = old_rider.version;
	var params = {
	  version: version
	};
	$http.delete('/api/event/' + event.id + '/rider/' + number, {params: params}).
	  success(function() {
	    assign_rider(undefined);
	    update_hashes(old_rider, null);
	    set_focus('#search_term', $timeout);
	  }).
	  error(network_error);
      }
    };

    $scope.member_starts = function(number) {
      var rider = riders_hash[number];
      if (!rider)
	return true;
      var ranking_class = event.classes[rider['class'] - 1].ranking_class;
      return rider.start && event.zones[ranking_class - 1];
    };

    $scope.member_name = function(number) {
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

    $scope.members_list = [];

    $scope.remove_member = function(number) {
      $scope.member_search.term = '';

      var rider = $scope.rider;
      $scope.rider.riders = rider.riders.filter(function(s) {
	return s != number;
      });
      $scope.members_list.push(number);
      $scope.members_list = normalize_rider_list($scope.members_list);
      set_focus('#member_search_term', $timeout);
    };

    $scope.add_member = function(number) {
      $scope.member_search.term = '';

      $scope.members_list = $scope.members_list.filter(function(s) {
	return s != number;
      });

      var rider = $scope.rider;
      for (var n = 0; n < rider.riders.length; n++)
	if (rider.riders[n] == number)
	  return;
      rider.riders.push(number);
      rider.riders = normalize_rider_list(rider.riders);
      set_focus('#member_search_term', $timeout);
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

    function normalize_rider_list(numbers) {
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
	$http.get(url, {params: params}).
	  success(function(rider_list) {
	    var found = normalize_rider_list(
	      rider_list.map(function(rider) {
		return rider.number;
	      }).filter(function(number) {
		return !$scope.rider.riders.some(function(s) {
		  return s == number;
		});
	      }));
	    $scope.members_list = found;
	    if (found.length == 1)
	      $scope.fahrer_hinzufuegen(found[0]);
	  }).
	  error(network_error);
      } else {
	delete $scope.members_list;
      }
    }

    function update_hashes(old_group, group) {
      if (old_group && old_group.group) {
	var hashed = groups_hash[old_group.number];
	if (hashed) {
	  angular.forEach(old_group.rider || [], function(number) {
	    var rider = riders_hash[number];
	    rider.groups = rider.groups.filter(function(number) {
	      return number != old_group.number;
	    });
	  });
	  delete groups_hash[old_group.number];
	}
      }
      if (group && group.group) {
	var hashed = {};
	angular.forEach(['first_name', 'last_name', 'class', 'date_of_birth'], function(name) {
	  hashed[name] = group[name];
	});
	groups_hash[group.number] = hashed;
	angular.forEach(group.rider || [], function(number) {
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

    function create_ranking_labels() {
      /* FIXME: Vergebene Accesskeys dynamisch ermitteln. */
      var accesskeys = 'aknvpmsuäl' + groups ? 'g' : 'f';
      $scope.rankings = [];
      angular.forEach(features.rankings, function(wertung) {
	var name = event.rankings[wertung - 1].name || '';
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
	$scope.rankings[wertung - 1] = {label: label, accesskey: accesskey};
      });
    }

    /* FIXME: Wie kann dieser Code für alle Formulare verallgemeinert werden? */
    $scope.keydown = function(event) {
      if (event.which == 13) {
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

    $scope.$watch("rider['class']", function() {
      var rider = $scope.rider;
      $scope.no_ranking1 = rider && rider['class'] &&
	event.classes[rider['class'] - 1].no_ranking1;
      $scope.non_competing = rider && rider['class'] &&
	event.classes[rider['class'] - 1].non_competing;
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
