'use strict;'

function parse_iso_date($scope, text) {
  if (typeof text == 'string') {
    var match;
    if (text == '')
      return null;
    else if (match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)) {
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
    else if (match = text.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)) {
      var time = new Date(0, 0, 0, match[1], match[2], match[3] || 0);
      if (time.getHours() == match[1] &&
	  time.getMinutes() == match[2])
	return $scope.$eval('time | date:"HH:mm:ss"', {time: time});
    }
  }
}

function format_iso_time($scope, value, format) {
  if (value == null)
    return '';
  if (typeof value == 'string' &&
      (match = value.match(/^(\d{2}):(\d{2}):(\d{2})$/)))
    return $scope.$eval('time | date:"' + format + '"',
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
	return format_iso_time(scope, value, 'H:mm');
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
      split[1] = format_iso_time($scope, split[1], 'H:mm:ss');
      if (split[0] !== undefined && split[1] !== undefined)
	return split[0] + ' ' + split[1];
    }
  }
  return value;
}

function parse_iso_timestamp(text) {
  if (typeof text == 'string' && text == '')
    return null;
  else {
    var split = text.split(/ /);
    if (split.length == 2) {
      split[0] = parse_iso_date(scope, split[0]);
      split[1] = parse_iso_time(scope, split[1]);
      if (split[0] !== undefined && split[1] !== undefined)
	return split[0] + ' ' + split[1];
    }
  }
}

// Model: yyyy-MM-dd HH:mm:ss, View: d.M.yyyy H:mm:ss
function isoTimestampDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(text) {
	var value = parse_iso_timestamp(text);
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
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(text) {
	var match;
	if (typeof text == 'string') {
	  if (text == '') {
	    ctrl.$setValidity('numeric', true);
	    return null;
	  } else if (match = text.match(/^[0-9]*$/)) {
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

// Here is an on-change directive. It seems to work, but it is ugly to use:
// http://stackoverflow.com/questions/14477904/how-to-create-on-change-directive-for-angularjs
// http://jsfiddle.net/sunnycpp/TZnj2/52/
//
// FIXME: This directive breaks variable types in the model: for example, a number input
// field turns into a string.
function onChangeDirective() {
  return {
      restrict: 'A',
      scope: {'onChange': '='},
      link: function(scope, element, attr) {
	  scope.$watch('onChange', function(nVal) { element.val(nVal); });
	  element.bind('change', function() {
	      var currentValue = element.val();
	      if( scope.onChange !== currentValue ) {
		  scope.$apply(function() {
		      scope.onChange = currentValue;
		  });
	      }
	  });
      }
  };
}

function punkteTabTo() {
  return {
    restrict: 'A',
    link: function (scope, element, attr) {
      if (navigator.userAgent.match(/iPad|iPhone/)) {
	/* Auf iPhone und iPad verschwindet die Bildschirmtatstatur, sobald
	   einem Feld der Fokus entzogen wird, das würde die Eingabe sehr
	   erschweren. */
	return;
      }
      var selector = scope.$eval(attr.punkteTabTo);
      if (selector) {
	element.bind('keyup', function(event) {
	  if (event.which >= 48 && event.which <= 57 &&
              !(event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) &&
	      this.value.length === this.maxLength) {
	    if (!event.target || !event.target.className.match(/\bng-invalid\b/)) {
	      var next = document.getElementById(selector);
	      if (next) {
		next.focus();
		next.select();
	      }
	    }
	  }
	});
      }
    }
  }
}
