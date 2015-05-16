'use strict;'

function veranstaltungAuswertungController($scope, $sce, $route, $location, $timeout, $http, $q, auswertung) {
  $scope.HAVE_WEASYPRINT = HAVE_WEASYPRINT;
  $scope.anzeige = { felder: [], klassen: [] };
  var features = features_aus_liste(auswertung.veranstaltung);
  $scope.features = features;

  var auswertung_alt, veranstaltung;

  function auswertung_zuweisen(a) {
    auswertung_alt = angular.copy(a);
    auswertung = a;
    veranstaltung = auswertung.veranstaltung;
    $scope.veranstaltung = veranstaltung;
    $scope.$root.kontext(veranstaltung.wertungen[($scope.anzeige.wertung || 1) - 1].titel);

    $scope.klassen = (function() {
      var klassen = [];
      angular.forEach(auswertung.fahrer, function(value, index) {
	if (value)
	  klassen.push(index + 1);
      });
      return klassen;
    })();
    angular.forEach($scope.klassen, function(klasse) {
      if ($scope.anzeige.klassen[klasse - 1] === undefined)
	$scope.anzeige.klassen[klasse - 1] = true;
    });

    $scope.ist_fahrerklasse = function(klasse) {
      return !veranstaltung.klassen[klasse - 1].gruppen;
    };
    $scope.fahrer_gruppen = veranstaltung.klassen.some(function(klasse) { return klasse && klasse.gruppen; });

    $scope.wertungen = (function() {
      var wertungen = [];
      angular.forEach(veranstaltung.wertungen, function(wertung, index) {
	if (features['wertung' + (index + 1)])
	  wertungen.push({ wertung: index + 1, bezeichnung: wertung.bezeichnung });
      });
      return wertungen;
    })();

    (function() {
      var sektionen_aus_wertung = [];
      angular.forEach(veranstaltung.sektionen, function(sektionen_in_klasse, klasse_index) {
	if (sektionen_in_klasse) {
	  sektionen_aus_wertung[klasse_index] = [];
	  try {
	    for (var runde = 1; runde <= veranstaltung.klassen[klasse_index].runden; runde++)
	      sektionen_aus_wertung[klasse_index][runde - 1] = [];
	  } catch(_) { }
	}
      });
      angular.forEach(veranstaltung.sektionen_aus_wertung, function(sektionen_in_klasse, klasse_index) {
	if (sektionen_in_klasse) {
	  angular.forEach(sektionen_in_klasse, function(sektionen_in_runde, runde_index) {
	    angular.forEach(sektionen_in_runde, function(sektion) {
	      try {
		sektionen_aus_wertung[klasse_index][runde_index][sektion - 1] = true;
	      } catch (_) { }
	    });
	  });
	}
      });

      angular.forEach(auswertung.fahrer, function(fahrer_in_klasse, klasse_index) {
	angular.forEach(fahrer_in_klasse, function(fahrer) {
	  var einzelpunkte = [];
	  for (runde = 1; runde <= veranstaltung.klassen[klasse_index].runden; runde++) {
	    var einzelpunkte_in_runde = [];
	    try {
	      angular.forEach(veranstaltung.sektionen[klasse_index], function(sektion) {
		if (sektionen_aus_wertung[klasse_index][runde - 1][sektion - 1])
		  einzelpunkte_in_runde.push('-');
		else {
		  var p = fahrer.punkte_pro_sektion[runde - 1][sektion - 1];
		  if (p == -1)
		    p = '-';
		  einzelpunkte_in_runde.push(p);
		}
	      });
	    } catch (_) { }
	    einzelpunkte.push(einzelpunkte_in_runde);
	  }

	  fahrer.einzelpunkte = function(runde, sektion) {
	    var e;
	    try {
	      e = einzelpunkte[runde - 1][sektion - 1];
	    } catch (_) { };
	    if (e === undefined && this.ausfall)
	      return '-';
	    return e;
	  };

	  fahrer.punkte_in_runde = function(runde) {
	    var punkte_in_runde = this.punkte_pro_runde[runde - 1];
	    if (punkte_in_runde === undefined)
	      punkte_in_runde = this.ausfall ? '-' : '';
	    if (!features.einzelpunkte) {
	      var einzelpunkte_in_runde = einzelpunkte[runde - 1];
	      if (einzelpunkte_in_runde) {
		return $sce.trustAsHtml(
		  '<span title="' + einzelpunkte_in_runde.join(' ') + '">' + punkte_in_runde + '</span>'
		);
	      }
	    }
	    return $sce.trustAsHtml(punkte_in_runde + '');
	  };
	});
      });
    })();
  }
  auswertung_zuweisen(auswertung);

  $scope.$watch('anzeige.fahrer_gruppen', function() {
    var fahrer_gruppen = $scope.anzeige.fahrer_gruppen;
    $scope.anzeige.fahrer = fahrer_gruppen != 'gruppen';
    $scope.anzeige.gruppen = fahrer_gruppen != 'fahrer';
  });

  $scope.klasse_anzeigen = function(klasse) {
    return $scope.anzeige.klassen[klasse - 1] && $scope.fahrer_in_klassen[klasse - 1] &&
	   (($scope.anzeige.fahrer && !veranstaltung.klassen[klasse - 1].gruppen) ||
	    ($scope.anzeige.gruppen && veranstaltung.klassen[klasse - 1].gruppen));
  };


  function nach_url(anzeige) {
    var search = angular.copy(anzeige);

    var versteckte_klassen = [];
    angular.forEach(search.klassen, function(value, index) {
      if (value === false)
	versteckte_klassen.push(index + 1);
    });
    if (versteckte_klassen.length)
      search.klasse = versteckte_klassen;
    delete search.klassen;

    var felder = search.felder;
    if (felder[felder.length - 1] === '')
      felder.pop();
    search.feld = felder;
    delete search.felder;

    search['nicht-alle'] = !search.alle;
    delete search.alle;

    if (search.wertung === null)
      search.wertung = '-';

    angular.forEach(search, function(value, key) {
      if (value === null || value === '' || value === false)
	delete search[key];
    });

    return search;
  }

  function url_aktualisieren() {
    var url = $location.search();
    if (!url.length || !angular.equals($scope.anzeige, von_url(url))) {
      $scope.ignoreRouteUpdate = true;
      $location.search(nach_url($scope.anzeige)).replace();
    }
  }

  function fahrer_vergleichen(fahrer_in_klasse) {
    angular.forEach(fahrer_in_klasse, function(fahrer) {
      fahrer.verteilung_klasse = [];
      fahrer.runde_klasse = [];
    });

    function vergleichen(a, b) {
      if (a.punkte === b.punkte && a.stechen === b.stechen &&
	  !a.ausfall && !b.ausfall) {
	for (var n = 0; n < 6; n++) {
	  if (a.punkteverteilung[n] !== b.punkteverteilung[n]) {
	    a.verteilung_klasse[n] = 'wichtig';
	    b.verteilung_klasse[n] = 'wichtig';
	    return;
	  }
	}
	var runden = Math.min(a.punkte_pro_runde.length, b.punkte_pro_runde.length);
	if (veranstaltung.wertungsmodus == 1) {
	  for (var n = 0; n < runden; n++) {
	    if (a.punkte_pro_runde[n] !== b.punkte_pro_runde[n]) {
	      a.runde_klasse[n] = 'wichtig';
	      b.runde_klasse[n] = 'wichtig';
	      break;
	    }
	  }
	} else if (veranstaltung.wertungsmodus == 2) {
	  for (var n = runden - 1; n >= 0; n--) {
	    if (a.punkte_pro_runde[n] !== b.punkte_pro_runde[n]) {
	      a.runde_klasse[n] = 'wichtig';
	      b.runde_klasse[n] = 'wichtig';
	      break;
	    }
	  }
	}
      }
    }

    for (var n = 0; n < fahrer_in_klasse.length - 1; n++)
      vergleichen(fahrer_in_klasse[n], fahrer_in_klasse[n + 1]);
  }

  function aktualisieren() {
    var wertung = $scope.anzeige.wertung;

    $scope.$root.kontext(veranstaltung.wertungen[(wertung || 1) - 1].titel);
    if (wertung == null)
      $scope.anzeige.alle = true;
    else if (veranstaltung.wertungen[wertung - 1].gruppen)
      $scope.anzeige.alle = false;

    $scope.spalten = [];

    function fahrer_sichtbar(fahrer) {
	return wertung == null || fahrer.wertungen[wertung - 1] || $scope.anzeige.alle;
    }

    var fahrer_in_klassen = [];
    angular.forEach(auswertung.fahrer, function(alle_fahrer_in_klasse, klasse_index) {
      var fahrer_in_klasse = [];
      if ($scope.anzeige.klassen[klasse_index]) {
	angular.forEach(alle_fahrer_in_klasse, function(fahrer) {
	  if (fahrer_sichtbar(fahrer))
	    fahrer_in_klasse.push(fahrer);
	});
      }
      if (fahrer_in_klasse.length == 0)
	fahrer_in_klasse = null;
      fahrer_in_klassen.push(fahrer_in_klasse);
    });

    angular.forEach(fahrer_in_klassen, function(fahrer_in_klasse, klasse_index) {
      if (fahrer_in_klasse) {
	var spalten = $scope.spalten[klasse_index] = {};
	angular.forEach(fahrer_in_klasse, function(fahrer) {
	  if (fahrer.zusatzpunkte)
	    spalten.zusatzpunkte = true;
	  if (fahrer.stechen)
	    spalten.stechen = true;
	  try {
	    if (fahrer.wertungen[wertung - 1].punkte)
	      spalten.wertungspunkte = true;
	  } catch (_) { }
	  /* FIXME: Andere leere Spalten auch unterdrücken ... */
	  /* Spalte Startnummer für Gruppenwertungen verstecken */
	});

	fahrer_in_klasse = fahrer_in_klasse.sort(function(a, b) {
	    var rang_a, rang_b;
	    if (wertung == null || $scope.anzeige.alle) {
	      rang_a = a.rang;
	      rang_b = b.rang;
	    } else {
	      rang_a = a.wertungen[wertung - 1].rang;
	      rang_b = b.wertungen[wertung - 1].rang;
	    }
	    if (rang_a != rang_b)
	      return rang_a - rang_b;
	    if (a.startnummer >= 0 || b.startnummer >= 0)
		return a.startnummer - b.startnummer;
	    else
	      return a.nachname.localeCompare(b.nachname) ||
		     a.vorname.localeCompare(b.vorname);
	});

	fahrer_vergleichen(fahrer_in_klasse);
      }
    });
    $scope.fahrer_in_klassen = fahrer_in_klassen;

    $scope.zusammenfassung = (function() {
      var anzahl_fahrer = 0, anzahl_gruppen = 0;
      var ausfall = [];
      var ausser_konkurrenz = 0;
      angular.forEach(fahrer_in_klassen, function(fahrer_in_klasse, klasse_index) {
	if (fahrer_in_klasse) {
	  if (veranstaltung.klassen[klasse_index].gruppen)
	    anzahl_gruppen += fahrer_in_klasse.length;
	  else
	    anzahl_fahrer += fahrer_in_klasse.length;
	  angular.forEach(fahrer_in_klasse, function(fahrer) {
	    if (fahrer.ausfall)
	      ausfall[fahrer.ausfall] = (ausfall[fahrer.ausfall] || 0) + 1;
	    if (fahrer.ausser_konkurrenz)
	      ausser_konkurrenz++;
	  });
	}
      });
      var list = [];
      if (anzahl_fahrer)
	list.push(anzahl_fahrer + ' ' + 'Fahrer');
      if (anzahl_gruppen)
	list.push(anzahl_gruppen + ' ' + (anzahl_gruppen == 1 ? 'Gruppe' : 'Gruppen'));
      var gesamt = list.join(' und ');
      list = [];
      if (ausfall[5] || ausfall[6])
	list.push(((ausfall[5] || 0) + (ausfall[6] || 0)) + ' nicht gestartet');
      if (ausfall[3])
	list.push(ausfall[3] + ' ausgefallen');
      if (ausfall[4])
	list.push(ausfall[4] + ' nicht gewertet');
      if (ausser_konkurrenz)
	list.push(ausser_konkurrenz + ' außer Konkurrenz');
      if (list.length)
	gesamt += ' (davon ' + list.join(', ') + ')';
      return gesamt ? gesamt + '.' : null;
    })();
    url_aktualisieren();
  }

  $scope.rundenliste = function(klasse) {
    var runden = [];
    try {
      for (var runde = 1; runde <= veranstaltung.klassen[klasse - 1].runden; runde++)
	runden.push(runde);
    } catch(_) { }
    return runden;
  }

  $scope.land_bundesland = function(fahrer) {
    var land_bundesland = [];
    if (fahrer.land)
      land_bundesland.push(fahrer.land);
    if (fahrer.bundesland)
      land_bundesland.push('(' + fahrer.bundesland + ')');
    return land_bundesland.join(' ');
  };

  var definierte_felder = {
    startnummer:
      { name: 'Startnummer',
	bezeichnung: '<span title="Startnummer">Nr.</span>',
	ausdruck: "startnummer < 0 ? null : startnummer",
	style: { 'text-align': 'center' },
	when: function() { return features.startnummer } },
    name:
      { name: 'Name',
	bezeichnung: 'Name',
	/* FIXME: <br> nach Bewerber! */
	ausdruck: "(bewerber ? bewerber + ': ' : '') + join(' ', nachname, vorname)",
	style: { 'text-align': 'left', 'padding-right': '1em' } },
    fahrzeug:
      { name: 'Fahrzeug',
	bezeichnung: 'Fahrzeug',
	ausdruck: "fahrzeug",
	style: { 'text-align': 'left' },
	when: function() { return features.fahrzeug } },
    club:
      { name: 'Club',
	bezeichnung: 'Club',
	ausdruck: "club",
	style: { 'text-align': 'left' },
	when: function() { return features.club } },
    wohnort:
      { name: 'Wohnort',
	bezeichnung: 'Wohnort',
	ausdruck: "wohnort",
	style: { 'text-align': 'left' },
	when: function() { return features.wohnort } },
    lbl:
      { name: 'Land (Bundesland)',
	bezeichnung: '<span title="Land (Bundesland)">Land</span>',
	ausdruck: "land_bundesland(fahrer)",
	style: { 'text-align': 'left' },
	when: function() { return features.land || features.bundesland } },
  };
  angular.forEach(definierte_felder, function(feld) {
    feld.bezeichnung = $sce.trustAsHtml(feld.bezeichnung);
  });
  $scope.feldliste = (function() {
    var feldliste = [];
    angular.forEach(definierte_felder, function(feld, key) {
      if (!feld.when || feld.when())
        feldliste.push({ key: key, name: feld.name });
    });
    feldliste = feldliste.sort(function(a, b) { return a.name.localeCompare(b.name); });
    feldliste.unshift({ key: '', name: '' });
    return feldliste;
  })();

  var ausfall = {
    3: 'ausgefallen',
    4: 'nicht gewertet',
    5: 'nicht gestartet',
    6: 'nicht gestartet, entschuldigt'
  };

  $scope.ausfall = function(fahrer) {
    var grund = [];
    if (fahrer.ausser_konkurrenz)
      grund.push('außer konkurrenz');
    if (fahrer.ausfall)
      grund.push(ausfall[fahrer.ausfall]);
    return grund.join(', ');
  };

  $scope.klassensymbol = function(klasse) {
    try {
      var farbe = veranstaltung.klassen[klasse - 1].farbe;
      if (farbe) {
	return $sce.trustAsHtml(
	  /* '<span style="position: absolute; z-index: 1">◻</span>' + */
	  '<span style="color:' + farbe + '">◼</span>');
      }
    } catch(_) { }
  };

  $scope.fold = {};
  $scope.einstellungen = function(event) {
    event.preventDefault();
    event.target.blur();
    $scope.fold.einstellungen = !$scope.fold.einstellungen;
  }

  function scalefont(size, scale) {
    return Math.round(size * Math.pow(Math.sqrt(2), scale));
  };

  $scope.print_style = function() {
    var anzeige = $scope.anzeige;
    return $sce.trustAsHtml('\n\
@media print {\n\
  @page {\n\
    size:' + (anzeige['page-size'] || 'A4') + ';\n\
    margin-left:' + (anzeige['margin-left'] || '2cm') + ';\n\
    margin-top:' + (anzeige['margin-top'] || '2cm') + ';\n\
    margin-right:' + (anzeige['margin-right'] || '2cm') + ';\n\
    margin-bottom:' + (anzeige['margin-bottom'] || '2cm') + ';\n\
  }\n\
  body { font-size:' + scalefont(anzeige['font-size'] || 10, 0) + 'pt; }\n\
  h2 { font-size:' + scalefont(anzeige['font-size'] || 10, 1) + 'pt; }\n\
  h1 { font-size:' + scalefont(anzeige['font-size'] || 10, 2) + 'pt; }\n\
}\n');
  }

  $scope.pdf_erzeugen = function(event) {
    event.preventDefault();
    $timeout(function() {
      $scope.html = document.all[0].outerHTML;
      $scope.url = $location.absUrl();
      $timeout(function() {
	document.getElementById('pdf').submit();
	delete $scope.html;
	delete $scope.url;
      });
    });
  };

  $scope.$watch('anzeige', aktualisieren, true);
  $scope.$watch('anzeige.felder', function() {
    var felder = $scope.anzeige.felder;
    for (var n = 0; n < felder.length - 1; n++)
      if (felder[n] === '')
	felder.splice(n, 1);
    if (felder[felder.length - 1] !== '')
      felder.push('');

    $scope.felder = [];
    for (var n = 0; n < felder.length - 1; n++) {
      var feld = definierte_felder[felder[n]];
      if (feld)
	$scope.felder.push(feld);
    }
  }, true);

  function von_url(search) {
    var anzeige = angular.copy(search);

    var klassen = [];
    angular.forEach($scope.klassen, function(klasse) {
      klassen[klasse - 1] = true;
    });
    var versteckte_klassen = anzeige.klasse || [];
    if (typeof versteckte_klassen === 'string')
      versteckte_klassen = [versteckte_klassen];
    angular.forEach(versteckte_klassen, function(klasse) {
      klassen[klasse - 1] = false;
    });
    anzeige.klassen = klassen;
    delete anzeige.klasse;

    var felder = anzeige.feld || [];
    if (typeof felder === 'string')
      felder = [felder];
    if (felder.length == 0 || felder[felder.length - 1] !== '')
      felder.push('');
    anzeige.felder = felder;
    delete anzeige.feld;

    anzeige.alle = !anzeige['nicht-alle'];
    delete anzeige['nicht-alle'];

    if (anzeige.wertung === '-')
      anzeige.wertung = null;
    else if (anzeige.wertung != null)
      anzeige.wertung = +anzeige.wertung;

    if (anzeige['font-size'] !== undefined)
      anzeige['font-size'] = +anzeige['font-size'];

    if (anzeige.dauer !== undefined)
      anzeige.dauer = +anzeige.dauer;

    anzeige.seitenumbruch = !!anzeige.seitenumbruch;

    return anzeige;
  };

  $scope.$on('$routeUpdate', function() {
    if ($scope.ignoreRouteUpdate) {
      delete $scope.ignoreRouteUpdate;
      return;
    }

    var felder = [];
    angular.forEach(['startnummer', 'name', 'lbl', 'fahrzeug'], function(feld) {
      var when = definierte_felder[feld].when;
      if (!when || when())
	felder.push(feld);
    });

    var search = $location.search();
    var defaults = {
      wertung: features.wertung1 ? 1 : null,
      feld: felder,
      'page-size': 'A4',
      'font-size': 8,
      'margin-left': '1cm',
      'margin-top': '4cm',
      'margin-right': '1cm',
      'margin-bottom': '1cm',
    };
    angular.forEach(defaults, function(value, key) {
      if (search[key] === undefined)
	search[key] = value;
    });
    angular.extend($scope.anzeige, von_url(search));
  });
  $scope.$emit('$routeUpdate');

  function seite_zu_lange() {
    var body = document.body;
    var doc = document.documentElement;
    var documentHeight = Math.max(
      body.scrollHeight, doc.scrollHeight,
      body.offsetHeight, doc.offsetHeight,
      doc.clientHeight);

    var doc = window.document.documentElement;
    var windowHeight = doc.clientHeight;

    return documentHeight > windowHeight;
  }

  function seite_anzeigen(position) {
    if (!position)
      position = [undefined, 0];
    var klassen = document.querySelectorAll('.klasse');
    var k, fahrer, anzahl_klassen = 0, anzahl_fahrer = 0;

    for (k = 0; k < klassen.length; k++)
      angular.element(klassen[k]).addClass('ng-hide');
    if (position[0] !== undefined) {
      for (k = 0; k < klassen.length; k++) {
	if (k == position[0]) {
	  fahrer = klassen[k].querySelectorAll('.fahrer');
	  if (position[1] >= fahrer.length) {
	    fahrer = undefined;
	    k++;
	  }
	  break;
	}
      }
    }
    if (k == klassen.length) {
      position = [0, 0, 0];
      k = 0;
    }

    var offset = position[1];
    var undo = false;
    for(; k < klassen.length; k++, offset = 0) {
      if (!fahrer)
	fahrer = klassen[k].querySelectorAll('.fahrer');
      for (var f = 0; f < fahrer.length; f++)
	angular.element(fahrer[f]).addClass('ng-hide');
      if (offset < fahrer.length) {
	angular.element(klassen[k]).removeClass('ng-hide');
	anzahl_klassen++;
      }
      while (offset < fahrer.length) {
	var offset_alt = offset;

	offset++;
	if (k == position[0] &&
	    offset == position[1] + 1 &&
	    offset < fahrer.length)
	  offset++;
	while (offset < 5 && offset < fahrer.length)
	  offset++;
	if (offset + 1 == fahrer.length)
	  offset++;
	for (var o = offset_alt; o < offset; o++)
	  angular.element(fahrer[o]).removeClass('ng-hide');
	anzahl_fahrer += offset - offset_alt;

	if (seite_zu_lange()) {
	  if (undo) {
	    anzahl_fahrer -= offset - offset_alt;
	    if (offset_alt == 0) {
	      angular.element(klassen[k]).addClass('ng-hide');
	      anzahl_klassen--;
	      offset = offset_alt;
	    } else {
	      while (offset > offset_alt) {
		offset--;
		angular.element(fahrer[offset]).addClass('ng-hide');
	      }
	    }
	  }
	  return [k, offset, anzahl_klassen, anzahl_fahrer];
	}
	undo = true;
      }
      fahrer = undefined;
    }
    return [k, 0, anzahl_klassen, anzahl_fahrer];
  }

  function alles_anzeigen() {
    var klassen = document.querySelectorAll('.klasse');

    angular.forEach(klassen, function(klasse) {
      var fahrer = klasse.querySelectorAll('.fahrer');

      angular.forEach(fahrer, function(fahrer) {
	angular.element(fahrer).removeClass('ng-hide');
      });
      angular.element(klasse).removeClass('ng-hide');
    });
  }

  var timeout_promise;
  var http_request;
  var cancel_http_request;

  function stop() {
    if (timeout_promise)
      $timeout.cancel(timeout_promise);
    if (cancel_http_request)
      cancel_http_request.resolve();
  }
  $scope.$on('$destroy', stop);

  $scope.$watch('anzeige.dauer', function() {
    stop();

    if ($scope.anzeige.dauer != null) {
      var position;

      (function animieren() {
	if ($scope.anzeige.dauer != null) {
	  if (http_request) {
	    http_request.
	      success(function(auswertung_neu) {
		if (!angular.equals(auswertung_alt, auswertung_neu)) {
		  auswertung_zuweisen(auswertung_neu);
		  aktualisieren();
		}
	      });
	    http_request = undefined;
	  }

	  position = seite_anzeigen(position);

	  cancel_http_request = $q.defer();
	  http_request = $http.get('/api/veranstaltung/auswertung',
				   {params: $route.current.params,
				    timeout: cancel_http_request.promise});

	  var dauer = (position[2] * 1500 + position[3] * 600) * Math.pow(2, $scope.anzeige.dauer / 2);
	  timeout_promise = $timeout(animieren, dauer);
        }
      })();
    } else
      alles_anzeigen();
  });

  $scope.gesamtpunkte = function(fahrer) {
    return fahrer.punkte == null ? null :
      wertungspunkte(fahrer.punkte, veranstaltung.punkteteilung);
  }

  $scope.zusatzpunkte = function(fahrer) {
    return wertungspunkte(fahrer.zusatzpunkte, veranstaltung.punkteteilung) || '';
  }

  $scope.wertungspunkte = function(fahrer) {
    var wp;
    try {
      wp = fahrer.wertungen[$scope.anzeige.wertung - 1].punkte;
    } catch(_) { }
    return wertungspunkte(wp, veranstaltung.punkteteilung);
  }

  $scope.rang = function(fahrer) {
    var rang = $scope.anzeige.alle ? fahrer.rang : fahrer.wertungen[$scope.anzeige.wertung - 1].rang;
    if (rang != null)
      return rang + '.';
  }

  $scope.selber_tag = same_day;
}

veranstaltungAuswertungController.resolve = {
  auswertung: function($q, $http, $route) {
    return http_request($q, $http.get('/api/veranstaltung/auswertung',
				      {params: $route.current.params}));
  },
};

