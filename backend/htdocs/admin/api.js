'use strict;'

function load_events($scope, $http) {
  return $http.get('/api/events').
    success(function(events) {
      $scope.events = events;
    });
}

function load_event($scope, $http, id) {
  return $http.get('/api/event' + id).
    success(function(event) {
      $scope.event = event;
      $scope.features = event.features;
    });
}

function starting_classes(event) {
  var starting = [];
  for (var class_ = 1; class_ <= event.classes.length; class_++) {
    var zones = event.zones[class_ - 1];
    if (zones && zones.length)
      starting[class_ - 1] = true;
  }
  return starting;
}

function save_rider($http, id, number, version, rider) {
  var params = {
    version: version,
  };
  params.mtime = Math.floor(new Date().getTime() / 1000);
  /* FIXME: Should saving a rider without a number be a POST request instead? */
  return $http.put('/api/event/' + id + '/rider' +
		   (number !== undefined ? '/' + number : ''),
		   rider, {params: params});
}

function save_event($http, id, event) {
  var params = {
    version: event.version,
  };
  /* FIXME: Is id null / undefined when we don't have an ID, yet? Should that
     be a POST request? */
  params.mtime = Math.floor(new Date().getTime() / 1000);
  return $http.put('/api/event/' + id, event, {params: params});
}

function remove_rider($http, id, number, version) {
  var params = {
    version: version
  };
  return $http.delete('/api/event/' + id + '/rider' + number, {params: params});
}

function rider_name(rider, $scope) {
  var infos = [];
  if (rider.last_name !== null && rider.last_name !== '')
    infos.push(rider.last_name);
  if (rider.first_name !== null && rider.first_name !== '')
    infos.push(rider.first_name);
  if (rider.number !== null && rider.number >= 0)
    infos.push('(' + rider.number + ')');
  return infos.join(' ');
}

function rider_info(rider, $scope) {
  var infos = [];
  if (rider.number >= 0)
    infos.push('Startnummer: ' + rider.number);
  if (rider['class'] !== null)
    infos.push('Klasse: ' + rider['class']);
  if (rider.date_of_birth)
    infos.push('Geburtsdatum: ' +
	       $scope.$eval('rider.date_of_birth | date:"d.M.yyyy"', {rider: rider}));
  return infos.join('\n');
}

function set_focus(selector, $timeout) {
  $timeout(function() {
    var element = document.querySelector(selector);
    element.focus();
    element.select();
  });
}

function warn_before_unload($scope, modified) {
  var daten_veraendert = 'Die Daten in diesem Formular wurden verändert.';
  window.onbeforeunload = function() {
    if (modified())
      return daten_veraendert;
  };
  $scope.$on('$locationChangeStart',
    function(event) {
      if (modified()) {
	if(!confirm(daten_veraendert + '\n\nBeim Verlassen dieser Seite gehen die Änderungen verloren.'))
	    event.preventDefault();
      }
    });
  $scope.$on('$destroy', function() {
    window.onbeforeunload = undefined;
  });
}

function remove_event($http, id, version) {
  var params = {
    id: id,
    version: version
  };
  return $http.delete('/api/event', {params: params});
}

function save_serie($http, serie, daten) {
  var params = {
    version: daten.version
  };
  return $http.put('/api/serie/' + serie, daten, {params: params});
}

function remove_serie($http, serie, version) {
  var params = {
    version: version
  };
  return $http.delete('/api/serie/' + serie, {params: params});
}

function http_request($q, request) {
  var deferred = $q.defer();
  request.
    success(function(data) {
      deferred.resolve(data);
    }).
    error(function(data, status) {
      deferred.reject();
      network_error(data, status);
    });
  return deferred.promise;
}

function network_error(data, status) {
  if (status == 403 /* Forbidden */) {
    /*
     * Ignore here: the $httpProvider response interceptor will redirect to the
     * login page.  The redirection is done in a $timeout as Angular doesn't
     * like to have its digest cycle interrupted.
     */
    return;
  }

  alert(status === 409 ?
	  'Veränderung der Daten am Server festgestellt.' :
	(status == 500 ?
	   'Interner Serverfehler.' :
	   'HTTP-Request ist ' + (status ? 'mit Status ' + status + ' ' : '') + 'fehlgeschlagen.') +
	(typeof data === 'object' && data.error !== undefined ? '\n\n' + data.error : ''));
}

var score = (function() {
  var fractions = [ [1/4, '¼'], [1/3, '⅓'], [1/2, '½'], [2/3, '⅔'], [3/4, '¾'] ];
  var eps = 1 / (1 << 13);

  return function(score, split_score) {
    if (score == null)
      return null;
    var sign = '';
    if (score < 0) {
      sign = '−';  /* Minuszeichen, kein Bindestrich! */
      score = -score;
    }
    var komma = score % 1;
    if (komma && split_score) {
      for (var n = 0; n < fractions.length; n++) {
	var wert = fractions[n][0];
	if (komma >= wert - eps && komma <= wert + eps)
	  return sign + Math.floor(score) + fractions[n][1];
      }
      return sign + score.toFixed(2).replace(/0+$/, '');
    } else
      return sign + score;
  };
})();

function join(separator) {
  var args = join.arguments, result = '', first = true;
  for (var n = 1; n < args.length; n++) {
    if (args[n] != null && args[n] !== '') {
      if (!first)
	result = result + separator;
      result = result + args[n];
      first = false;
    }
  }
  return result;
}

function same_day(date_str) {
  var match;
  if (match = date_str.match(/^(\d{4})-(\d{2})-(\d{2})$/)) {
    var date = new Date(match[1], match[2] - 1, match[3]).getTime();
    var now = new Date().getTime()
    return now >= date && now < date + 24 * 60 * 60 * 1000;
  }
}

function event_name(event) {
  var abbreviations = [];
  angular.forEach(event.series, function(serie) {
    if (serie.abbreviation != null)
      abbreviations.push(serie.abbreviation);
  });
  return event.title +
	 (abbreviations.length ? ' (' + abbreviations.sort().join(', ') + ')' : '');
}

function generic_compare(v1, v2) {
  if ((v1 == null) || (v2 == null))
    return (v1 == null) - (v2 == null);
  var t1 = typeof v1;
  var t2 = typeof v2;
  if (t1 == t2) {
    if (v1 === v2)
      return 0;
    if (t1 == 'string')
      return v1.localeCompare(v2);
    else
      return v1 < v2 ? -1 : 1;
  } else
    return t1 < t2 ? -1 : 1;
}
