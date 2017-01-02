'use strict;'

var eventController = [
  '$routeParams', '$scope', '$cookies', '$window', '$timeout', '$http', 'event', 'riders', 'suggestions',
  function ($routeParams, $scope, $cookies, $window, $timeout, $http, event, riders, suggestions) {
    $scope.context('Registrierung für ' + event.title);

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

    $scope.defined_classes = [];
    angular.forEach(event.classes, function(class_, index) {
      if (class_ != null) {
	$scope.defined_classes.push({
	  'class': index + 1,
	  name: class_
	});
      }
    });

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
	riders[new_index] = rider = {
	  email: $scope.user.email,
	};
      }

      $scope.rider = rider;
      $scope.old_rider = angular.copy(rider);
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

    $scope.modified = function() {
      return !angular.equals($scope.old_rider, $scope.rider);
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
