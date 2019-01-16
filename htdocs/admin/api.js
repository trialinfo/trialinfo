'use strict;'

function starting_classes(event) {
  var starting = [];
  for (var class_ = 1; class_ <= event.classes.length; class_++) {
    var zones = event.zones[class_ - 1];
    if (zones && zones.length)
      starting[class_ - 1] = true;
  }
  return starting;
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

var fraction = (function() {
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
    [5/6, '⅚']];
  var eps = 1 / (1 << 13);

  return function(x) {
    if (x == null)
      return null;

    var sign = '';
    if (x < 0) {
      sign = '−';  /* Minuszeichen, kein Bindestrich! */
      x = -x;
    }
    var frac = x % 1;
    if (frac) {
      var l = 0, u = fractions.length - 1;
      while (l <= u) {
	var n = (l + u) >> 1;
	var wert = fractions[n][0];
	if (frac - eps > wert)
	  l = n + 1;
	else if (frac + eps < wert)
	  u = n - 1;
	else
	  return sign + Math.floor(x) + fractions[n][1];
      }
      return sign + x.toFixed(2).replace(/\.?0+$/, '');
    }
    return sign + x;
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
  if (date_str && (match = date_str.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    var date = new Date(match[1], match[2] - 1, match[3]).getTime();
    var now = new Date().getTime()
    return now >= date && now < date + 24 * 60 * 60 * 1000;
  }
}

function event_name($scope, event) {
  var remarks = [];
  angular.forEach(event.series, function(serie) {
    if (serie.abbreviation != null)
      remarks.push(serie.abbreviation);
  });
  remarks.sort();

  var name = event.title;
  if (event.location != null && event.date != null)
    name = event.location + ' am ' + $scope.$eval('date | date:"d.M."', event);
  return name +
	 (remarks.length ? ' (' + remarks.join(', ') + ')' : '');
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
