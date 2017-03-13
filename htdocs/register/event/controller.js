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

    $scope.$watch('internal.index', switch_rider);
    $scope.internal.index = '0';

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

    function switch_rider(new_index, old_index) {
      if (new_index < 0)
	new_index = 0;
      if ($scope.riders.length > 1 &&
	  $scope.riders[old_index].number == null) {
	$scope.riders.splice(old_index, 1);
	if (new_index > old_index)
	  new_index--;
      }
      if (new_index != $scope.internal.index)
	$scope.internal.index = '' + new_index;

      var rider = riders[new_index];
      if (!rider) {
	rider = {
	  country: 'A',
	  email: $scope.user.email,
	};
	riders[new_index] = rider;
      }

      $scope.rider = rider;
      $scope.old_rider = angular.copy(rider);
      $scope.blur_country();
    }

    $scope.rider_info = function(rider) {
      var info = [], name = [];
      if (rider.first_name)
	name.push(rider.first_name);
      if (rider.last_name)
	name.push(rider.last_name);
      name = name.join(' ');
      if (name)
	info.push(name);
      if (rider.number && rider.number >= 0)
	info.push('(' + rider.number + ')');
      return info.join(' ');
    };

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
      delete $scope.min_age;
      delete $scope.max_age_year;

      if (event.type != null &&
	  event.type.match(/^otsv(\+osk|\+amf)?\d{4}$/)) {
	if ($scope.age_year >= 45) {
	  if (rider.class == 3 || rider.class == 5)
	    rider.class++;
	} else {
	  if (rider.class == 4 || rider.class == 6)
	    rider.class--;
	}

	disable_class(3, $scope.age_year && $scope.age_year >= 45);
	disable_class(4, $scope.age_year && $scope.age_year < 45);
	disable_class(5, $scope.age_year && $scope.age_year >= 45);
	disable_class(6, $scope.age_year && $scope.age_year < 45);

	if (rider.class == 11) {
	  $scope.min_age = 14;
	} else if (rider.class == 12) {
	  $scope.min_age = 12;
	  $scope.max_age_year = 17;
	} else if (rider.class == 13) {
	  $scope.min_age = 10;
	  $scope.max_age_year = 15;
	}

	disable_class(11, $scope.age && $scope.age < 14);
	disable_class(12, ($scope.age && $scope.age < 12) ||
			  ($scope.age_year && $scope.age_year > 17));
	disable_class(13, ($scope.age && $scope.age < 10) ||
			  ($scope.age_year && $scope.age_year > 15));
      }

      $scope.form.$setValidity('min-age',
	!$scope.min_age || $scope.age >= $scope.min_age);
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
      otsv_check_class();
    });

    $scope.countries = [
      {name: 'Deutschland', codes: ['D', 'DE', 'DEU']},
      {name: 'Frankreich', codes: ['F', 'FR', 'FRA']},
      {name: 'Großbritannien', codes: ['GB', 'GBR']},
      {name: 'Italien', codes: ['I', 'IT', 'ITA']},
      {name: 'Kroation', codes: ['HR', 'HRV']},
      {name: 'Niederlande', codes: ['NL', 'NLD']},
      {name: 'Österreich', codes: ['A', 'AT', 'AUT', 'Ö']},
      {name: 'Polen', codes: ['PL', 'POL']},
      {name: 'Schweiz', codes: ['CH', 'CHE']},
      {name: 'Slowakei', codes: ['SK', 'SVK']},
      {name: 'Slowenien', codes: ['SI', 'SVN']},
      {name: 'Spanien', codes: ['E', 'ES', 'ESP']},
      {name: 'Tschechien', codes: ['CZ', 'CZE']},
      {name: 'Ungarn', codes: ['H', 'HU', 'HUN']},
      {name: 'Anderes Land', codes: [null]},
    ];

    var countries = {};
    $scope.countries.forEach(function(country) {
      if (country.codes[0]) {
	countries[country.name.toLocaleUpperCase()] = country.codes[0];
	country.codes.forEach(function(code) {
	  countries[code] = country.codes[0];
	});
	country.name = country.name + ' (' + country.codes[0] + ')';
      }
    });

    $scope.$watch('internal.country', function(country) {
      if ($scope.rider.country != country) {
	$scope.rider.country = country;
	if (country != 'A')
	  $scope.rider.province = null;
      }
    });

    $scope.blur_country = function() {
      if (!$scope.otsv_event())
	return;

      var country = $scope.rider.country;
      if (country != null) {
	country = country.toLocaleUpperCase();
	if (countries[country]) {
	  country = countries[country];
	  if ($scope.internal.country != country)
	    $scope.internal.country = country;
	}
      }
    };

    $scope.save_rider = function() {
      if ($scope.busy)
	return;
      $scope.busy = true;
      var rider = $scope.riders[$scope.internal.index];
      var request;
      if ($scope.rider.number) {
	request = $http.put('/api/register/event/' + $routeParams.id + '/rider/' + $scope.rider.number, rider);
      } else {
	request = $http.post('/api/register/event/' + $routeParams.id + '/rider', rider);
      }
      request.success(function (rider) {
	$scope.riders[$scope.internal.index] = rider;
	$scope.rider = rider;
	$scope.old_rider = angular.copy(rider);
      }).error(function (error) {
	$timeout(function() {
	  alert(JSON.stringify(error));
	});
      }).finally(function() {
	delete $scope.busy;
      });
    };

    $scope.reset_rider = function() {
      if ($scope.rider.number) {
        $scope.riders[$scope.internal.index] =
	  $scope.rider =
	    angular.copy($scope.old_rider);
      } else
	$scope.internal.index = '' + ($scope.internal.index - 1);
    };

    $scope.remove_rider = function() {
      $timeout(function() {
	var rider_name = [];
	if ($scope.rider.first_name)
	  rider_name.push($scope.rider.first_name);
	if ($scope.rider.last_name)
	  rider_name.push($scope.rider.last_name);
	rider_name = rider_name.join(' ');

	if (confirm('Fahrer ' + $scope.rider_info($scope.rider) + ' wirklich löschen?')) {
	  if ($scope.busy)
	    return;
	  $scope.busy = true;
	  $http.delete('/api/register/event/' + $routeParams.id + '/rider/' + $scope.rider.number,
		       {params: {version: $scope.rider.version}})
	  .success(function (rider) {
	    $scope.riders.splice($scope.internal.index, 1);
	    $scope.internal.index = '' + ($scope.internal.index - 1);
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
      $scope.internal.index = '' + riders.length;
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
