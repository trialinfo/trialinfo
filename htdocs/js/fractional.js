'use strict';

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

  var module = angular.module('fractional', []);

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

/* ex:set shiftwidth=2: */
