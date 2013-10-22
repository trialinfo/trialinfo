'use strict;'

function serienController($scope, $http, $location, vareihen) {
  $scope.vareihen = vareihen;

  $scope.neue_serie = function() {
    $location.path('/serie/neu');
  };
}

serienController.resolve = {
  vareihen: function($q, $http) {
    return http_request($q, $http.get('/api/vareihen'));
  }
};
