'use strict';

var eventListController = [
  '$scope', '$sce', '$http', '$route', '$location', '$window', '$timeout', 'event', 'list',
  function eventListController($scope, $sce, $http, $route, $location, $window, $timeout, event, list) {
    $scope.config = config;
    $scope.$root.context(event.title);

    $scope.event = event;
    var features = event.features;
    $scope.features = features;
    $scope.fold = {};
    $scope.show = {
      fields: [],
      subtitle: event.subtitle
    };

    if (event.hide_country) {
      list.forEach(function(rider) {
	if (rider.country == event.country)
	  rider.country = null;
      });
    }

    function starting_classes() {
      var classes = {};
      angular.forEach(event.classes, function(class_) {
	var ranking_class = class_.ranking_class;
	var zones = event.zones[ranking_class - 1];
	if (zones && zones.length)
	  classes[ranking_class] = true;
      });
      return classes;
    }

    $scope.starting_classes =
      Object.keys(starting_classes())
      .sort(function(a, b) {
	return event.classes[a - 1].order - event.classes[b - 1].order;
      });

    var insurances = {
      1: 'ADAC-Versicherung',
      2: 'DMV-Versicherung',
      3: 'KFZ-Versicherung',
      4: 'Tagesversicherung'
    };

    var riders_by_number = (function(list) {
      var riders_by_number = {};
      angular.forEach(list, function(rider) {
	riders_by_number[rider.number] = rider;
      });
      return riders_by_number;
    })(list);

    angular.forEach(list, function(group) {
      if (group.group) {
	angular.forEach(group.riders, function(number) {
	  var rider = riders_by_number[number];
	  if (rider) {
	    if (!rider.groups)
	      rider.groups = [];
	    rider.groups.push(group.number);
	  }
	});
      }
    });

    function otsv_fee(event) {
      if (event.type == 'otsv' || event.type == 'otsv+amf') {
	var now, match;
	if (event.date &&
	    (match = event.date.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
	  now = new Date(match[1], match[2] - 1, match[3]);
	else
	  now = new Date();

	return function(rider) {
	  var date_of_birth = rider.date_of_birth;
	  var age_year;
	  if (date_of_birth !== null &&
	      (match = date_of_birth.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
	    var year_of_birth = new Date(match[1], 0, 1);
	    age_year = new Date();
	    age_year.setTime(now - year_of_birth);
	    age_year = age_year.getFullYear() - 1970 - 1;
	  }
	  return age_year != null && age_year < 18 ?
	    2 : 6;
	};
      } else if (event.type == 'otsv-bike')
	return function(rider) { return 2; };
      else if (event.type == 'otsv-ecup')
	return function(rider) { return 1.5; };
    };

    var org_fee = otsv_fee(event);
    if (org_fee) {
      features.org_fee = true;
      angular.forEach(list, function(rider) {
	rider.org_fee = org_fee(rider);
      });
    }

    angular.forEach(list, function(rider) {
      angular.forEach(rider.rankings, function(ranking) {
	var field = rider.group ? 'groups' : 'riders';
	ranking = event.rankings[ranking - 1];
	if (ranking) {
	  if (ranking[field] == null)
	    ranking[field] = 0;
	  ranking[field]++;
	}
      });
    });

    angular.forEach(list, function(rider) {
      var match;
      if (rider.date_of_birth !== null &&
	  (match = rider.date_of_birth.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
	rider.date_of_birth = new Date(match[1], match[2] - 1, match[3]);
      if (rider.start_time !== null &&
	  (match = rider.start_time.match(/^(\d{2}):(\d{2}):(\d{2})$/)))
	rider.start_time = new Date(0, 0, 0, match[1], match[2], match[3]);
      if (rider.finish_time !== null &&
	  (match = rider.finish_time.match(/^(\d{2}):(\d{2}):(\d{2})$/)))
	rider.finish_time = new Date(0, 0, 0, match[1], match[2], match[3]);

      if (rider.insurance !== null && insurances[rider.insurance])
	rider.insurance = insurances[rider.insurance];

      var rankings = [];
      angular.forEach(rider.rankings, function(ranking) {
	rankings[ranking - 1] = true;
      });
      rider.rankings = rankings;

      if (rider['class'] !== null) {
	try {
	  var class_ = event.classes[rider['class'] - 1];
	  rider.ranking_class = class_.ranking_class;
	  if (class_.no_ranking1)
	    rider.rankings[0] = false;
	} catch(_) { }
      }

      if (rider.group)
	$scope.show.groups = true;
      else
	$scope.show.riders = true;
    });
    if ($scope.show.riders && $scope.show.groups)
      $scope.riders_groups = true;

    function country_province(rider) {
      var country_province = [];
      if (rider.country &&
	  (rider.country != event.country || !event.hide_country))
	country_province.push(rider.country);
      if (rider.province)
	country_province.push('(' + rider.province + ')');
      return country_province.join(' ');
    }

    $scope.ranking_name = function(ranking) {
      var r = event.rankings[ranking - 1];
      return r && r.name ? r.name : 'Wertung ' + ranking;
    };

    function groups_list(groups) {
      var liste = [];
      angular.forEach(groups, function(number) {
	var group = riders_by_number[number];
	if (group)
	  liste.push(group);
      });
      return liste.map(function(group) {
	return join(' ', group.last_name, group.first_name);
      }).sort(function(a, b) { return a.localeCompare(b); }).join(', ');
    }

    function address(rider) {
      var address = [], zip_city = [];
      if (rider.street != '' && rider.street != null)
	address.push(rider.street);
      if (rider.zip != '' && rider.zip != null)
	zip_city.push(rider.zip);
      if (rider.city != '' && rider.city != null)
	zip_city.push(rider.city);
      if (zip_city.length)
	address.push(zip_city.join(' '));
      return address.join(', ');
    }

    function rider_may_start(rider) {
      return rider.verified && (rider.registered || !features.registered);
    }

    var defined_fields = {
      verified:
	{ name: 'Verifiziert',
	  heading: 'Verifiziert',
	  value: function(rider) {
	    return rider.verified ? 'Ja' : null;
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'yesno' },
	  when: function() { return features.verified; } },
      number:
	{ name: 'Startnummer',
	  heading: '<span title="Startnummer">Nr.</span>',
	  value: function(rider) {
	    return rider.number < 0 ? null : rider.number;
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'number' },
	  when: function() { return features.number; } },
      'class':
	{ name: 'Klasse (in Nennung)',
	  heading: '<span title="Klasse (in Nennung)">Kl.</span>',
	  value: function(rider) {
	    return rider['class'];
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'class' },
	  when: function() { return features['class']; } },
      name:
	{ name: 'Name',
	  heading: 'Name',
	  value: function(rider) {
	    return join(' ', rider.last_name, rider.first_name);
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'name' },
	  },
      guardian:
	{ name: 'Ges. Vertreter',
	  heading: '<span title="Gesetzlicher Vertreter">Ges. Vertreter</span>',
	  value: function(rider) {
	    return rider.guardian;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'guardian' },
	  when: function() { return features.guardian; } },
      date_of_birth:
	{ name: 'Geburtsdatum',
	  heading: 'Geburtsdatum',
	  value: function(rider) {
	    return $scope.$eval("date_of_birth | date:'d.M.yyyy'", rider);
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'date_of_birth' },
	  when: function() { return features.date_of_birth; } },
      age_year:
	{ name: 'Jahrgang',
	  heading: 'Jahrgang',
	  value: function(rider) {
	    return $scope.$eval("date_of_birth | date:'yyyy'", rider);
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'age_year' },
	  when: function() { return features.date_of_birth; } },
      city:
	{ name: 'Wohnort',
	  heading: 'Wohnort',
	  value: function(rider) {
	    return rider.city;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'city' },
	  when: function() { return features.city; } },
      club:
	{ name: 'Club',
	  heading: 'Club',
	  value: function(rider) {
	    return rider.club;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'club' },
	  when: function() { return features.club; } },
      vehicle:
	{ name: 'Fahrzeug',
	  heading: 'Fahrzeug',
	  value: function(rider) {
	    return rider.vehicle;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'vehicle' },
	  when: function() { return features.vehicle; } },
      year_of_manufacture:
        { name: 'Baujahr',
	  heading: '<span title="Baujahr">Bj.</span>',
	  value: function(rider) {
	    return rider.year_of_manufacture;
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'year_of_manufacture' },
	  when: function() { return features.year_of_manufacture; } },
      zip:
	{ name: 'Postleitzahl',
	  heading: 'PLZ',
	  value: function(rider) {
	    return rider.zip;
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'zip' },
	  when: function() { return features.zip; } },
      country:
	{ name: 'Land',
	  heading: 'Land',
	  value: function(rider) {
	    return rider.country;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'country' },
	  when: function() { return features.country; } },
      address:
	{ name: 'Anschrift',
	  heading: 'Anschrift',
	  value: function(rider) {
	    return address(rider);
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'address' },
	  when: function() { return features.street || features.zip || features.city } },
      province:
	{ name: 'Bundesland',
	  heading: 'Bundesland',
	  value: function(rider) {
	    return rider.province;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'province' },
	  when: function() { return features.province; } },
      country_province:
	{ name: 'Land (Bundesland)',
	  heading: '<span title="Land (Bundesland)">Land</span>',
	  value: function(rider) {
	    return country_province(rider);
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'country_province' },
	  when: function() { return features.province || features.country; } },
      phone:
	{ name: 'Telefon',
	  heading: 'Telefon',
	  value: function(rider) {
	    return rider.phone;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'phone' },
	  when: function() { return features.phone; } },
      emergency_phone:
	{ name: 'Notfall-Telefon',
	  heading: 'Notfall-Telefon',
	  value: function(rider) {
	    return rider.emergency_phone;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'emergency_phone' },
	  when: function() { return features.emergency_phone; } },
      email:
	{ name: 'E-Mail',
	  heading: 'E-Mail',
	  value: function(rider) {
	    return rider.email;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'email' },
	  when: function() { return features.email; } },
      start_time:
	{ name: 'Startzeit',
	  heading: 'Startzeit',
	  value: function(rider) {
	    return $scope.$eval("start_time | date:'H:mm:ss'", rider);
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'time' },
	  when: function() { return features.start_time; } },
      finish_time:
	{ name: 'Zielzeit',
	  heading: 'Zielzeit',
	  value: function(rider) {
	    return $scope.$eval("finish_time | date:'H:mm:ss'", rider);
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'time' },
	  when: function() { return features.finish_time; } },
      registered:
	{ name: 'Nennungseingang',
	  heading: 'Nennungseingang',
	  value: function(rider) {
	    return rider.registered ? 'Ja' : null;
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'yesno' },
	  when: function() { return features.registered; } },
      start:
	{ name: 'Start',
	  heading: 'Start',
	  value: function(rider) {
	    return rider.start ? (rider_may_start(rider) ? 'Ja' : '?') : null;
	  },
	  style: { 'text-align': 'yesno' },
	  attr: { 'adjust-width': 'start' },
	  when: function() { return features.start; } },
      non_competing:
	{ name: 'Außer Konkurrenz',
	  heading: '<span title="Außer Konkurrenz">A.K.</span>',
	  value: function(rider) {
	    return rider.non_competing ? 'Ja' : null;
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'yesno' } },
      insurance:
	{ name: 'Versicherung',
	  heading: 'Versicherung',
	  value: function(rider) {
	    return rider.insurance;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'insurance' },
	  when: function() { return features.insurance; } },
      license:
	{ name: 'Lizenznummer',
	  heading: 'Lizenznr.',
	  value: function(rider) {
	    return rider.license;
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'license' },
	  when: function() { return features.license; } },
      current_round:
	{ name: 'Aktuelle Runde',
	  heading: '<span title="Aktuelle Runde">In Runde</span>',
	  value: function(rider) {
	    if (!rider.start || rider.failure)
	      return null;
	    try {
	      let ranking_class = event.classes[rider['class'] - 1].ranking_class;
	      if (rider.rounds >= event.classes[ranking_class - 1].rounds)
		return null;
	    } catch (_) {
	      return null;
	    }
	    return rider.rounds + 1;
	  },
	  style: { 'text-align': 'center' },
	  attr: { 'adjust-width': 'current_round' } },
      groups:
	{ name: 'Gruppen',
	  heading: 'Gruppen',
	  value: function(rider) {
	    return groups_list(rider.groups);
	  },
	  style: { 'text-align': 'left' },
	  attr: { 'adjust-width': 'groups' },
	  when: function() { return $scope.riders_groups; } },
      entry_fee:
	{ name: 'Nenngeld',
	  heading: 'Nenngeld',
	  value: function(rider) {
	    return rider.entry_fee;
	  },
	  style: { 'text-align': 'right' },
	  attr: { 'adjust-width': 'entry_fee' },
	  when: function() { return features.entry_fee; },
	  aggregieren: function(a, b) { if (a != null || b != null) return Number(a) + Number(b); } },
      org_fee:
	{ name: 'ÖTSV-Beitrag',
	  heading: 'ÖTSV-Beitrag',
	  value: function(rider) {
	    return rider.org_fee;
	  },
	  style: { 'text-align': 'right' },
	  attr: { 'adjust-width': 'org_fee' },
	  when: function() { return features.org_fee; },
	  aggregieren: function(a, b) { if (a != null || b != null) return Number(a) + Number(b); } },
    };
    angular.forEach([1, 2, 3, 4], function(ranking) {
      var name = $scope.ranking_name(ranking);
      defined_fields['ranking' + ranking] = {
	name: name,
	heading: name,
	value: function(rider) {
	  return rider.rankings[ranking - 1] ? 'Ja' : null;
	},
	style: { 'text-align': 'center' },
	when: function() { return event.rankings[ranking - 1]; }
      };
    });
    angular.forEach(defined_fields, function(field) {
      field.heading = $sce.trustAsHtml(field.heading);
    });

    $scope.field_list = (function() {
      var fields = [];
      angular.forEach(defined_fields, function(field, name) {
	if (!field.when || field.when())
	  fields.push(name);
      });
      var field_list = [];
      angular.forEach(fields, function(field) {
	field_list.push({ key: field, name: defined_fields[field].name });
      });
      field_list = field_list.sort(function(a, b) { return a.name.localeCompare(b.name); });
      field_list.unshift({ key: '', name: '' });
      return field_list;
    })();

    function any_start(rider) {
      return rider.start ||
	event.future_events.find(function(future_event) {
	  return future_event.active &&
	    rider.future_starts[future_event.fid];
        }) != undefined;
    }

    function filter(rider) {
      var show = $scope.show;
      if (show.verified !== null &&
	  !rider.verified == show.verified)
	return false;
      if ((rider.group && !show.groups) ||
	  (!rider.group && !show.riders))
	return false;
      if (show.number !== null &&
	  (rider.number >= 0) !== show.number)
	return false;
      if (show.registered !== null &&
	  !rider.registered == show.registered)
	return false;
      if (show.start !== null &&
	  !rider.start == show.start)
	return false;
      if (show.any_start !== null &&
	  !any_start(rider) == show.any_start)
	return false;
      for (var ranking = 1; ranking <= 4; ranking++) {
	if (show['ranking' + ranking] !== null &&
	    (rider.rankings[ranking - 1] === true) !==
	    show['ranking' + ranking])
	  return false;
      }
      if (show.number_min != null &&
	  rider.number < show.number_min)
	return false;
      if (show.number_max != null &&
	  rider.number > show.number_max)
	return false;
      if (show.year_min != null &&
	  (rider.date_of_birth == null ||
	   rider.date_of_birth.getYear() + 1900 < show.year_min))
	return false;
      if (show.year_max != null &&
	  rider.date_of_birth != null &&
	  rider.date_of_birth.getYear() + 1900 > show.year_max)
	return false;

      if (show.riding) {
	try {
	  var ranking_class = event.classes[rider['class'] - 1].ranking_class;
	  var class_ = event.classes[ranking_class - 1];
	  if (!rider.failure && rider.rounds < class_.rounds && !rider.group)
	    return true;
	} catch(_) { }
	return false;
      }
      return show.other_classes ?
	show.classes[rider.ranking_class] !== false :
	show.classes[rider.ranking_class];
    }

    function generic_group_by(list, compare) {
      var result = [];
      if (!list.length)
	return [];
      var group = [list[0]];
      for (var n = 1; n != list.length; n++) {
	if (compare(group[0], list[n])) {
	  result.push({group: group[0], list: group});
	  group = [];
	}
	group.push(list[n]);
      }
      result.push({group: group[0], list: group});
      return result;
    }

    function class_other(rider) {
      return $scope.show.classes[rider.ranking_class] !== undefined ?
	event.classes[rider.ranking_class - 1].order : null;
    }

    var group_by_functions = {
      ranking_class: {
	heading: function(f) {
	  function class_name(class_) {
	    var name = event.classes[class_ - 1].name;
	    if (name == null || name == '')
	      name = 'Klasse ' + class_;
	    return name;
	  }

	  return class_other(f) != null ?
		 class_name(f.ranking_class) :
		 'Andere Klassen';
	},
	compare: function(f1, f2) {
	  return generic_compare(class_other(f1), class_other(f2));
	}
      },
      city: {
	heading: function(f) {
	  return f.city || 'Wohnort nicht bekannt';
	},
	compare: function(f1, f2) {
	  return generic_compare(f1.city, f2.city);
	}
      },
      vehicle: {
	heading: function(f) {
	  return f.vehicle || 'Fahrzeug nicht bekannt';
	},
	compare: function(f1, f2) {
	  return generic_compare(f1.vehicle, f2.vehicle);
	}
      },
      club: {
	heading: function(f) {
	  return f.club || 'Kein Club oder Club nicht bekannt';
	},
	compare: function(f1, f2) {
	  return generic_compare(f1.club, f2.club);
	}
      },
      insurance: {
	heading: function(f) {
	  return f.insurance || 'Versicherung nicht bekannt';
	},
	compare: function(f1, f2) {
	  return generic_compare(f1.insurance, f2.insurance);
	}
      },
      country_province: {
	heading: function(f) {
	  var cp = country_province(f);
	  return cp === '' ? 'Land / Bundesland nicht bekannt' : cp;
	},
	compare: function(f1, f2) {
	  return generic_compare(f1.country, f2.country) ||
		 generic_compare(f1.province, f2.province);
	}
      },
      org_fee: {
	heading: function(f) {
	  return f.org_fee ? 'ÖTSV-Beitrag €' + f.org_fee : 'Keine Abgabe';
	},
	compare: function(f1, f2) {
	  return generic_compare(f1.org_fee, f2.org_fee);
	}
      },
      group: {
	heading: function(f) {
	  return f ? join(' ', f.last_name, f.first_name) : 'Keine Gruppen';
	},
	group_by: function(list) {
	  var groups = {}, no_groups = [];
	  angular.forEach(list, function(rider) {
	    if (rider.groups && rider.groups.length) {
	      angular.forEach(rider.groups, function(number) {
		if (!groups[number])
		  groups[number] = [];
		groups[number].push(rider);
	      });
	    } else
	      no_groups.push(rider);
	  });

	  var resulting_list = [];
	  if (no_groups.length)
	    resulting_list.push({group: null, list: no_groups});
	  return resulting_list.concat(
	    Object.keys(groups).map(function(number) {
	      return {
		group: riders_by_number[number],
		list: groups[number]
	      };
	    }).sort(function(g1, g2) {
	      return generic_compare(g1.group.last_name, g2.group.last_name) ||
		     generic_compare(g1.group.first_name, g2.group.first_name);
	    })
	  );
	}
      }
    };

    var order_by_functions = {
      number: function(f1, f2) {
	return generic_compare(f1.number, f2.number);
      },
      name: function(f1, f2) {
	return generic_compare(f1.last_name, f2.last_name) ||
	       generic_compare(f1.first_name, f2.first_name);
      },
      date_of_birth: function(f1, f2) {
	return generic_compare(f2.date_of_birth, f1.date_of_birth);
      },
      start_time: function(f1, f2) {
	return generic_compare(f1.start_time, f2.start_time);
      },
      finish_time: function(f1, f2) {
	return generic_compare(f1.finish_time, f2.finish_time);
      },
    };

    $scope.group_heading = function(group) {
      var group_by = group_by_functions[$scope.show.group_by];
      if (group_by)
	return group_by.heading(group);
    };

    var tristate_options = (function() {
      var fields = ['number', 'registered', 'start', 'any_start', 'verified'];
      for (var n = 1; n <= 4; n++)
	fields.push('ranking' + n);
      return fields;
    })();

    function from_url(search) {
      var show = angular.copy(search);

      angular.forEach(tristate_options, function(option) {
	if (show[option] === 'yes')
	  show[option] = true;
	else if (show[option] === 'no')
	  show[option] = false;
	else
	  show[option] = null;
      });
      angular.forEach(['min', 'max'], function(option) {
	if (show[option] === undefined)
	  show[option] = null;
	else
	  show[option] = +show[option];
      });
      var classes = starting_classes();
      angular.forEach(show['hidden-class'], function(class_) {
	if (classes[class_] !== undefined)
	  classes[class_] = false;
      });
      show.classes = classes;

      delete show['hidden-class'];
      show.other_classes = show.other_classes == 'yes';

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
    }

    function to_url(show) {
      var search = angular.copy(show);

      angular.forEach(tristate_options, function(option) {
	if (search[option] === null)
	  search[option] = '-'
	else
	  search[option] = search[option] ? 'yes' : 'no';
      });

      var hidden_classes = [];
      angular.forEach(search.classes, function(value, key) {
	if (value === false)
	  hidden_classes.push(key);
      });
      if (hidden_classes.length)
	search['hidden-class'] = hidden_classes;
      delete search.classes;
      search.other_classes = search.other_classes ? 'yes' : 'no';

      var fields = search.fields;
      if (fields[fields.length - 1] === '')
	fields.pop();
      search.field = fields;
      delete search.fields;

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

    function update() {
      var filtered = list.filter(filter);

      $scope.num_riders = 0;
      $scope.num_groups = 0;
      angular.forEach(filtered, function(rider) {
	if (rider.group)
	  $scope.num_groups++;
	else
	  $scope.num_riders++;
      });

      var resulting_list = (function(list) {
	var group_by = group_by_functions[$scope.show.group_by];
	if (group_by) {
	  if (group_by.group_by)
	    return group_by.group_by(filtered);
	  else {
	    var compare = group_by.compare;
	    return generic_group_by(filtered.sort(compare), compare);
	  }
	} else
	  return [{group: null, list: list}];
      })(filtered);

      var sortieren = order_by_functions[$scope.show.order_by];
      if (sortieren) {
	angular.forEach(resulting_list, function(group) {
	  group.list = group.list.sort(sortieren);
	});
      }
      $scope.resulting_list = resulting_list;

      var aggregat_berechnen = false;
      angular.forEach($scope.fields, function(field) {
	if (field.aggregieren)
	  aggregat_berechnen = true;
      });

      $scope.aggregat = [];
      if (aggregat_berechnen) {
	angular.forEach($scope.resulting_list, function(group) {
	  var liste = [];
	  angular.forEach($scope.fields, function(field) {
	    var agg = null;
	    if (field.aggregieren)
	      angular.forEach(group.list, function(rider) {
		agg = field.aggregieren(agg, field.value(rider));
	      });
	    liste.push(agg);
	  });
	  $scope.aggregat.push(liste);
	});
      }

      update_url();
    };

    $scope.nur_wenn_positiv = function(x) {
      if (x > 0)
	return x;
    };

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

    $scope.settings = function(event) {
      event.preventDefault();
      event.target.blur();
      $scope.fold.settings = !$scope.fold.settings;
    }

    function riders_list(grouped_list) {
      return grouped_list.reduce(function(riders, group) {
	group.list.reduce(function(riders, rider) {
	  if (!rider.group)
	    riders.push(rider);
	  return riders;
	}, riders);
	return riders;
      }, []);
    }

    $scope.pdf_forms = function(form) {
      var riders = riders_list($scope.resulting_list);

      $window.location.href = '/api/event/' + event.id + '/pdf-form?' +
	'name=' + encodeURIComponent(form.name) +
	riders.map(function(rider) {
	  return '&number=' + encodeURIComponent(rider.number);
	}).join('');
    }

    $scope.print_direct = function(form) {
      var riders = riders_list($scope.resulting_list);

      $http.post('/api/event/' + event.id + '/pdf-form?' +
	'name=' + encodeURIComponent(form.name) +
	riders.map(function(rider) {
	  return '&number=' + encodeURIComponent(rider.number);
	}).join(''), '')
      /**/.then(function(response) {
	console.log(response.data)
      })/**/
      .catch(network_error);
    }

    $scope.$watch('show.riders_groups', function(value) {
      $scope.show.riders = value != 'groups';
      $scope.show.groups = value != 'riders';
      if (!$scope.show.riders) {
	$scope.show.registered = null;
	$scope.show.riding = false;
      }
      angular.forEach(event.rankings, function(ranking, index) {
	if (!$scope.show.riders && !ranking.riders)
	  $scope.show['ranking' + (index + 1)] = null;
	else if (!$scope.show.groups && !ranking.groups)
	  $scope.show['ranking' + (index + 1)] = null;
      });
    });
    $scope.$watch('show.start', function(value) {
      if (!value)
	$scope.show.riding = false;
    });
    $scope.$watch('show.any_start', function(value) {
      if (value != null) {
	$scope.show.registered = null;
	$scope.show.start = null;
      } else {
	if (features.registered)
	  $scope.show.registered = true;
	$scope.show.start = true;
      }
    });
    $scope.$watch('show.riding', function(value) {
      if (value) {
	$scope.show.riders_groups = 'riders';
	$scope.show.verified = true;
	if (features.registered)
	  $scope.show.registered = true;
	$scope.show.start = true;
	var current_round;
	angular.forEach($scope.show.fields, function(field) {
	  if (field === 'current_round')
	    current_round = true;
	});
	if (!current_round)
	  $scope.show.fields.push('current_round');
	  $scope.show.subtitle = 'Fahrer auf der Strecke';
      }
    });
    $scope.$watch('show.verified', function(value) {
      if (!value)
	$scope.show.riding = false;
    });
    if (features.registered) {
      $scope.$watch('show.registered', function(value) {
	if (!value)
	  $scope.show.riding = false;
      });
    }
    $scope.$watch('show', update, true);
    $scope.$watch('show.fields', function(fields) {
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
      update();
      $timeout(adjust_width);
    }, true);

    $scope.$on('$routeUpdate', function() {
      if ($scope.ignoreRouteUpdate) {
	delete $scope.ignoreRouteUpdate;
	return;
      }

      var fields = [];
      angular.forEach(['number', 'name'], function(field) {
	var when = defined_fields[field].when;
	if (!when || when())
	  fields.push(field);
      });

      var defaults = {
	verified: 'yes',
	start: 'yes',
	group_by: 'ranking_class',
	order_by: features.number ? 'number' : 'name',
	other_classes: 'yes',
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
      if (features.registered)
	defaults.registered = 'yes';

      var search = $location.search();
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
  }];

eventListController.resolve = {
  event: function($q, $http, $route) {
    return http_request($q, $http.get('/api/event/' + $route.current.params.id));
  },
  list: function($q, $http, $route) {
    return http_request($q, $http.get('/api/event/' + $route.current.params.id + '/list'));
  },
};

angular.module('application').controller('eventListController', eventListController);
