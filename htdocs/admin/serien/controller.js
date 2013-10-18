'use strict;'

function serienController($scope, $http, $location) {
  $scope.neue_serie = function() {
    $location.path('/serie/neu');
  };

  $http.get('/api/vareihen').
    success(function(vareihen) {
      $scope.vareihen = vareihen;
    });
}
