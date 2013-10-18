'use strict;'

// Model: yyyy-MM-dd, View: dd.MM.yyyy
function isoDateDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(text) {
	var match;
	if (typeof text == 'string') {
	  if (text == '') {
	    ctrl.$setValidity('isoDate', true);
	    return null;
	  } else if (match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)) {
	    if (match[3] <= 99)
	      match[3] = +match[3] + 100 * (19 + (match[3] <= (new Date()).getYear() % 100));
	    var date = new Date(match[3], match[2] - 1, match[1]);
	    if (date.getFullYear() == match[3] &&
		date.getMonth() == match[2] - 1 &&
		date.getDate() == match[1]) {
	      ctrl.$setValidity('isoDate', true);
	      return ('00' + date.getFullYear()).slice(-4) + '-' +
		     ('0' + (date.getMonth() + 1)).slice(-2) + '-' +
		     ('0' + date.getDate()).slice(-2);
	    }
	  } else
	    ctrl.$setValidity('isoDate', false);
	}
      });
      ctrl.$formatters.push(function(value) {
	var match;
	if (value == null)
	  return '';
	if (typeof value == 'string' &&
	    (match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
	  return +match[3] + '.' + +match[2] + '.' + +match[1];
	else
	  return value;
      });
    }
  };
}

// Model: HH:mm:ss, View: HH:mm
function isoTimeDirective() {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, element, attr, ctrl) {
      ctrl.$parsers.push(function(text) {
	var match;
	if (typeof text == 'string') {
	  if (text == '') {
	    ctrl.$setValidity('isoTime', true);
	    return null;
	  } else if (match = text.match(/^(\d{1,2}):(\d{2})$/)) {
	    var date = new Date(0, 0, 0, match[1], match[2]);
	    if (date.getHours() == match[1] &&
		date.getMinutes() == match[2]) {
	      ctrl.$setValidity('isoTime', true);
	      return ('0' + date.getHours()).slice(-2) + ':' +
		     ('0' + date.getMinutes()).slice(-2) + ':00';
	    }
	  } else
	    ctrl.$setValidity('isoTime', false);
	}
      });
      ctrl.$formatters.push(function(value) {
	if (value == null)
	  return '';
	if (typeof value == 'string' &&
	    (match = value.match(/^(\d{2}):(\d{2}):(\d{2})$/)))
	  return +match[1] + ':' + match[2];
	else
	  return value;
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
