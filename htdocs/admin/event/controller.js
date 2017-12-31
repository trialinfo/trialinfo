'use strict;'

var eventController = [
  '$scope', '$location', '$http', 'event',
  function ($scope, $location, $http, event) {
    $scope.$root.context(event.rankings[0].title);

    $scope.config = config;

    $scope.event = event;
    $scope.features = event.features;
    $scope.settings = {
      action: config.sync_target ? 'sync' : 'trialinfo-export',
      url: config.sync_target,
      timeout: 30
    };
    $scope.fold = {};

    if (event.base) {
      $http.get('/api/event/' + event.base + '/as-base')
      .then(function(response) {
	$scope.base = response.data;
      });
    }

    $scope.encodeURIComponent = encodeURIComponent;

    $scope.filename = function() {
      if (event.rankings[0].title)
        return event.rankings[0].title.replace(/[:\/\\]/g, '');
      else if (event.date)
        return 'Trial ' + event.date;
      else
        return 'Trial';
    };

    $scope.synchronize = function() {
      var args = {
	title: event.title,
	tag: event.tag,
	url: $scope.settings.url,
	timeout: $scope.settings.timeout * 1000
      };
      $scope.$root.$broadcast('sync', args);
    }

    $scope.remove = function() {
      if (confirm('Veranstaltung wirklich löschen?\n\nDie Veranstaltung kann später nicht wiederhergestellt werden.')) {
	var params = {
	  version: event.version
	};
	$http.delete('/api/event/' + event.id, {params: params})
	  .then(function() {
	    $location.path('/');
	  })
	  .catch(network_error);
      }
      $scope.fold.remove = false;
    };

    $scope.reset = function(reset) {
      if (confirm('Veranstaltung wirklich zurücksetzen?\n\n' +
		  'Diese Änderung kann nicht rückgängig gemacht werden.')) {
	var params = {
	  version: event.version,
	  reset: reset
	};
	$http.post('/api/event/' + event.id + '/reset', undefined, {params: params})
	  .catch(network_error);
      }
      $scope.fold.reset = false;
    };
  }];

eventController.resolve = {
  event: [
    '$q', '$http', '$route',
    function($q, $http, $route) {
      return http_request($q, $http.get('/api/event/' + $route.current.params.id));
    }]
};
