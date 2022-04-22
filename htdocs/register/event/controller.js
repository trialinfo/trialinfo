'use strict';

var eventController = [
  '$routeParams', '$scope', '$cookies', '$window', '$timeout', '$http', '$anchorScroll', 'setFocus', 'event', 'riders', 'suggestions',
  function ($routeParams, $scope, $cookies, $window, $timeout, $http, $anchorScroll, setFocus, event, riders, suggestions) {
    $scope.context('Voranmeldung');

    try {
      $scope.user = JSON.parse(atob($cookies.get('trialinfo.session'))).passport.user;
    } catch(_) { }

    $scope.event = event;
    if (event.date) {
      var date = parse_timestamp(event.date);
      $scope.date = date;
      $scope.date_tomorrow = new Date(
        date.getTime() + 1000 * 60 * 60 * 24);
    }
    $scope.features = event.features;
    $scope.suggestions = suggestions;

    $scope.riders = riders;
    $scope.internal = {};

    $scope.class_disabled = [];
    $scope.defined_classes = event.classes.reduce(
      function(classes, class_, index) {
	if (class_) {
	  classes.push({
	    'class': index + 1,
	    name: class_.name
	  });
	}
	return classes;
      }, []);

    $scope.change_rider = function(index) {
      var rider = riders[index];
      if (!rider) {
	rider = {
	  country: event.country,
	  province: null,
	  future_starts: {},
	  insurance: event.insurance,
	  accept_conditions: false
	};
	rider.email = $scope.user.email;
      }

      $scope.old_rider = rider;
      $scope.rider = angular.copy(rider);
      $scope.internal.index = index;
      $scope.blur_country();

      $scope.internal.conditions = !rider.accept_conditions;

      $timeout(function() {
	for (let control of $scope.form.$$controls) {
          control.$setDirty();
          control.$validate();
	}
      });
    }

    $scope.guardian_visible = function(rider) {
      return guardian_visible(rider, event);
    }

    $scope.license_visible = function(rider) {
      return event.type == null ||
	     !event.type.match(/^otsv(\+amf)?$/) ||
             (rider['class'] >= 11 && rider['class'] <= 13);
    }

    $scope.otsv_event = function() {
      return event.type != null && !!event.type.match(/^otsv/);
    }

    $scope.modified = function() {
      return !angular.equals($scope.old_rider, $scope.rider);
    };

    function disable_class(class_, disabled) {
      disabled = !!disabled;
      if ($scope.class_disabled[class_ - 1] != disabled)
	$scope.class_disabled[class_ - 1] = disabled;
    }

    function otsv_check_class() {
      var rider = $scope.rider;

      if (rider == null)
	return;

      let damencup = rider.rankings[1];

      if (event.type != null &&
	  event.type.match(/^otsv(\+amf)?$/)) {
	if (damencup) {
	  if ((rider.class >= 1 && rider.class <= 4) ||
	      rider.class == 6 ||
	      (rider.class >= 11 && rider.class <= 13))
	    rider.class = 5;
	} else if ($scope.age_year) {
	  if ($scope.age_year >= 45) {
	    if (rider.class == 3)
	      rider.class = 4;
	    else if (rider.class == 5)
	      rider.class = 6;
	  } else {
	    if (rider.class == 4)
	      rider.class = 3;
	    else if (rider.class == 6)
	      rider.class = 5;
	  }
	}

	disable_class(1, damencup);
	disable_class(2, damencup);
	disable_class(3, ($scope.age_year && $scope.age_year >= 45) || damencup);
	disable_class(4, ($scope.age_year && $scope.age_year < 45) || damencup);
	disable_class(5, $scope.age_year && $scope.age_year >= 45 && !damencup);
	disable_class(6, ($scope.age_year && $scope.age_year < 45) || damencup);

	disable_class(11, ($scope.age && $scope.age < 14) || damencup);
	disable_class(12, (($scope.age && $scope.age < 12) ||
			   ($scope.age_year && $scope.age_year > 17)) || damencup);
	disable_class(13, (($scope.age && $scope.age < 10) ||
			   ($scope.age_year && $scope.age_year > 15)) || damencup);
      }

      $scope.form.$setValidity('min-age',
	!$scope.min_age || $scope.age >= $scope.min_age || damencup);
      $scope.form.$setValidity('max-age',
	!$scope.max_age || $scope.age <= $scope.max_age || damencup);
      $scope.form.$setValidity('min-age-year',
	!$scope.min_age_year || $scope.age_year >= $scope.min_age_year || damencup);
      $scope.form.$setValidity('max-age-year',
	!$scope.max_age_year || $scope.age_year <= $scope.max_age_year || damencup);
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

      otsv_check_class();
    });

    $scope.$watch('rider.rankings', function() {
      otsv_check_class();
    }, true);

    var year_of_event = (date_of_event(event) || new Date()).getFullYear();
    $scope.year_for_age = function(age) {
      return year_of_event - age - 1;
    }

    $scope.$watch('rider.class', function(class_) {
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

      otsv_check_class();
    });

    $scope.countries = countries.map(function(country) {
      return {
	name: country.name,
	code: country.codes[0]
      };
    });
    $scope.countries.push({
      name: 'Anderes Land',
      code: null
    });

    var country_codes = {};
    for (let country of countries) {
      if (country.codes[0]) {
	country_codes[country.name.toLocaleUpperCase()] = country.codes[0];
	for (let code of country.codes) {
	  country_codes[code.toLocaleUpperCase()] = country.codes[0];
	}
      }
    }

    $scope.provinces = [{
      name: '',
      code: null
    }];
    if (provinces[event.country]) {
      provinces[event.country].forEach(function(province) {
	$scope.provinces.push({
	  name: province.name,
	  code: province.codes[0]
	});
      });
    }

    $scope.hasFutureEvents = Object.keys(event.future_events).length != 0;

    $scope.number_of_starts = function(rider) {
      return rider.start + Object.keys(rider.future_starts).length;
    }

    $scope.$watch('internal.country', function(country) {
      var rider = $scope.rider;

      if (rider == null)
	return;

      if (rider.country != country) {
	rider.country = country;
	rider.province = null;
	if (country == null)
	  setFocus('#country');
      }
    });

    $scope.blur_country = function() {
      var country_code = $scope.rider.country;
      if (country_code != null) {
	country_code = country_code.toLocaleUpperCase();
	if (country_codes[country_code]) {
	  country_code = country_codes[country_code];
	  if ($scope.internal.country != country_code)
	    $scope.internal.country = country_code;
	}
      }
    };

    $scope.$watch('rider.future_starts', function() {
      if ($scope.rider) {
	var future_starts = $scope.rider.future_starts;
	Object.keys(future_starts).forEach(function(fid) {
	  if (!future_starts[fid])
	    delete future_starts[fid];
	});
      }
    }, true);

    $scope.required_error = function(field) {
      return field.$error.required;
    }

    $scope.show_conditions = function() {
      $scope.internal.conditions = true;
      $timeout(function() {
	$anchorScroll('conditions');
      });
    };

    $scope.save_rider = function() {
      if ($scope.busy)
	return;
      $scope.busy = true;
      var rider = $scope.rider;
      var request;
      var params = {
	event_version: event.version
      };
      if (rider.number) {
	request = $http.put('/api/register/event/' + $routeParams.id + '/rider/' + rider.number, rider,
			    {params: params});
      } else {
	request = $http.post('/api/register/event/' + $routeParams.id + '/rider', rider,
			    {params: params});
      }
      request.then(function (response) {
	let rider = response.data;
	$scope.riders[$scope.internal.index] = rider;
	$scope.back();
      }).catch(function (response) {
	$timeout(function() {
	  alert(JSON.stringify(response.data));
	});
      }).finally(function() {
	delete $scope.busy;
      });
    };

    $scope.reset_rider = function() {
      $scope.rider = angular.copy($scope.old_rider);
    };

    $scope.back = function() {
      delete $scope.rider;
      delete $scope.old_rider;
      delete $scope.internal.index;
    }

    function riderInfo(rider) {
      var infos = [];
      if (rider.first_name !== null && rider.first_name !== '')
	infos.push(rider.first_name);
      if (rider.last_name !== null && rider.last_name !== '')
	infos.push(rider.last_name);

      var infos2 = [];
      if (rider.number !== null && rider.number >= 0)
	infos2.push(rider.number);
      if (rider.date_of_birth != null)
	infos2.push($scope.$eval('rider.date_of_birth | date:"d.M.yyyy"', {rider: rider}));
      if (infos2.length)
	infos.push('(' + infos2.join(', ') + ')');

      return infos.join(' ');
    }

    $scope.riderInfo = riderInfo;

    $scope.event_label = function(event) {
      var label = event.title;
      if (event.location)
        label = event.location;
      if (event.date)
	label += ' am ' + $scope.$eval('date | date:"d. MMMM"', event);
      if (event.type != null) {
	var event_type = event_types.find(function(event_type) {
	  return event_type.value == event.type;
	});
	if (event_type)
	  label += ' (' + event_type.name + ')';
      }
      return label;
    };

    $scope.remove_rider = function() {
      $timeout(function() {
	if (confirm('Fahrer ' + riderInfo($scope.rider) + ' wirklich löschen?')) {
	  if ($scope.busy)
	    return;
	  $scope.busy = true;
	  var params = {
	    version: $scope.rider.version,
	    event_version: event.version
	  };
	  $http.delete('/api/register/event/' + $routeParams.id + '/rider/' + $scope.rider.number,
		       {params: params})
	  .then(function () {
	    $scope.riders.splice($scope.internal.index, 1);
	    $scope.back();
	  }).catch(function (response) {
	    $timeout(function() {
	      alert(JSON.stringify(response.data));
	    });
	  }).finally(function() {
	    delete $scope.busy;
	  });
	}
      });
    };

    $scope.new_rider = function() {
      $scope.change_rider($scope.riders.length);
    }

    $scope.logout = function() {
      $window.location.href = '/logout';
    };

    function kick() {
      var usec = parse_timestamp(event.registration_ends).getTime() - Date.now();
      if (usec > 0) {
        $scope.remaining_time = remaining_time(event.registration_ends);
        $timeout(kick, usec % 1000 + 100);
      } else {
        delete $scope.remaining_time;
      }
    }
    if (event.registration_ends)
      kick();

    if (!riders.length)
      $scope.change_rider(0);
  }];

eventController.resolve = {
  event: [
    '$http', '$route',
    function($http, $route) {
      var params = $route.current.params;
      return $http.get('/api/register/event/' + params.id)
        .then(function(response) {
	  return response.data;
	});
    }],
  riders: [
    '$http', '$route',
    function($http, $route) {
      var params = $route.current.params;
      return $http.get('/api/register/event/' + params.id + '/riders')
        .then(function(response) {
	  return response.data;
	});
    }],
  suggestions: [
    '$http', '$route',
    function($http, $route) {
      var params = $route.current.params;
      return $http.get('/api/register/event/' + params.id + '/suggestions')
        .then(function(response) {
	  return response.data;
	});
    }],
};

angular.module('application').controller('eventController', eventController);
