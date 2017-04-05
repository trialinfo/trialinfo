'use strict;'

var eventController = [
  '$routeParams', '$scope', '$cookies', '$window', '$timeout', '$http', 'event', 'riders', 'suggestions',
  function ($routeParams, $scope, $cookies, $window, $timeout, $http, event, riders, suggestions) {
    $scope.context('Voranmeldung für ' + event.title);

    $scope.user = JSON.parse(atob($cookies['trialinfo.session'])).passport.user;

    $scope.event = event;
    if (event.date) {
      var date = new Date(event.date);
      $scope.date = date;
      $scope.date_tomorrow = new Date(
        date.getTime() + 1000 * 60 * 60 * 24);
    }
    $scope.features = event.features;
    $scope.suggestions = suggestions;

    $scope.riders = riders;
    $scope.internal = {};

    /* FIXME: In Angular = 1.4, use ng-values="... disable when ..." instead of
     * filtering classes here! */

    var class_disabled = [];
    $scope.defined_classes = function() {
      var defined_classes = [];
      return function() {
	new_defined_classes = [];
	angular.forEach(event.classes, function(name, index) {
	  if (name != null && !class_disabled[index]) {
	    new_defined_classes.push({
	      'class': index + 1,
	      name: name
	    });
	  }
	});
	if (!angular.equals(defined_classes, new_defined_classes))
	  defined_classes = new_defined_classes;
	return defined_classes;
      };
    }();

    $scope.change_rider = function(index) {
      var rider = riders[index];
      if (!rider) {
	rider = {
	  country: 'A',
	  email: $scope.user.email,
	};
      }

      $scope.old_rider = rider;
      $scope.rider = angular.copy(rider);
      $scope.internal.index = index;
      $scope.blur_country();
    }

    $scope.guardian_visible = function(rider) {
      return guardian_visible(rider, event);
    }

    $scope.license_visible = function(rider) {
      return event.type == null ||
	     !event.type.match(/^otsv(\+osk|\+amf)?\d{4}$/) ||
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
      if (class_disabled[class_ - 1] != disabled)
	class_disabled[class_ - 1] = disabled;
    }

    function otsv_check_class() {
      var rider = $scope.rider;

      if (rider == null)
	return;

      if (event.type != null &&
	  event.type.match(/^otsv(\+osk|\+amf)?\d{4}$/)) {
	if ($scope.age_year) {
	  if ($scope.age_year >= 45) {
	    if (rider.class == 3)
	      rider.class = 4;
	  } else {
	    if (rider.class == 4)
	      rider.class = 3;
	  }

	  if ($scope.age_year >= 45) {
	    if (rider.class == 5 || rider.class == 9)
	      rider.class = 6;
	  } else if ($scope.age_year >= 12) {
	      if (rider.class == 6 || rider.class == 9)
		rider.class = 5;
	  } else {
	    if (rider.class == 5 || rider.class == 6)
	      rider.class = 9;
	  }
	}

	disable_class(3, $scope.age_year && $scope.age_year >= 45);
	disable_class(4, $scope.age_year && $scope.age_year < 45);
	disable_class(5, $scope.age_year && $scope.age_year >= 45);
	disable_class(6, $scope.age_year && $scope.age_year < 45);

	disable_class(9, $scope.age_year && $scope.age_year >= 12);

	disable_class(11, $scope.age && $scope.age < 14);
	disable_class(12, ($scope.age && $scope.age < 12) ||
			  ($scope.age_year && $scope.age_year > 17));
	disable_class(13, ($scope.age && $scope.age < 10) ||
			  ($scope.age_year && $scope.age_year > 15));
      }

      $scope.form.$setValidity('min-age',
	!$scope.min_age || $scope.age >= $scope.min_age);
      $scope.form.$setValidity('max-age',
	!$scope.max_age || $scope.age <= $scope.max_age);
      $scope.form.$setValidity('min-age-year',
	!$scope.min_age_year || $scope.age_year >= $scope.min_age_year);
      $scope.form.$setValidity('max-age-year',
	!$scope.max_age_year || $scope.age_year <= $scope.max_age_year);
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

    $scope.year_for_age = function(age) {
      return new Date().getFullYear() - age - 1;
    }

    $scope.$watch('rider.class', function(class_) {
      delete $scope.min_age;
      delete $scope.max_age;
      delete $scope.min_age_year;
      delete $scope.max_age_year;

      if (event.type != null) {
	if (event.type.match(/^otsv(\+osk|\+amf)?\d{4}$/)) {
	  if (class_ == 3) {
	    $scope.max_age_year = 44;
	  } else if (class_ == 5) {
	    $scope.min_age_year = 12;
	    $scope.max_age_year = 44;
	  } else if (class_ == 4 || class_ == 6) {
	    $scope.min_age_year = 45;
	  } else if (class_ == 9) {
	    $scope.max_age_year = 11;
	  } else if (class_ == 11) {
	    $scope.min_age = 14;
	  } else if (class_ == 12) {
	    $scope.min_age = 12;
	    $scope.max_age_year = 17;
	  } else if (class_ == 13) {
	    $scope.min_age = 10;
	    $scope.max_age_year = 15;
	  }
	} else if (event.type.match(/^otsv-ecup2017/)) {
	  if (class_ == 1) {
            $scope.max_age_year = 6;
          } else if (class_ == 2 || class_ == 3) {
            $scope.min_age_year = 7;
            $scope.max_age_year = 8;
          } else if (class_ == 4) {
            $scope.min_age_year = 9;
          } else if (class_ == 5) {
            $scope.min_age_year = 10;
            $scope.max_age_year = 13;
          } else if (class_ == 6) {
            $scope.min_age_year = 13;
            $scope.max_age_year = 15;
          }
	}
      }

      otsv_check_class();
    });

    $scope.countries = countries.map(function(country) {
      return {
	name: country.name /* + ' (' + country.codes[0] + ')' */,
	code: country.codes[0]
      };
    });
    $scope.countries.push({
      name: 'Anderes Land',
      code: null
    });

    var country_codes = {};
    countries.forEach(function(country) {
      if (country.codes[0]) {
	country_codes[country.name.toLocaleUpperCase()] = country.codes[0];
	country.codes.forEach(function(code) {
	  country_codes[code] = country.codes[0];
	});
      }
    });

    $scope.$watch('internal.country', function(country) {
      var rider = $scope.rider;

      if (rider == null)
	return;

      if (rider.country != country) {
	rider.country = country;
	if (country != 'A')
	  rider.province = null;
	if (country == null)
	  set_focus('#country', $timeout);
      }
    });

    $scope.blur_country = function() {
      if (!$scope.otsv_event())
	return;

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

    $scope.required_error = function(field) {
      return field.$error.required;
    }

    $scope.save_rider = function() {
      if ($scope.busy)
	return;
      $scope.busy = true;
      var rider = $scope.rider; // $scope.riders[$scope.internal.index];
      var request;
      if (rider.number) {
	request = $http.put('/api/register/event/' + $routeParams.id + '/rider/' + rider.number, rider);
      } else {
	request = $http.post('/api/register/event/' + $routeParams.id + '/rider', rider);
      }
      request.success(function (rider) {
	$scope.riders[$scope.internal.index] = rider;
	$scope.reset_rider();
	// $scope.rider = rider;
	// $scope.old_rider = angular.copy(rider);
      }).error(function (error) {
	$timeout(function() {
	  alert(JSON.stringify(error));
	});
      }).finally(function() {
	delete $scope.busy;
      });
    };

    $scope.reset_rider = function() {
      delete $scope.rider;
      delete $scope.old_rider;
      delete $scope.internal.index;
    }

    function rider_info(rider) {
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

    $scope.rider_info = rider_info;

    $scope.remove_rider = function() {
      $timeout(function() {
	if (confirm('Fahrer ' + rider_info($scope.rider) + ' wirklich löschen?')) {
	  if ($scope.busy)
	    return;
	  $scope.busy = true;
	  $http.delete('/api/register/event/' + $routeParams.id + '/rider/' + $scope.rider.number,
		       {params: {version: $scope.rider.version}})
	  .success(function (rider) {
	    $scope.riders.splice($scope.internal.index, 1);
	    $scope.reset_rider();
	  }).error(function (error) {
	    $timeout(function() {
	      alert(JSON.stringify(error));
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
      var usec = (new Date(event.registration_ends)).getTime() - Date.now();
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
