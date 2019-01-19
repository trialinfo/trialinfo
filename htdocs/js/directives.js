'use strict';

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
function isoDateDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(text) {
	var value = parse_iso_date(scope, text);
	ctrl.$setValidity('isoDate', value !== undefined);
	return value;
      });
      ctrl.$formatters.push(function(value) {
	return format_iso_date(scope, value, 'd.M.yyyy');
      });
    }
  };
}

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
function isoTimeDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(text) {
	var value = parse_iso_time(scope, text);
	ctrl.$setValidity('isoTime', value !== undefined);
	return value;
      });
      ctrl.$formatters.push(function(value) {
	return format_iso_time(scope, value, 'H:mm', 'H:mm:ss');
      });
    }
  };
}

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

function parse_iso_timestamp(scope, text) {
  if (typeof text == 'string' && text == '')
    return null;
  else {
    var split = text.split(/ /);
    if (split.length > 2)
      return undefined;
    if (split.length >= 1) {
      split[0] = parse_iso_date(scope, split[0]);
      if (split[0] === undefined)
	return undefined;
    }
    if (split.length == 2) {
      split[1] = parse_iso_time(scope, split[1]);
      if (split[1] === undefined)
	return undefined;
    } else
      split[1] = '00:00:00';
    return split.join(' ');
  }
}

// Model: yyyy-MM-dd HH:mm:ss, View: d.M.yyyy H:mm:ss
function isoTimestampDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(text) {
	var value = parse_iso_timestamp(scope, text);
	ctrl.$setValidity('isoTime', value !== undefined);
	return value;
      });
      ctrl.$formatters.push(function(value) {
	return format_iso_timestamp(scope, value);
      });
    }
  };
}

// Model: number or null, View: text (empty becomes null)
function numericDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attrs, ctrl) {
      ctrl.$parsers.push(function(text) {
	var match;
	if (typeof text == 'string') {
	  if (text == '') {
	    ctrl.$setValidity('numeric', true);
	    return null;
	  } else if (match = text.match(/^-?[0-9]+$/) &&
		     (!('min' in attrs) || +text >= +attrs.min) &&
		     (!('max' in attrs) || +text <= +attrs.max)) {
	    ctrl.$setValidity('numeric', true);
	    return +text;
	  } else
	    ctrl.$setValidity('numeric', false);
	}
      });
      ctrl.$formatters.push(function(value) {
	if (value == null)
	  return '';
	if (typeof value == 'number')
	  return value + '';
	else
	  return value;
      });
    }
  };
}

// Model: true, false, or null, View: 'yes', 'no', '-'
function yesNoNullDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(text) {
	if (typeof text == 'string') {
	  if (text == '-') {
	    ctrl.$setValidity('yesNoNull', true);
	    return null;
	  } else if (text === 'yes' || text === 'no') {
	    ctrl.$setValidity('yesNoNull', true);
	    return text === 'yes';
	  } else
	    ctrl.$setValidity('yesNoNull', false);
	}
      });
      ctrl.$formatters.push(function(value) {
	if (value == null)
	  return '-';
	if (typeof value == 'boolean')
	  return value ? 'yes' : 'no';
	else
	  return value;
      });
    }
  };
}

// Model: number; View: number or ''
function rankingClassDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(ranking_class) {
	if (typeof ranking_class === 'string') {
	  ctrl.$setValidity('rankingClass', true);
	  if (ranking_class === '')
	    return attr.rankingClass;
	  else
	    return ranking_class;
	}
	ctrl.$setValidity('rankingClass', false);
      });
      ctrl.$formatters.push(function(ranking_class) {
	if (ranking_class === attr.rankingClass)
	  return '';
	else
	  return ranking_class;
      });
    }
  };
}

// Model: -1 <=> '-', 0, 1, 2, 3, 4 (when allowed), 5, null <=> ''
function marksDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(text) {
	var four_marks;
	try {
	  four_marks = scope.event.four_marks;
	} catch(_) {}

	if (typeof text == 'string') {
	  if (text == '') {
	    ctrl.$setValidity('marks', true);
	    return null;
	  } else if (text == '-') {
	    ctrl.$setValidity('marks', true);
	    return -1;
	  } else if (text.match(/^[012345]$/) && (four_marks || text != '4')) {
	    ctrl.$setValidity('marks', true);
	    return +text;
	  } else
	    ctrl.$setValidity('marks', false);
	}
      });
      ctrl.$formatters.push(function(value) {
	if (value == null)
	  return '';
	else if (value == -1)
	  return '-';
	else
	  return value + '';
      });
    }
  };
}

function nullableDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(text) {
	return text === '' ? null : text;
      });
      ctrl.$formatters.push(function(value) {
	return value === null ? '' : value;
      });
    }
  };
}

function strikeThroughDirective() {
  return {
    restrict: 'AC',
    link: function(scope, element, attr, ctrl) {
      scope.$watch(attr.strikeThrough, function(value) {
        element.css('text-decoration', value ? 'line-through' : '');
      }, true);
    }
  };
}

(function() {
  var module = angular.module('admin', []);

  module.factory('setFocus', ['$timeout', function($timeout) {
    return function(selector) {
      $timeout(function() {
	var element = document.querySelector(selector);
	element.focus();
	element.select();
      });
    };
  }]);
}());

/* Unter Firefox funktioniert das Attribut autofocus in nachgeladenen Seiten nicht;
   diese Directive korrigiert das.  */
function autofocusDirective() {
  return {
    restrict: 'A',
    link: function (scope, element, attrs) {
      element[0].focus();
    }
  };
}

function tabTo() {
  return {
    restrict: 'A',
    controller: function($scope, $timeout) {
      $scope.timeout = $timeout;
    },
    link: function (scope, element, attr) {
      if (navigator.userAgent.match(/iPad|iPhone/)) {
	/* Auf iPhone und iPad verschwindet die Bildschirmtatstatur, sobald
	   einem Feld der Fokus entzogen wird, das würde die Eingabe sehr
	   erschweren. */
	return;
      }
      function good_key(event) {
	return !(event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) &&
	       event.which > 46 && event.which <= 222 &&
	       (event.which < 112 /* F1 */ || event.which > 123 /* F12 */);
      }
      element.bind('keydown', function(event) {
	if (good_key(event)) {
	  scope.timeout(function() {
	    if (!event.target || !event.target.className.match(/\bng-invalid\b/)) {
	      var selector = scope.$eval(attr.tabTo);
	      if (selector !== undefined) {
		if (selector === null)
		  element[0].blur();
		else {
		  var next = document.getElementById(selector);
		  if (next) {
		    next.focus();
		    next.select();
		  }
		}
	      }
	    }
	  }, 20);
	}
      });
    }
  }
}

/* ex:set shiftwidth=2: */
