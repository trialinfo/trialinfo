'use strict';

var zonesController = [
  '$scope', '$http', '$timeout', 'event',
  function ($scope, $http, $timeout, event) {
    $scope.$root.context(event.title);

    $scope.starting_classes = function() {
      var starting_classes = {};
      for (var class_ = 1; class_ <= event.classes.length; class_++) {
	var ranking_class = event.classes[class_ - 1].ranking_class;
	if (event.zones[ranking_class - 1])
	  starting_classes[ranking_class] = true;
      }
      return Object.keys(starting_classes).sort(function(a, b) { return a - b; });
    }();
    assign_event(event);

    $scope.rounds = function(class_) {
      var rounds = [];
      for (var round = 1; round <= event.classes[class_ - 1].rounds; round++)
	rounds.push(round);
      return rounds;
    };

    function expand(skipped_zones) {
      angular.forEach($scope.starting_classes, function(class_) {
	if (!skipped_zones[class_])
	  skipped_zones[class_] = {};
	for (var round = 1; round <= event.classes[class_ - 1].rounds; round++) {
	  if (!skipped_zones[class_][round])
	    skipped_zones[class_][round] = {};
	  angular.forEach(event.zones[class_ - 1], function(zone) {
	    if (!skipped_zones[class_][round][zone])
	      skipped_zones[class_][round][zone] = false;
	  });
	}
      });
    }

    function collapse(skipped_zones) {
      for (var class_ in skipped_zones) {
	for (var round in skipped_zones[class_]) {
	  for (var zone in skipped_zones[class_][round]) {
	    if (!skipped_zones[class_][round][zone])
	      delete skipped_zones[class_][round][zone];
	  }
	  if (!Object.keys(skipped_zones[class_][round]).length)
	    delete skipped_zones[class_][round];
	}
	if (!Object.keys(skipped_zones[class_]).length)
	  delete skipped_zones[class_];
      }
    }

    function assign_event(e) {
      if (e === undefined)
	$scope.event.skipped_zones = angular.copy($scope.old_event.skipped_zones);
      else {
	event = e;
	$scope.event = event;
	expand($scope.event.skipped_zones);
	$scope.old_event = angular.copy(event);
      }
    }

    $scope.modified = function() {
      return !angular.equals($scope.event.skipped_zones, $scope.old_event.skipped_zones);
    };

    $scope.save = function() {
      if ($scope.busy)
	return;

      /* Wenn die Daten aus dem Trialtool importiert wurden, ist das Feature
	 skipped_zones nicht gesetzt.  Sobald eine Sektion aus der
	 Wertung genommen wird, muss es aber auf jeden Fall gesetzt werden! */
      event.features.skipped_zones = true;
      $scope.busy = true;
      collapse(event.skipped_zones);
      $http.put('/api/event/' + event.id, event)
	.then(function(response) {
	  assign_event(response.data);
	})
	.catch(network_error)
	.finally(function() {
	  delete $scope.busy;
	});
    };

    $scope.discard = function() {
      if ($scope.busy)
	return;
      assign_event(undefined);
    };

    $scope.keydown = function(event) {
      if (event.which == 13) {
	event.preventDefault();
	$timeout(function() {
	  if ($scope.modified() && $scope.form.$valid)
	    $scope.save();
	});
      } else if (event.which == 27) {
	event.preventDefault();
	$timeout(function() {
	  if ($scope.modified())
	    $scope.discard();
	});
      }
    };

    warn_before_unload($scope, $scope.modified);
  }];

zonesController.resolve = {
  event: [
    '$q', '$http', '$route',
    function($q, $http, $route) {
      return http_request($q, $http.get('/api/event/' + $route.current.params.id));
    }],
};

angular.module('application').controller('zonesController', zonesController);
