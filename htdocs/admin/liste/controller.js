'use strict;'

function listeController($scope, veranstaltung, fahrerliste) {
  $scope.veranstaltung = veranstaltung;
  $scope.features = features_aus_liste(veranstaltung);

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
  });

  $scope.land_bundesland = function(fahrer) {
    var land_bundesland = [];
    if (fahrer.land)
      land_bundesland.push(fahrer.land);
    if (fahrer.bundesland)
      land_bundesland.push('(' + fahrer.bundesland + ')');
    return land_bundesland.join(' ');
  }

  var definierte_felder = {
    startnummer: 
      { bezeichnung: 'Nr.',
	ausdruck: "startnummer < 0 ? null : startnummer",
	style: { 'text-align': 'center' } },
    klasse:
      { bezeichnung: 'Kl.',
	ausdruck: "klasse",
	style: { 'text-align': 'center' } },
    name:
      { bezeichnung: 'Name',
	ausdruck: "nachname + ' ' + vorname",
	style: { 'text-align': 'left' } },
    geburtsdatum:
      { bezeichnung: 'Geburtsdatum',
	ausdruck: "geburtsdatum | date:'d.M.yyyy'",
	style: { 'text-align': 'center' } },
    wohnort:
      { bezeichnung: 'Wohnort',
	ausdruck: "wohnort",
	style: { 'text-align': 'left' } },
    club:
      { bezeichnung: 'Club',
	ausdruck: "club",
	style: { 'text-align': 'left' } },
    fahrzeug:
      { bezeichnung: 'Fahrzeug',
	ausdruck: "fahrzeug",
	style: { 'text-align': 'left' } },
    lbl:
      { bezeichnung: 'Land',
	ausdruck: "land_bundesland(fahrer)",
	style: { 'text-align': 'left' } },
    startzeit:
      { bezeichnung: 'Startzeit',
	ausdruck: "startzeit | date:'H:mm'",
	style: { 'text-align': 'center' } },
    zielzeit:
      { bezeichnung: 'Zielzeit',
	ausdruck: "zielzeit | date:'H:mm'",
	style: { 'text-align': 'center' } },
    nennungseingang:
      { bezeichnung: 'Nennungseingang',
	ausdruck: "nennungseingang ? 'Ja' : ''",
	style: { 'text-align': 'center' } },
    papierabnahme:
      { bezeichnung: 'Papierabnahme',
	ausdruck: "papierabnahme ? 'Ja' : ''",
	style: { 'text-align': 'center' } },
    papierabnahme_morgen:
      { bezeichnung: 'Papierabnahme morgen',
	ausdruck: "papierabnahme_morgen ? 'Ja' : ''",
	style: { 'text-align': 'center' } },
    versicherung:
      { bezeichnung: 'Versicherung',
	ausdruck: "versicherung",
	style: { 'text-align': 'left' } },
    lizenznummer:
      { bezeichnung: 'Lizenznr.',
	ausdruck: "lizenznummer",
	style: { 'text-align': 'left' } },
  };

  function generic_compare(v1, v2) {
    var t1 = typeof v1;
    var t2 = typeof v2;
    if (t1 == t2) {
      if (v1 === v2)
	return 0;
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
    if (anzeige.papierabnahme !== null &&
	fahrer.papierabnahme !== anzeige.papierabnahme)
      return false;
    for (var wertung = 1; wertung <= 4; wertung++) {
      if (anzeige['wertung' + wertung] !== null &&
	  (fahrer.wertungen[wertung - 1] === true) !==
	  anzeige['wertung' + wertung])
	return false;
    }
    if (anzeige.startnummer_min !== null &&
	fahrer.startnummer < anzeige.startnummer_min)
      return false;
    if (anzeige.startnummer_max !== null &&
	fahrer.startnummer > anzeige.startnummer_max)
      return false;
    return anzeige.klassen[fahrer.klasse === null ? '' : fahrer.klasse];
  }

  function klasse_compare(f1, f2) {
    return generic_compare(f1.klasse, f2.klasse);
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

  var gruppieren_funktionen = {
    klasse: {
      heading: function(f) {
	return f.klasse > 0 ?
	       veranstaltung.klassen[f.klasse - 1].bezeichnung :
	       'Keiner Klasse zugeordnet'
      },
      compare: function(f1, f2) {
	return generic_compare(f1.klasse, f2.klasse);
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

  function aktualisieren() {
    var ergebnisliste = [];
    angular.forEach(fahrerliste, function(fahrer) {
      if (filter(fahrer))
	ergebnisliste.push(fahrer);
    });
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
  };

  $scope.nur_wenn_positiv = function(x) {
    if (x > 0)
      return x;
  };

  $scope.anzeige = {
    startnummer: true,
    nennungseingang: null,
    papierabnahme: true,
    wertung1: null,
    wertung2: null,
    wertung3: null,
    wertung4: null,
    gruppierung: 'klasse',
    reihenfolge: 'startnummer',
    klassen: function() {
      var klassen = { '': true };
      angular.forEach(veranstaltung.sektionen, function(sektionen, index) {
	if (sektionen && sektionen.length)
	  klassen[index + 1] = true;
      });
      return klassen;
    }(),
    felder: [
      'startnummer',
      'klasse',
      'name',
    ]
  };
  $scope.felder = [];

  $scope.$watch('anzeige.startnummer', function() {
    if ($scope.anzeige.startnummer !== true) {
      $scope.anzeige.nennungseingang = null;
      $scope.anzeige.papierabnahme = null;
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
}

listeController.resolve = {
  veranstaltung: function($q, $http, $route) {
    return http_request($q, $http.get('/api/veranstaltung',
				      {params: $route.current.params}));
  },
  fahrerliste: function($q, $http, $route) {
    return http_request($q, $http.get('/api/fahrerliste',
				      {params: $route.current.params}));
  },
};
