'use strict';

var eventSectionsController = [
  '$scope', '$sce', '$route', '$location', '$timeout', '$http', '$q', 'sections',
  function ($scope, $sce, $route, $location, $timeout, $http, $q, sections) {
    $scope.config = config;
    $scope.show = {
      zones: {},
      subtitle: sections.event.subtitle
    };

    function filter_zones() {
      return $scope.zones.reduce(function(list, zone, idx) {
	if (zone && $scope.show.zones[idx + 1])
	  list.push(idx + 1);
	  return list;
      }, []);
    }

    function assign_sections(sections) {
      $scope.event = sections.event;
      $scope.riders = sections.riders;
      $scope.zones = sections.zones;
      angular.forEach($scope.zones, function(zone, idx) {
	if (zone)
	  $scope.show.zones[idx + 1] = true;
      });
      angular.forEach($scope.riders, function(rider) {
	angular.forEach(rider.marks_per_zone, function(marks) {
	  for (var idx in marks) {
	    if (marks[idx] == -1)
	      marks[idx] = '-';
	  }
	});
      });
      $scope.$root.context($scope.event.title);
    }
    assign_sections(sections);

    function to_url() {
      var search = angular.copy($scope.show);

      var hidden_zones = {};
      angular.forEach($scope.zones, function(zone, idx) {
	if (zone && !search.zones[idx + 1])
	  hidden_zones[idx + 1] = true;
      });
      if (Object.keys(hidden_zones).length)
	search['hide-zone'] = Object.keys(hidden_zones);
      delete search.zones;

      angular.forEach(search, function(value, key) {
	if (value === null || value === '' || value === false)
	  delete search[key];
      });

      if (search.subtitle == $scope.event.subtitle)
	delete search.subtitle;
      else if (search.subtitle == null)
	search.subtitle = '';

      return search;
    }

    function update_url() {
      var url = $location.search();
      if (!url.length || !angular.equals($scope.show, from_url(url))) {
	$scope.ignoreRouteUpdate = true;
	$location.search(to_url()).replace();
      }
    }

    function update() {
      $scope.$root.context($scope.event.title);
      var zones_list = filter_zones();
      if (!angular.equals(zones_list, $scope.zones_list))
	$scope.zones_list = zones_list;
      update_url();
    }

    $scope.enumerate = function(from, to) {
      var list = [];
      for (; from <= to; from++)
	list.push(from);
      return list;
    }

    $scope.class_symbol = function(class_) {
      if (class_.color) {
	return $sce.trustAsHtml(
	  '<span style="display:inline-block; width:0.8em; height:0.8em; background-color:' + class_.color + '"></span>');
      }
    };

    $scope.fold = {};
    $scope.settings = function(event) {
      event.preventDefault();
      event.target.blur();
      $scope.fold.settings = !$scope.fold.settings;
    }

    function scalefont(size, scale) {
      return Math.round(size * Math.pow(Math.sqrt(2), scale));
    };

    $scope.print_style = function() {
      var show = $scope.show;
      return $sce.trustAsHtml(`
@media print {
  @page {
    size:${show['page-size'] || 'A4'};
    margin-left:${show['margin-left'] || '2cm'};
    margin-top:${show['margin-top'] || '2cm'};
    margin-right:${show['margin-right'] || '2cm'};
    margin-bottom:${show['margin-bottom'] || '2cm'};
  }
  body { font-size:${scalefont(show['font-size'] || 10, 0)}pt; }
  h2 { font-size:${scalefont(show['font-size'] || 10, 1)}pt; }
  h1 { font-size:${scalefont(show['font-size'] || 10, 2)}pt; }
}
`);
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

    $scope.$watch('show', update, true);

    function from_url(search) {
      var show = angular.copy(search);

      var zones = {};
      angular.forEach($scope.zones, function(zone, idx) {
	if (zone)
	  zones[idx + 1] = true;
      });
      var hidden_zones = show['hide-zone'] || [];
      if (typeof hidden_zones === 'string')
	hidden_zones = [hidden_zones];
      angular.forEach(hidden_zones, function(zone) {
	zones[zone] = false;
      });
      show.zones = zones;
      delete show['hide-zone'];

      if (show['font-size'] !== undefined)
	show['font-size'] = +show['font-size'];

      if (show.duration !== undefined)
	show.duration = +show.duration;

      show['page-break'] = !!show['page-break'];

      return show;
    };

    $scope.$on('$routeUpdate', function() {
      if ($scope.ignoreRouteUpdate) {
	delete $scope.ignoreRouteUpdate;
	return;
      }

      var search = $location.search();
      var defaults = {
      };
      if (config.weasyprint) {
	Object.assign(defaults, {
	  'page-size': 'A4',
	  'columns': '2',
	  'font-size': 10,
	  'margin-left': '1cm',
	  'margin-top': '2cm',
	  'margin-right': '1cm',
	  'margin-bottom': '1cm',
	  'page-break': true,
	});
      }
      angular.forEach(defaults, function(value, key) {
	if (search[key] === undefined)
	  search[key] = value;
      });
      angular.extend($scope.show, from_url(search));
    });
    $scope.$emit('$routeUpdate');

    var hide_settings_promise;
    $scope.$on('$destroy', function() {
      stop();
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

    $scope.on_day_of_event = function() {
      let event = $scope.event;
      return !event.date || same_day(event.date);
    };
  }];

eventSectionsController.resolve = {
  sections: function($http, $route) {
    return $http.get('/api/event/' + $route.current.params.id + '/sections')
      .then(function(response) {
	return response.data;
      });
  },
};

angular.module('application').controller('eventSectionsController', eventSectionsController);
