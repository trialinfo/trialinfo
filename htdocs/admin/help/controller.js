'use strict';

var helpController = [
  '$scope',
  function ($scope) {
    $scope.config = config;
  }];

angular.module('application').controller('helpController', helpController);
