'use strict';

(function() {
  var module = angular.module('directives', []);

  function parse_iso_date($scope, text) {
    if (typeof text == 'string') {
      var match;
      if (text == '')
	return null;
      else if ((match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)) ||
	       (match = text.match(/^(\d{1,2})(\d{2})(\d{2}|\d{4})$/))) {
	if (match[3] <= 99)
	  match[3] = +match[3] + 100 * (19 + (match[3] <= (new Date()).getYear() % 100));
	var date = new Date(match[3], match[2] - 1, match[1]);
	if (date.getFullYear() == match[3] &&
	    date.getMonth() == match[2] - 1 &&
	    date.getDate() == match[1])
	  return $scope.$eval('date | date:"yyyy-MM-dd"', {date: date});
      }
    }
  }

  function format_iso_date($scope, value, format) {
    var match;
    if (value == null)
      return '';
    if (typeof value == 'string' &&
	(match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
      return $scope.$eval('date | date:"' + format + '"',
			  {date: new Date(match[1], match[2] - 1, match[3])});
    else
      return value;
  }

  // Model: yyyy-MM-dd, View: d.M.yyyy
  module.directive('isoDate', function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function($scope, element, attr, ngModel) {
	ngModel.$parsers.push(function(text) {
	  var value = parse_iso_date($scope, text);
	  ngModel.$setValidity('isoDate', value !== undefined);
	  return value;
	});
	ngModel.$formatters.push(function(value) {
	  return format_iso_date($scope, value, 'd.M.yyyy');
	});
      }
    };
  });

  function parse_iso_time($scope, text) {
    if (typeof text == 'string') {
      var match;
      if (text == '')
	return null;
      else if ((match = text.match(/^(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?$/)) ||
	       (match = text.match(/^(\d{1,2})(\d{2})(?:(\d{2}))?$/))) {
	var time = new Date(0, 0, 0, match[1], match[2], match[3] || 0);
	if (time.getHours() == match[1] &&
	    time.getMinutes() == match[2])
	  return $scope.$eval('time | date:"HH:mm:ss"', {time: time});
      }
    }
  }

  function format_iso_time($scope, value, format1, format2) {
    var match;
    if (value == null)
      return '';
    if (typeof value == 'string' &&
	(match = value.match(/^(\d{2}):(\d{2}):(\d{2})$/)))
      return $scope.$eval('time | date:"' + (match[3] == 0 ? format1 : format2) + '"',
			  {time: new Date(0, 0, 0, match[1], match[2], match[3])});
    else
      return value;
  }

  // Model: HH:mm:ss, View: H:mm
  module.directive('isoTime', function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function($scope, element, attr, ngModel) {
	ngModel.$parsers.push(function(text) {
	  var value = parse_iso_time($scope, text);
	  ngModel.$setValidity('isoTime', value !== undefined);
	  return value;
	});
	ngModel.$formatters.push(function(value) {
	  return format_iso_time($scope, value, 'H:mm', 'H:mm:ss');
	});
      }
    };
  });

  module.directive('isoTimeFormat', function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function($scope, element, attr, ngModel) {
	ngModel.$parsers.push(function(text) {
	  if (text == '')
	    return null;
	  let m = moment(text, attr.isoTimeFormat, true);
	  ngModel.$setValidity('isoMinutesSeconds', m.isValid());
	  if (m.isValid())
	    return m.format('HH:mm:ss');
	});
	ngModel.$formatters.push(function(value) {
	  if (value == null)
	    return '';
	  return moment(value, 'HH:mm:ss', true).format(attr.isoTimeFormat);
	});
      }
    };
  });

  function format_iso_timestamp($scope, value) {
    if (value == null)
      return '';
    else if (typeof value == 'string') {
      var split = value.split(/ /);
      if (split.length == 2) {
	split[0] = format_iso_date($scope, split[0], 'd.M.yyyy');
	split[1] = format_iso_time($scope, split[1], 'H:mm:ss', 'H:mm:ss');
	if (split[0] !== undefined && split[1] !== undefined)
	  return split[0] + ' ' + split[1];
      }
    }
    return value;
  }

  function parse_iso_timestamp($scope, text) {
    if (typeof text == 'string' && text == '')
      return null;
    else {
      var split = text.split(/ /);
      if (split.length > 2)
	return undefined;
      if (split.length >= 1) {
	split[0] = parse_iso_date($scope, split[0]);
	if (split[0] === undefined)
	  return undefined;
      }
      if (split.length == 2) {
	split[1] = parse_iso_time($scope, split[1]);
	if (split[1] === undefined)
	  return undefined;
      } else
	split[1] = '00:00:00';
      return split.join(' ');
    }
  }

  // Model: yyyy-MM-dd HH:mm:ss, View: d.M.yyyy H:mm:ss
  module.directive('isoTimestamp', function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function($scope, element, attr, ngModel) {
	ngModel.$parsers.push(function(text) {
	  var value = parse_iso_timestamp($scope, text);
	  ngModel.$setValidity('isoTime', value !== undefined);
	  return value;
	});
	ngModel.$formatters.push(function(value) {
	  return format_iso_timestamp($scope, value);
	});
      }
    };
  });

  // Model: yyyy-MM-dd, View: d.M.yyyy
  module.directive('inverted', function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function($scope, element, attr, ngModel) {
	ngModel.$parsers.push(function(value) {
	  if (typeof value == 'boolean')
	    value = !value;
	  return value;
	});
	ngModel.$formatters.push(function(value) {
	  if (typeof value == 'boolean')
	    value = !value;
	  return value;
	});
      }
    };
  });

  // Model: true, false, or null, View: 'yes', 'no', '-'
  module.directive('yesNoNull', function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function($scope, element, attr, ngModel) {
	ngModel.$parsers.push(function(text) {
	  if (typeof text == 'string') {
	    if (text == '-') {
	      ngModel.$setValidity('yesNoNull', true);
	      return null;
	    } else if (text === 'yes' || text === 'no') {
	      ngModel.$setValidity('yesNoNull', true);
	      return text === 'yes';
	    } else
	      ngModel.$setValidity('yesNoNull', false);
	  }
	});
	ngModel.$formatters.push(function(value) {
	  if (value == null)
	    return '-';
	  if (typeof value == 'boolean')
	    return value ? 'yes' : 'no';
	  else
	    return value;
	});
      }
    };
  });

  // Model: number; View: number or ''
  module.directive('rankingClass', function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function($scope, element, attr, ngModel) {
	ngModel.$parsers.push(function(ranking_class) {
	  if (typeof ranking_class === 'string') {
	    ngModel.$setValidity('rankingClass', true);
	    if (ranking_class === '')
	      return attr.rankingClass;
	    else
	      return ranking_class;
	  }
	  ngModel.$setValidity('rankingClass', false);
	});
	ngModel.$formatters.push(function(ranking_class) {
	  if (ranking_class === attr.rankingClass)
	    return '';
	  else
	    return ranking_class;
	});
      }
    };
  });

  // Model: -1 <=> '-', 0, 1, 2, 3, 4 (when allowed), 5, null <=> ''
  // (For uci_x10 events: 10, 20, ... instead of 1, 2, ...)
  module.directive('marks', function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function($scope, element, attr, ngModel) {
	ngModel.$parsers.push(function(text) {
	  var valid = false, value = +text;

	  if (typeof text == 'string') {
	    if (text == '') {
	      value = null;
	      valid = true;
	    } else if (text == '-') {
	      value = -1;
	      valid = true;
	    } else if ($scope.event.uci_x10) {
	      if (text.match(/^(0|[1-6]0)$/))
		valid = true;
	      else if (text.match(/^[1-6]$/)) {
		value = value * 10;
		ngModel.$setViewValue(value + '');
		ngModel.$render();
		valid = true;
	      }
	    } else {
	      if (text.match(/^[0-5]$/) &&
		  ($scope.event.four_marks || text != '4'))
		valid = true;
	    }
	    ngModel.$setValidity('marks', valid);
	    return value;
	  }
	});
	ngModel.$formatters.push(function(value) {
	  if (value == null)
	    return '';
	  else if (value == -1)
	    return '-';
	  else
	    return value + '';
	});
      }
    };
  });

  module.directive('strikeThrough', function() {
    return {
      restrict: 'AC',
      link: function($scope, element, attr) {
	$scope.$watch(attr.strikeThrough, function(value) {
	  element.css('text-decoration', value ? 'line-through' : '');
	}, true);
      }
    };
  });

  module.factory('setFocus', ['$timeout', function($timeout) {
    return function(selector) {
      $timeout(function() {
	var element = document.querySelector(selector);
	if (element) {
	  element.focus();
	  element.select();
	}
      });
    };
  }]);

  /*
   * Unter Firefox funktioniert das Attribut autofocus in nachgeladenen Seiten
   * nicht; diese Directive korrigiert das.
   */
  module.directive('autofocus', function() {
    return {
      restrict: 'A',
      link: function ($scope, element, attrs) {
	element[0].focus();
      }
    };
  });

  module.directive('tabTo', function() {
    return {
      restrict: 'A',
      link: function ($scope, element, attr) {
	element.bind('input', function(event) {
	  if (event.data == null)
	    return;
	  if (!event.target || !event.target.className.match(/\bng-invalid\b/)) {
	    var selector = $scope.$eval(attr.tabTo);
	    if (selector != null) {
	      var next = document.getElementById(selector);
	      if (next) {
		next.focus();
		next.select();
	      }
	    }
	  }
	});
      }
    };
  });

  module.factory('eventName', ['$rootScope', function($rootScope) {
    return function(event) {
      var remarks = [];
      angular.forEach(event.series, function(serie) {
	if (serie.abbreviation != null)
	  remarks.push(serie.abbreviation);
      });
      remarks.sort();

      var name = event.title;
      if (event.location != null && event.date != null)
	name = event.location + ' am ' + $rootScope.$eval('date | date:"d.M."', event);
      return name +
	     (remarks.length ? ' (' + remarks.join(', ') + ')' : '');
    };
  }]);

  module.factory('riderName', function() {
    return function(rider) {
      var infos = [];
      if (rider.last_name !== null && rider.last_name !== '')
	infos.push(rider.last_name);
      if (rider.first_name !== null && rider.first_name !== '')
	infos.push(rider.first_name);
      if (rider.number !== null && rider.number >= 0)
	infos.push('(' + rider.number + ')');
      return infos.join(' ');
    };
  });

  module.factory('riderInfo', ['$rootScope', function($rootScope) {
    return function(rider) {
      var infos = [];
      if (rider.number >= 0)
	infos.push('Startnummer: ' + rider.number);
      if (rider['class'] !== null)
	infos.push('Klasse: ' + rider['class']);
      if (rider.date_of_birth)
	infos.push('Geburtsdatum: ' +
		   $rootScope.$eval('date_of_birth | date:"d.M.yyyy"', rider));
      return infos.join('\n');
    };
  }]);

  module.factory('classSymbol', ['$sce', function($sce) {
    return function(color) {
      if (color) {
	return $sce.trustAsHtml(
	  `<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" version="1.1">` +
	    `<rect x="0" y="0" width="14" height="14" class="class-symbol" stroke-width="3" fill="${color}"></rect>` +
	  `</svg>`
	);
      }
    };
  }]);
}());

/* ex:set shiftwidth=2: */
