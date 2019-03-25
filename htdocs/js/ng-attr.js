/* From: https://github.com/argshook/ng-attr */

;(function() {
  'use strict';

  angular
    .module('argshook.ngAttr', [])
    .directive('ngAttr', ['$parse', ngAttrDirective]);


  function ngAttrDirective($parse) {
    return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        var el = element[0];

        scope.$watch(attrs.ngAttr, setAttributes, true);

        function setAttributes() {
          var attrsAndValueRefs = $parse(attrs.ngAttr)(scope) || {};

          Object
            .keys(attrsAndValueRefs)
            .filter(isAttrValid)
            .forEach(function(attr) {
              el.setAttribute(attr, attrsAndValueRefs[attr]);
            });

          function isAttrValid(attr) {
            return typeof attrsAndValueRefs[attr] === 'string' &&
              attrsAndValueRefs[attr] !== el.getAttribute(attr);
          }
        }
      }
    };
  }
})();

