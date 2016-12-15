function features_from_list(event) {
  var obj = {};
  angular.forEach(event.features, function(feature) {
    obj[feature] = true;
  });
  if (event.rankings) {
    obj.rankings = [];
    for (var n = 1; n <= event.rankings.length; n++)
      if ('ranking' + n in obj)
	obj.rankings.push(n);
  }
  return obj;
}
