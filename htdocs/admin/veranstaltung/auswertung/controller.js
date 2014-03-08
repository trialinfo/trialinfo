'use strict;'

function veranstaltungAuswertungController($scope, $sce, $route, $location, $timeout, auswertung) {
  $scope.HAVE_WEASYPRINT = HAVE_WEASYPRINT;
  $scope.anzeige = { felder: [], klassen: [] };

  var veranstaltung = auswertung.veranstaltung;
  $scope.veranstaltung = veranstaltung;
  $scope.$root.kontext(veranstaltung.wertungen[($scope.anzeige.wertung || 1) - 1].titel);
  $scope.klassen = (function() {
    var klassen = [];
    angular.forEach(auswertung.fahrer_in_klassen, function(value, index) {
      if (value)
	klassen.push(index + 1);
    });
    return klassen;
  })();
  angular.forEach($scope.klassen, function(klasse) {
    $scope.anzeige.klassen[klasse - 1] = true;
  });

  $scope.wertungen = (function() {
    var wertungen = [];
    angular.forEach(veranstaltung.wertungen, function(wertung, index) {
      if (wertung.aktiv)
	wertungen.push({ wertung: index + 1, bezeichnung: wertung.bezeichnung });
    });
    return wertungen;
  })();

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
    if (!url.length || !angular.equals($scope.anzeige, von_url(url)))
      $location.search(nach_url($scope.anzeige)).replace();
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
	  a.verteilung_klasse[n] = 'wichtig';
	  b.verteilung_klasse[n] = 'wichtig';
	  if (a.punkteverteilung[n] !== b.punkteverteilung[n])
	    return;
	}
	var runden = veranstaltung.klassen[a.klasse - 1].runden;
	if (veranstaltung.wertungsmodus == 1) {
	  for (var n = 0; n < runden; n++) {
	    a.runde_klasse[n] = 'wichtig';
	    b.runde_klasse[n] = 'wichtig';
	    if (a.punkte_pro_runde[n] !== b.punkte_pro_runde[n])
	      break;
	  }
	} else if (veranstaltung.wertungsmodus == 2) {
	  for (var n = runden - 1; n >= 0; n--) {
	    a.runde_klasse[n] = 'wichtig';
	    b.runde_klasse[n] = 'wichtig';
	    if (a.punkte_pro_runde[n] !== b.punkte_pro_runde[n])
	      break;
	  }
	}
      }
    }

    for (var n = 0; n < fahrer_in_klasse.length - 1; n++)
      vergleichen(fahrer_in_klasse[n], fahrer_in_klasse[n + 1]);
  }

  function aktualisieren() {
    $scope.$root.kontext(veranstaltung.wertungen[($scope.anzeige.wertung || 1) - 1].titel);
    if ($scope.anzeige.wertung == null)
      $scope.anzeige.alle = true;

    var fahrer_in_klassen = [];
    angular.forEach(auswertung.fahrer_in_klassen, function(fahrer_in_klasse, index) {
      if (fahrer_in_klasse) {
	if (!$scope.anzeige.alle) {
	  var kopie = [];
	  angular.forEach(fahrer_in_klasse, function(fahrer) {
	    var wertung = fahrer.wertungen[$scope.anzeige.wertung - 1];
	    if (wertung) {
	      kopie.push(fahrer);
	    }
	  });
	  if (kopie.length == 0)
	    kopie = null;
	  fahrer_in_klasse = kopie;
	}
      }
      if (fahrer_in_klasse) {
	var klasse = veranstaltung.klassen[index];
	klasse.zusatzpunkte = false;
	klasse.stechen = false;
	klasse.wertungspunkte = false;
	angular.forEach(fahrer_in_klasse, function(fahrer) {
	  if (fahrer.zusatzpunkte)
	    klasse.zusatzpunkte = true;
	  if (fahrer.stechen)
	    klasse.stechen = true;
	  try {
	    if (fahrer.wertungen[$scope.anzeige.wertung - 1].punkte)
	      klasse.wertungspunkte = true;
	  } catch (_) { }
	});
	fahrer_vergleichen(fahrer_in_klasse);
      }
      fahrer_in_klassen.push(fahrer_in_klasse);
    });
    $scope.fahrer_in_klassen = fahrer_in_klassen;

    $scope.zusammenfassung = (function() {
      var gesamt = 0;
      var ausfall = [];
      var ausser_konkurrenz = 0;
      angular.forEach(auswertung.fahrer_in_klassen, function(fahrer_in_klasse, klasse_index) {
	if (fahrer_in_klasse) {
	  angular.forEach(fahrer_in_klasse, function(fahrer) {
	    if (!($scope.anzeige.alle || fahrer.wertungen[$scope.anzeige.wertung - 1]) ||
		!$scope.anzeige.klassen[klasse_index])
	      return;
	    gesamt++;
	    if (fahrer.ausfall)
	      ausfall[fahrer.ausfall] = (ausfall[fahrer.ausfall] || 0) + 1;
	    if (fahrer.ausser_konkurrenz)
	      ausser_konkurrenz++;
	  });
	}
      });
      var list = [];
      if (ausfall[5] || ausfall[6])
	list.push(((ausfall[5] || 0) + (ausfall[6] || 0)) + ' nicht gestartet');
      if (ausfall[3])
	list.push(ausfall[3] + ' ausgefallen');
      if (ausfall[4])
	list.push(ausfall[4] + ' nicht gewertet');
      if (ausser_konkurrenz)
	list.push(ausser_konkurrenz + ' außer Konkurrenz');
      return gesamt + ' Fahrer' +
	     (list.length ? ' (davon ' + list.join(', ') + ')' : '') + '.';
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
	style: { 'text-align': 'center' } },
    name:
      { name: 'Name',
	bezeichnung: 'Name',
	ausdruck: "nachname + ' ' + vorname",
	style: { 'text-align': 'left', 'padding-right': '1em' } },
    fahrzeug:
      { name: 'Fahrzeug',
	bezeichnung: 'Fahrzeug',
	ausdruck: "fahrzeug",
	style: { 'text-align': 'left' } },
    club:
      { name: 'Club',
	bezeichnung: 'Club',
	ausdruck: "club",
	style: { 'text-align': 'left' } },
    wohnort:
      { name: 'Wohnort',
	bezeichnung: 'Wohnort',
	ausdruck: "wohnort",
	style: { 'text-align': 'left' } },
    lbl:
      { name: 'Land (Bundesland)',
	bezeichnung: '<span title="Land (Bundesland)">Land</span>',
	ausdruck: "land_bundesland(fahrer)",
	style: { 'text-align': 'left' } },
  };
  angular.forEach(definierte_felder, function(feld) {
    feld.bezeichnung = $sce.trustAsHtml(feld.bezeichnung);
  });
  $scope.anzeige.felder = ['startnummer', 'name', ''];
  $scope.felder = [definierte_felder['startnummer'], definierte_felder['name']];
  $scope.feldliste = (function() {
    var feldliste = [];
    angular.forEach(definierte_felder, function(feld, key) {
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
    return fahrer.ausser_konkurrenz ? "außer konkurrenz" :
	   fahrer.ausfall ? ausfall[fahrer.ausfall] : undefined;
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
    else if (anzeige['wertung'] !== undefined)
      anzeige['wertung'] = +anzeige['wertung'];

    if (anzeige['font-size'] !== undefined)
      anzeige['font-size'] = +anzeige['font-size'];

    anzeige.seitenumbruch = !!anzeige.seitenumbruch;

    return anzeige;
  };

  $scope.$on('$routeUpdate', function() {
    var search = $location.search();
    angular.forEach({
      wertung: veranstaltung.wertungen.length ? 1 : null,
      /* alle: true, */
      /* klasse: [], */
      feld: ['startnummer', 'name'],
      'page-size': 'A4',
      'font-size': 10,
      'margin-left': '2cm',
      'margin-top': '2cm',
      'margin-right': '2cm',
      'margin-bottom': '2cm',
    }, function(value, key) {
      if (search[key] === undefined)
	search[key] = value;
    });
    angular.extend($scope.anzeige, von_url(search));
  });
  $scope.$emit('$routeUpdate');
}

veranstaltungAuswertungController.resolve = {
  auswertung: function($q, $http, $route) {
    return http_request($q, $http.get('/api/veranstaltung/auswertung',
				      {params: $route.current.params}));
  },
};

