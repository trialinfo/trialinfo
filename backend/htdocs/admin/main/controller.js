'use strict;'

var mainController = [
  '$scope', '$cookies', '$http', '$location', '$window', 'events', 'series',
  function ($scope, $cookies, $http, $location, $window, events, series) {
    $scope.user = JSON.parse($cookies['trialinfo.user'] || '{}');

    $scope.SYNC_SOURCE = SYNC_SOURCE;
    $scope.events = events;
    $scope.series = series;
    $scope.show = {};

    angular.forEach(events, function(event) {
      if (event.closed)
	$scope.closed_events = true;
    });

    angular.forEach(series, function(serie) {
      if (serie.closed)
	$scope.closed_series = true;
    });

    $scope.event_visible = function(event) {
      return $scope.show.closed_events ||
	     !event.closed;
    };

    $scope.serie_visible = function(serie) {
      return $scope.show.closed_series ||
	      !serie.closed;
    };

    $scope.event_name = event_name;

    $scope.new_event = function() {
      $location.path('/event/neu/einstellungen');
    };

    $scope.sync_import_export = function() {
      $location.path('/extern');
    };

    $scope.neu_serie = function() {
      $location.path('/serie/neu');
    };

    $scope.logout = function() {
      $window.location.href = '/logout';
    };
  }];

mainController.resolve = {
  events: [
    '$q', '$http',
    function($q, $http) {
      // FIXME: How to detect an HTTP redirect to the login page here?
      return http_request($q, $http.get('/api/events'));
    }],
  series: [
    '$q', '$http',
    function($q, $http) {
      // FIXME: How to detect an HTTP redirect to the login page here?
      return http_request($q, $http.get('/api/series'));
    }]
};
