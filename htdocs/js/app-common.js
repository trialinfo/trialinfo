'use strict';

/*
 * For each element with attribute 'adjust-width="group"' in the document,
 * set the width of the element to the maximum width of all elements in
 * that group.
 *
 * The widths are specified in 'em' units instead of 'px'.  This is because
 * Firefox silently substitutes a smaller font when the font requested is
 * smaller than the mimimum size Firefox allows.  When that happens and 'px'
 * units are used, the 'px' units would correspond to the width of the larger
 * font.  When the same page is rendered by WeasyPrint, with different font
 * sizes for print, the column widths would be wrong.  By using 'em' units, the
 * column widths scale with the actual font size used.
 */
function adjust_width() {
  let getContentWidth = (function() {
    let getWidth, pixels_to_em;

    return function(element) {
      let div = document.createElement("div");
      let width;

      div.style.height = 0;
      div.style.overflow = "hidden";

      element.appendChild(div);

      if (!pixels_to_em) {
	if (!getWidth) {
	  if (div.getBoundingClientRect) {
	    getWidth = function(elem) { return elem.getBoundingClientRect().width; }
	  } else {
	    getWidth = function(elem) { return elem.offsetWidth + 1; }
	  }
	}

	div.style.width = '1em';
	width = getWidth(div);
	div.style.removeProperty('width');
	pixels_to_em = width ? 1.0 / width : 1.0;
	// console.log('pixels_to_em = ' + pixels_to_em);
      }
      width = getWidth(div) * pixels_to_em;

      element.removeChild(div);

      return width;
    }
  })();

  let width_groups = {};
  let elements = document.querySelectorAll('[adjust-width]');
  for (let element of elements)
    element.style.removeProperty('min-width');
  for (let element of elements) {
    let name = element.getAttribute('adjust-width');
    if (!width_groups[name])
      width_groups[name] = [];
    width_groups[name].push(element);
  }
  for (let name of Object.keys(width_groups)) {
    let elements = width_groups[name];
    if (elements.length < 2)
      continue;
    var width = 0;
    for (let element of elements)
      width = Math.max(width, getContentWidth(element));
    // console.log(name + ': ' + width);
    if (width) {
      for (let element of elements)
	element.style['min-width'] = width + 'em';
    }
  }
}

function same_day(date_str) {
  var match;
  if (date_str && (match = date_str.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    var date = new Date(match[1], match[2] - 1, match[3]).getTime();
    var now = new Date().getTime()
    return now >= date && now < date + 24 * 60 * 60 * 1000;
  }
}

function join(separator) {
  var result = '', first = true;
  for (var n = 1; n < arguments.length; n++) {
    if (arguments[n] != null && arguments[n] !== '') {
      if (!first)
	result = result + separator;
      result = result + arguments[n];
      first = false;
    }
  }
  return result;
}

(function() {
  var module = angular.module('app-common', []);

  module.directive('nullable', function() {
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
  });

  // Model: number or null, View: text (empty becomes null)
  module.directive('numeric', function() {
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
  });

  (function() {
    var lcm = 2 * 2 * 3 * 5;  /* lowest common multiple of denominator */
    var fractions = [
      [1/6, '⅙'],
      [1/5, '⅕'],
      [1/4, '¼'],
      [1/3, '⅓'],
      [2/5, '⅖'],
      [1/2, '½'],
      [3/5, '⅗'],
      [2/3, '⅔'],
      [3/4, '¾'],
      [4/5, '⅘'],
      [5/6, '⅚']]
      .reduce(function(fractions, fraction) {
	fractions[Math.round(fraction[0] * lcm)] = fraction[1];
	return fractions;
      }, []);
    var eps = lcm / (1 << 13);

    function fraction(number) {
      if (number == null)
	return null;

      var sign = '';
      if (number < 0) {
	sign = '−';  /* minus sign, not a dash */
	number = -number;
      }
      var frac = number % 1;
      if (frac) {
	var index = frac * lcm;
	if (Math.abs(index - Math.round(index)) < eps) {
	  index = Math.round(index);
	  if (fractions[index])
	    return sign + (Math.floor(number) || '') + fractions[index];
	}
	return sign + number.toFixed(2);
      }
      return sign + number;
    }

    // Model: number or null, View: text (empty becomes null)
    module.directive('fractional', function() {
      return {
	restrict: 'A',
	require: 'ngModel',
	link: function(scope, element, attrs, ctrl) {
	  ctrl.$parsers.push(function(text) {
	    var match;
	    if (typeof text == 'string') {
	      if (text == '') {
		ctrl.$setValidity('fractional', true);
		return null;
	      } else if (match = text.match(/^-?([0-9]+|[0-9]+\.[0-9]*|[0-9]*\.[0-9]+)?$/) &&
			 (!('min' in attrs) || +text >= +attrs.min) &&
			 (!('max' in attrs) || +text <= +attrs.max)) {
		ctrl.$setValidity('fractional', true);
		return +text;
	      } else
		ctrl.$setValidity('fractional', false);
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
    });

    module.filter('fractional', ['fractional', function(fractional) {
      function fractionalFilter(value) {
	if (fractional.enabled)
	  return fraction(value);
	else
	  return value;
      }
      fractionalFilter.$stateful = true;
      return fractionalFilter;
    }]);

    module.value('fractional', {enabled: true});
  }());
}());

var event_types = [
  {value: 'otsv', name: 'ÖTSV'},
  {value: 'otsv+amf', name: 'ÖTSV + AMF'},
  {value: 'otsv-bike', name: 'ÖTSV Fahrrad'},
  {value: 'otsv-ecup', name: 'ÖTSV Kids e-Cup'},
  {value: 'otsv-acup', name: 'ÖTSV A-Cup'},
  {value: 'otsv-x', name: 'ÖTSV Einzelveranstaltung'},
];

/* ex:set shiftwidth=2: */
