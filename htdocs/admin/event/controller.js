'use strict;'

var eventController = [
  '$scope', '$location', '$http', 'event',
  function ($scope, $location, $http, event) {
    $scope.$root.context(event.rankings[0].title);

    $scope.event = event;
    $scope.features = event.features;
    $scope.fold = {};

    if (event.base) {
      $http.get('/api/event/' + event.base + '/as-base')
      .success(function(base) {
	$scope.base = base;
      });
    }

    $scope.remove = function() {
      if (confirm('Veranstaltung wirklich löschen?\n\nDie Veranstaltung kann später nicht wiederhergestellt werden.')) {
	var params = {
	  version: event.version
	};
	$http.delete('/api/event/' + event.id, {params: params}).
	  success(function() {
	    $location.path('/');
	  }).
	  error(network_error);
      }
      $scope.fold.remove = false;
    };

    $scope.reset = function(reset) {
      var what = reset.substr(0, 1).toUpperCase() + reset.substr(1);
      if (confirm('Veranstaltung wirklich auf ' + what + ' zurücksetzen?\n\n' +
		  'Diese Änderung kann nicht rückgängig gemacht werden.')) {
	var params = {
	  version: event.version,
	  reset: reset
	};
	$http.post('/api/event/' + event.id + '/reset', undefined, {params: params}).
	  error(network_error);
      }
      $scope.fold.reset = false;
    }
  }];

eventController.resolve = {
  event: [
    '$q', '$http', '$route',
    function($q, $http, $route) {
      return http_request($q, $http.get('/api/event/' + $route.current.params.id));
    }]
};
