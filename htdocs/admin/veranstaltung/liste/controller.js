'use strict;'

function veranstaltungListeController($scope, $sce, $route, $location, $timeout, veranstaltung, fahrerliste) {
  $scope.HAVE_WEASYPRINT = HAVE_WEASYPRINT;
  $scope.$root.kontext(veranstaltung.wertungen[0].titel);

  $scope.veranstaltung = veranstaltung;
  $scope.features = features_aus_liste(veranstaltung);
  $scope.fold = {};
  $scope.anzeige = { felder: [] };

  var versicherungen = {
    1: 'ADAC-Versicherung',
    2: 'DMV-Versicherung',
    3: 'KFZ-Versicherung',
    4: 'Tagesversicherung'
  };

  angular.forEach(fahrerliste, function(fahrer) {
    var match;
    if (fahrer.geburtsdatum !== null &&
	(match = fahrer.geburtsdatum.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
      fahrer.geburtsdatum = new Date(match[1], match[2], match[3]);
    if (fahrer.startzeit !== null &&
	(match = fahrer.startzeit.match(/^(\d{2}):(\d{2}):(\d{2})$/)))
      fahrer.startzeit = new Date(0, 0, 0, match[1], match[2], match[3]);
    if (fahrer.zielzeit !== null &&
	(match = fahrer.zielzeit.match(/^(\d{2}):(\d{2}):(\d{2})$/)))
      fahrer.zielzeit = new Date(0, 0, 0, match[1], match[2], match[3]);

    if (fahrer.versicherung !== null && versicherungen[fahrer.versicherung])
      fahrer.versicherung = versicherungen[fahrer.versicherung];

    var wertungen = [];
    angular.forEach(fahrer.wertungen, function(wertung) {
      wertungen[wertung - 1] = true;
    });
    fahrer.wertungen = wertungen;

    if (fahrer.klasse !== null) {
      try {
	var klasse = veranstaltung.klassen[fahrer.klasse - 1];
	fahrer.wertungsklasse = klasse.wertungsklasse;
	if (klasse.keine_wertung1)
	  fahrer.wertungen[0] = false;
      } catch(_) { }
    }
  });

  $scope.land_bundesland = function(fahrer) {
    var land_bundesland = [];
    if (fahrer.land)
      land_bundesland.push(fahrer.land);
    if (fahrer.bundesland)
      land_bundesland.push('(' + fahrer.bundesland + ')');
    return land_bundesland.join(' ');
  };

  $scope.wertungsbezeichnung = function(wertung) {
    var w = veranstaltung.wertungen[wertung - 1];
    return w && w.bezeichnung ? w.bezeichnung : 'Wertung ' + wertung;
  };

  var definierte_felder = {
    startnummer:
      { name: 'Startnummer',
	bezeichnung: '<span title="Startnummer">Nr.</span>',
	ausdruck: "startnummer < 0 ? null : startnummer",
	style: { 'text-align': 'center' },
	feature: true },
    klasse:
      { name: 'Klasse (in Nennung)',
	bezeichnung: '<span title="Klasse (in Nennung)">Kl.</span>',
	ausdruck: "klasse",
	style: { 'text-align': 'center' },
	feature: true },
    name:
      { name: 'Name',
	bezeichnung: 'Name',
	ausdruck: "join(' ', nachname, vorname)",
	style: { 'text-align': 'left' },
	feature: true },
    geburtsdatum:
      { name: 'Geburtsdatum',
	bezeichnung: 'Geburtsdatum',
	ausdruck: "geburtsdatum | date:'d.M.yyyy'",
	style: { 'text-align': 'center' },
	feature: true },
    wohnort:
      { name: 'Wohnort',
	bezeichnung: 'Wohnort',
	ausdruck: "wohnort",
	style: { 'text-align': 'left' },
	feature: true },
    club:
      { name: 'Club',
	bezeichnung: 'Club',
	ausdruck: "club",
	style: { 'text-align': 'left' },
	feature: true },
    fahrzeug:
      { name: 'Fahrzeug',
	bezeichnung: 'Fahrzeug',
	ausdruck: "fahrzeug",
	style: { 'text-align': 'left' },
	feature: true },
    land:
      { name: 'Land',
	bezeichnung: 'Land',
	ausdruck: "land",
	style: { 'text-align': 'left' },
	feature: true },
    bundesland:
      { name: 'Bundesland',
	bezeichnung: 'Bundesland',
	ausdruck: "bundesland",
	style: { 'text-align': 'left' },
	feature: true },
    lbl:
      { name: 'Land (Bundesland)',
	bezeichnung: '<span title="Land (Bundesland)">Land</span>',
	ausdruck: "land_bundesland(fahrer)",
	style: { 'text-align': 'left' },
	feature: true },
    email:
      { name: 'E-Mail',
	bezeichnung: 'E-Mail',
	ausdruck: "email",
	style: { 'text-align': 'left' },
	feature: true },
    startzeit:
      { name: 'Startzeit',
	bezeichnung: 'Startzeit',
	ausdruck: "startzeit | date:'H:mm'",
	style: { 'text-align': 'center' },
	feature: true },
    zielzeit:
      { name: 'Zielzeit',
	bezeichnung: 'Zielzeit',
	ausdruck: "zielzeit | date:'H:mm'",
	style: { 'text-align': 'center' },
	feature: true },
    nennungseingang:
      { name: 'Nennungseingang',
	bezeichnung: 'Nennungseingang',
	ausdruck: "nennungseingang ? 'Ja' : ''",
	style: { 'text-align': 'center' },
	feature: true },
    start:
      { name: 'Start',
	bezeichnung: 'Start',
	ausdruck: "start ? 'Ja' : ''",
	style: { 'text-align': 'center' },
	feature: true },
    start_morgen:
      { name: 'Start morgen',
	bezeichnung: 'Start morgen',
	ausdruck: "start_morgen ? 'Ja' : ''",
	style: { 'text-align': 'center' },
	feature: true },
    versicherung:
      { name: 'Versicherung',
	bezeichnung: 'Versicherung',
	ausdruck: "versicherung",
	style: { 'text-align': 'left' },
	feature: true },
    lizenznummer:
      { name: 'Lizenznummer',
	bezeichnung: 'Lizenznr.',
	ausdruck: "lizenznummer",
	style: { 'text-align': 'left' },
	feature: true },
    aktuelle_runde:
      { name: 'Aktuelle Runde',
	bezeichnung: '<span title="Aktuelle Runde">In Runde</span>',
	ausdruck: "(!start || ausfall || runden >= veranstaltung.klassen[veranstaltung.klassen[klasse - 1].wertungsklasse - 1]['runden']) ? null : runden + 1",
	style: { 'text-align': 'center' } },
  };
  angular.forEach([1, 2, 3, 4], function(wertung) {
    if ($scope.features['wertung' + wertung]) {
      var bezeichnung = $scope.wertungsbezeichnung(wertung);
      definierte_felder['wertung' + wertung] = {
	name: bezeichnung,
	bezeichnung: bezeichnung,
	ausdruck: "wertungen[" + (wertung - 1) + "] ? 'Ja' : ''",
	style: { 'text-align': 'center' }
      };
    }
  });
  angular.forEach(definierte_felder, function(feld) {
    feld.bezeichnung = $sce.trustAsHtml(feld.bezeichnung);
  });

  $scope.feldliste = (function() {
    var felder = [ 'name' ];
    angular.forEach(definierte_felder, function(feld, name) {
      if (!feld.feature || $scope.features[name])
	felder.push(name);
    });
    if ($scope.features.land || $scope.features.bundesland)
      felder.push('lbl');
    var feldliste = [];
    angular.forEach(felder, function(feld) {
      feldliste.push({ key: feld, name: definierte_felder[feld].name });
    });
    feldliste = feldliste.sort(function(a, b) { return a.name.localeCompare(b.name); });
    feldliste.unshift({ key: '', name: '' });
    return feldliste;
  })();

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
  };

  function filter(fahrer) {
    var anzeige = $scope.anzeige;
    if (anzeige.startnummer !== null &&
	(fahrer.startnummer >= 0) !== anzeige.startnummer)
      return false;
    if (anzeige.nennungseingang !== null &&
	fahrer.nennungseingang !== anzeige.nennungseingang)
      return false;
    if (anzeige.start !== null &&
	fahrer.start !== anzeige.start)
      return false;
    if (anzeige.start_morgen !== null &&
	fahrer.start_morgen !== anzeige.start_morgen)
      return false;
    for (var wertung = 1; wertung <= 4; wertung++) {
      if (anzeige['wertung' + wertung] !== null &&
	  (fahrer.wertungen[wertung - 1] === true) !==
	  anzeige['wertung' + wertung])
	return false;
    }
    if (anzeige.min !== null &&
	fahrer.startnummer < anzeige.min)
      return false;
    if (anzeige.max !== null &&
	fahrer.startnummer > anzeige.max)
      return false;
    if (anzeige.unterwegs) {
      try {
	var klasse = veranstaltung.klassen[
	  veranstaltung.klassen[fahrer.klasse - 1].wertungsklasse - 1];
	if (!fahrer.start || fahrer.ausfall || fahrer.runden >= klasse.runden)
	  return false;
      } catch(_) { }
    }
    return anzeige.andere_klassen ?
      anzeige.klassen[fahrer.wertungsklasse] !== false :
      anzeige.klassen[fahrer.wertungsklasse];
  }

  function make_compare(comparators) {
    return function(f1, f2) {
      for (var n = 0; n < comparators.length; n++) {
	var cmp = comparators[n](f1, f2);
	if (cmp)
	  return cmp;
      }
      return 0;
    }
  }

  function group_by(array, comparator) {
    var result = [];
    if (!array.length)
      return [];
    var group = [array[0]];
    for (var n = 1; n != array.length; n++) {
      if (comparator(group[0], array[n])) {
	result.push(group);
	group = [];
      }
	group.push(array[n]);
    }
    result.push(group);
    return result;
  }

  function klasse_andere(fahrer) {
    return $scope.anzeige.klassen[fahrer.wertungsklasse] !== undefined ?
      fahrer.wertungsklasse : null;
  }

  var gruppieren_funktionen = {
    wertungsklasse: {
      heading: function(f) {
	return klasse_andere(f) != null ?
	       veranstaltung.klassen[f.wertungsklasse - 1].bezeichnung :
	       'Andere Klassen';
      },
      compare: function(f1, f2) {
	return generic_compare(klasse_andere(f1), klasse_andere(f2));
      }
    },
    wohnort: {
      heading: function(f) {
	return f.wohnort || 'Wohnort nicht bekannt';
      },
      compare: function(f1, f2) {
	return generic_compare(f1.wohnort, f2.wohnort);
      }
    },
    fahrzeug: {
      heading: function(f) {
	return f.fahrzeug || 'Fahrzeug nicht bekannt';
      },
      compare: function(f1, f2) {
	return generic_compare(f1.fahrzeug, f2.fahrzeug);
      }
    },
    club: {
      heading: function(f) {
	return f.club || 'Kein Club oder Club nicht bekannt';
      },
      compare: function(f1, f2) {
	return generic_compare(f1.club, f2.club);
      }
    },
    versicherung: {
      heading: function(f) {
	return f.versicherung || 'Versicherung nicht bekannt';
      },
      compare: function(f1, f2) {
	return generic_compare(f1.versicherung, f2.versicherung);
      }
    },
    lbl: {
      heading: function(f) {
	var lbl = $scope.land_bundesland(f);
	return lbl === '' ? 'Land / Bundesland nicht bekannt' : lbl;
      },
      compare: function(f1, f2) {
	return generic_compare(f1.land, f2.land) ||
	       generic_compare(f1.bundesland, f2.bundesland);
      }
    }
  };

  var sortieren_funktionen = {
    startnummer: function(f1, f2) {
      return generic_compare(f1.startnummer, f2.startnummer);
    },
    name: function(f1, f2) {
      return generic_compare(f1.nachname, f2.nachname) ||
	     generic_compare(f1.vorname, f2.vorname);
    },
    geburtsdatum: function(f1, f2) {
      return generic_compare(f2.geburtsdatum, f1.geburtsdatum);
    },
    startzeit: function(f1, f2) {
      return generic_compare(f1.startzeit, f2.startzeit);
    },
    zielzeit: function(f1, f2) {
      return generic_compare(f1.zielzeit, f2.zielzeit);
    },
  };

  $scope.gruppe_ueberschrift = function(gruppe) {
    var gruppieren = gruppieren_funktionen[$scope.anzeige.gruppierung];
    if (gruppieren)
      return gruppieren.heading(gruppe[0]);
  };

  var tristate_optionen = (function() {
    var felder = ['startnummer', 'nennungseingang', 'start', 'start_morgen'];
    for (var n = 1; n <= 4; n++)
      felder.push('wertung' + n);
    return felder;
  })();

  function startende_klassen() {
    var klassen = {};
    angular.forEach(veranstaltung.klassen, function(klasse) {
      var wertungsklasse = klasse.wertungsklasse;
      var sektionen = veranstaltung.sektionen[wertungsklasse - 1];
      if (sektionen && sektionen.length)
	klassen[wertungsklasse] = true;
    });
    return klassen;
  }

  function von_url(search) {
    var anzeige = angular.copy(search);

    angular.forEach(tristate_optionen, function(option) {
      if (anzeige[option] === 'yes')
	anzeige[option] = true;
      else if (anzeige[option] === 'no')
	anzeige[option] = false;
      else
	anzeige[option] = null;
    });
    angular.forEach(['min', 'max'], function(option) {
      if (anzeige[option] === undefined)
	anzeige[option] = null;
      else
        anzeige[option] = +anzeige[option];
    });
    var klassen = startende_klassen();
    anzeige.startende_klassen = [];
    angular.forEach(klassen, function(_, klasse) {
      anzeige.startende_klassen.push(+klasse);
    });
    anzeige.startende_klassen =
      anzeige.startende_klassen.sort(function(a, b) { return a - b; });
    angular.forEach(anzeige.klasse, function(klasse) {
      if (klassen[klasse] !== undefined)
	klassen[klasse] = false;
    });
    anzeige.klassen = klassen;

    delete anzeige.klasse;
    anzeige.andere_klassen = anzeige.andere_klassen == 'yes';

    var felder = anzeige.feld || [];
    if (typeof felder === 'string')
      felder = [felder];
    if (felder.length == 0 || felder[felder.length - 1] !== '')
      felder.push('');
    anzeige.felder = felder;
    delete anzeige.feld;

    if (anzeige['font-size'] !== undefined)
      anzeige['font-size'] = +anzeige['font-size'];
    anzeige.seitenumbruch = !!anzeige.seitenumbruch;

    return anzeige;
  }

  function nach_url(anzeige) {
    var search = angular.copy(anzeige);

    angular.forEach(tristate_optionen, function(option) {
      if (search[option] === null)
	search[option] = '-'
      else
	search[option] = search[option] ? 'yes' : 'no';
    });

    var versteckte_klassen = [];
    angular.forEach(search.klassen, function(value, key) {
      if (value === false)
	versteckte_klassen.push(key);
    });
    if (versteckte_klassen.length)
      search.klasse = versteckte_klassen;
    delete search.klassen;
    search.andere_klassen = search.andere_klassen ? 'yes' : 'no';

    var felder = search.felder;
    if (felder[felder.length - 1] === '')
      felder.pop();
    search.feld = felder;
    delete search.felder;

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

  function aktualisieren() {
    var ergebnisliste = [];
    angular.forEach(fahrerliste, function(fahrer) {
      if (filter(fahrer))
	ergebnisliste.push(fahrer);
    });
    $scope.gesamt = ergebnisliste.length;
    var gruppieren = gruppieren_funktionen[$scope.anzeige.gruppierung];
    var sortieren = sortieren_funktionen[$scope.anzeige.reihenfolge];
    comparators = [];
    if (gruppieren)
      comparators.push(gruppieren.compare);
    if (sortieren)
      comparators.push(sortieren);
    ergebnisliste = ergebnisliste.sort(make_compare(comparators));
    $scope.ergebnisliste = gruppieren ?
      group_by(ergebnisliste, gruppieren.compare) :
      [ergebnisliste];
    url_aktualisieren();
  };

  $scope.nur_wenn_positiv = function(x) {
    if (x > 0)
      return x;
  };

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

  $scope.einstellungen = function(event) {
    event.preventDefault();
    event.target.blur();
    $scope.fold.einstellungen = !$scope.fold.einstellungen;
  }

  $scope.$watch('anzeige.start', function() {
    if (!$scope.anzeige.start)
      $scope.anzeige.unterwegs = false;
  });
  $scope.$watch('anzeige.unterwegs', function() {
    if ($scope.anzeige.unterwegs) {
      $scope.anzeige.start = true;
      var aktuelle_runde;
      angular.forEach($scope.anzeige.felder, function(feld) {
	if (feld === 'aktuelle_runde')
	  aktuelle_runde = true;
      });
      if (!aktuelle_runde)
	$scope.anzeige.felder.push('aktuelle_runde');
    }
  });
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

  $scope.$on('$routeUpdate', function() {
    var search = $location.search();
    angular.forEach({
      start: 'yes',
      gruppierung: 'wertungsklasse',
      reihenfolge: 'startnummer',
      andere_klassen: 'yes',
      feld: ['startnummer', 'name'],
      'page-size': 'A4',
      'font-size': 8,
      'margin-left': '1cm',
      'margin-top': '4cm',
      'margin-right': '1cm',
      'margin-bottom': '1cm',
    }, function(value, key) {
      if (search[key] === undefined)
	search[key] = value;
    });
    angular.extend($scope.anzeige, von_url(search));
  });
  $scope.$emit('$routeUpdate');
}

veranstaltungListeController.resolve = {
  veranstaltung: function($q, $http, $route) {
    return http_request($q, $http.get('/api/veranstaltung',
				      {params: $route.current.params}));
  },
  fahrerliste: function($q, $http, $route) {
    return http_request($q, $http.get('/api/veranstaltung/liste',
				      {params: $route.current.params}));
  },
};
