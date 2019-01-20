'use strict';

function starting_classes(event) {
  var starting = [];
  for (var class_ = 1; class_ <= event.classes.length; class_++) {
    var zones = event.zones[class_ - 1];
    if (zones && zones.length)
      starting[class_ - 1] = true;
  }
  return starting;
}

function warn_before_unload($scope, modified) {
  var daten_veraendert = 'Die Daten in diesem Formular wurden verändert.';
  window.onbeforeunload = function(e) {
    if (modified()) {
      e.returnValue = daten_veraendert;
      return daten_veraendert;
    }
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

function http_request($q, request) {
  var deferred = $q.defer();
  request
    .then(function(response) {
      deferred.resolve(response.data);
    })
    .catch(function(response) {
      deferred.reject();
      network_error(response);
    });
  return deferred.promise;
}

function network_error(response) {
  if (response.xhrStatus == 'abort')
    return;
  let status = response.status;
  if (status == 403 /* Forbidden */) {
    /*
     * Ignore here: the $httpProvider response interceptor will redirect to the
     * login page.  The redirection is done in a $timeout as Angular doesn't
     * like to have its digest cycle interrupted.
     */
    return;
  }

  var error;
  try {
    error = response.data.error;
  } catch(_) { }

  alert(status === 409 ?
	  'Veränderung der Daten am Server festgestellt.' :
	(status == 500 ?
	   'Interner Serverfehler.' :
	   'HTTP-Request ist ' + (status != -1 ? 'mit Status ' + status + ' ' : '') + 'fehlgeschlagen.') +
	(error != null ? '\n\n' + error : ''));
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

function class_may_start(class_, event) {
  return event.zones[event.classes[class_ - 1].ranking_class - 1] &&
	 event.classes[class_ - 1].rounds;
}

function rider_does_not_start(rider, event) {
  function class_does_not_start(rider, event) {
    if (!rider || rider.group)
      return;

    var class_ = rider['class'];
    if (class_ == null)
      return 'Fahrer ist keiner Klasse zugewiesen.';
    if (!class_may_start(class_, event))
      return 'Klasse ' + rider.class + ' startet nicht.'
  }

  var reasons = [];
  var reason = class_does_not_start(rider, event);
  if (reason)
    reasons.push(reason);
  if (rider) {
    if (!rider.verified)
      reasons.push((rider.group ? 'Gruppe' : 'Fahrer') + ' ist nicht verifiziert.');
    if (event.features.registered && !rider.registered)
      reasons.push('Nennungseingang ist nicht markiert.');
  }
  return reasons.join(' ');
}
