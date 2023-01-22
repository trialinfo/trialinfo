'use strict';

var eventStatsController = [
  '$scope', '$sce', '$route', '$location', '$timeout', '$http', '$q', 'stats',
  function ($scope, $sce, $route, $location, $timeout, $http, $q, stats) {
    $scope.stats = stats;

    $scope.params = $route.current.params;

    $scope.marks_list = [];
    for (let n = 0; n <= 5; n++) {
      let marks = n;
      if (marks == 4 && !stats.event.four_marks)
	continue;
      if (stats.event.uci_x10)
	marks *= 10;
      $scope.marks_list.push(marks);
    }

    $scope.average = (marks_distribution) => {
      if (!marks_distribution)
	return;

      let n = 0, sum = 0;
      for (let marks of $scope.marks_list) {
	let count = marks_distribution[marks];
	if (count) {
	  sum += count * marks;
	  n += count;
	}
      }
      return n ? (sum / n).toFixed(1) : null;
    }

    function overall_distribution(marks_distributions) {
      let overall_distribution = [];
      for (let marks_distribution of marks_distributions) {
	if (!marks_distribution)
	  continue;
	for (let marks in marks_distribution) {
	  let count = overall_distribution[marks];
	  if (!(marks in overall_distribution))
	    overall_distribution[marks] = 0;
	  overall_distribution[marks] += marks_distribution[marks];
	}
      }
      return overall_distribution;
    }

    for (let class_ of stats.classes) {
      for (let marks_distribution of class_.marks_distributions) {
	if (marks_distribution) {
	  for (let marks of $scope.marks_list) {
	    if (marks_distribution[marks] == null)
	      marks_distribution[marks] = 0;
	  }
	}
      }
    }

    for (let class_ of stats.classes) {
      class_.marks_distribution =
	overall_distribution(class_.marks_distributions);
    }

    stats.zones = [];
    for (let class_ of stats.classes) {
      for (let zone in class_.marks_distributions) {
	if (class_.marks_distributions[zone] == null)
	  continue;
	if (!(zone in stats.zones))
	  stats.zones[zone] = {
	    marks_distributions: []
	  };
	stats.zones[zone].marks_distributions.push({
	  'class': class_,
	  marks_distribution: class_.marks_distributions[zone]
	});
      }
    }

    for (let zone of stats.zones) {
      if (zone == null)
	continue;
      zone.marks_distribution = overall_distribution(
	zone.marks_distributions.map((class_) => class_.marks_distribution))
    }

    $scope.marks_distribution = overall_distribution(
      stats.classes.map((class_) => class_.marks_distribution));

    let marks_distribution_colors = (() => {
      let colors =['#009000', '#42a600', '#97bd00', '#d1a700', '#e85d00', '#ff0000'];
      let marks_distribution_colors = {};
      for (let n = 0; n <= 5; n++) {
	let marks = n;
	if (stats.event.uci_x10)
	  marks *= 10;
	marks_distribution_colors[marks] = colors[n];
      }
      return marks_distribution_colors;
    })();

    $scope.graph = (marks_distribution) => {
      if (!marks_distribution)
	return;

      let count = 0;
      for (let marks of $scope.marks_list) {
	if (!(marks in marks_distribution))
	  continue;
	count += marks_distribution[marks];
      }

      let svg = `<svg width="200" height="10" viewBox="0 0 ${count} 1" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" version="1.1">`;
      count = 0;
      for (let marks of $scope.marks_list) {
	if (!(marks in marks_distribution))
	  continue;
	svg += `<rect x="${count}" y="0" width="${marks_distribution[marks]}" height="1" fill="${marks_distribution_colors[marks]}"><title>${marks}</title></rect>`;
	count += marks_distribution[marks];
      }
      svg += `</svg>`;
      return $sce.trustAsHtml(svg);
    };

    $scope.dot = (marks) => {
      let svg = `<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg" version="1.1">`;
      svg += `<rect x="0" y="0" width="10" height="10" fill="${marks_distribution_colors[marks]}"><title>${marks}</title></rect>`;
      svg += `</svg>`;
      return $sce.trustAsHtml(svg);
    };

    $scope.$on('$routeUpdate', function() {
      var search = $location.search();
      $scope.by_class = search['by-class'];
      $scope.by_zone = search['by-zone'];
    });
    $scope.$emit('$routeUpdate');
  }];

eventStatsController.resolve = {
  stats: function($http, $route) {
    return $http.get('/api/event/' + $route.current.params.id + '/stats')
      .then(function(response) {
	return response.data;
      });
  },
};

angular.module('application').controller('eventStatsController', eventStatsController);
