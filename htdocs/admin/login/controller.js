'use strict;'

/* FIXME: Wenn ein falsches Kennwort eingegeben wird, fragt Firefox trotzdem,
   ob es das Kennwort speichern soll. */

function loginController($scope, $location, $http, AuthService) {
  $scope.login = function() {
    function success() {
      $scope.error = false;
      $location.path('/').replace();
    }

    function error() {
      $scope.error = true;
    }

    $scope.dataLoading = true;
    AuthService.login($scope.username, $scope.password).
      then(success, error).
      finally(function() {
	$scope.dataLoading = false;
      });
  };

  $scope.$watch('username && password', function() {
    $scope.error = false;
  });
}
