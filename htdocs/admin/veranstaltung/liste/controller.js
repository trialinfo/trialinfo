'use strict;'

function veranstaltungListeController($scope, $sce, $route, $location, $timeout, veranstaltung, fahrerliste) {
  $scope.HAVE_WEASYPRINT = HAVE_WEASYPRINT;
  $scope.$root.kontext(veranstaltung.wertungen[0].titel);

  $scope.veranstaltung = veranstaltung;
  var features = features_aus_liste(veranstaltung);
  $scope.features = features;
  $scope.fold = {};
  $scope.anzeige = { felder: [] };

  var versicherungen = {
    1: 'ADAC-Versicherung',
    2: 'DMV-Versicherung',
    3: 'KFZ-Versicherung',
    4: 'Tagesversicherung'
  };

  var fahrer_nach_startnummer = (function(fahrerliste) {
    var fahrer_nach_startnummer = {};
    angular.forEach(fahrerliste, function(fahrer) {
      fahrer_nach_startnummer[fahrer.startnummer] = fahrer;
    });
    return fahrer_nach_startnummer;
  })(fahrerliste);

  angular.forEach(fahrerliste, function(gruppe) {
    if (gruppe.gruppe) {
      angular.forEach(gruppe.fahrer, function(startnummer) {
	var fahrer = fahrer_nach_startnummer[startnummer];
	if (fahrer) {
	  if (!fahrer.gruppen)
	    fahrer.gruppen = [];
	  fahrer.gruppen.push(gruppe.startnummer);
	}
      });
    }
  });

  function otsv_beitrag(veranstaltung) {
    if (veranstaltung.art === 'otsv2014' || veranstaltung.art === 'otsv+osk2014' || veranstaltung.art === 'otsv2016' || veranstaltung.art === 'otsv+osk2016') {
      var jetzt;
      if (veranstaltung.datum &&
	  (match = veranstaltung.datum.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
	jetzt = new Date(match[1], match[2] - 1, match[3]);
      else
	jetzt = new Date();

      return function(fahrer) {
	geburtsdatum = fahrer.geburtsdatum;
	var jahrgang_alter;
	if (geburtsdatum !== null &&
	    (match = geburtsdatum.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
	  var geburtsjahr = new Date(match[1], 0, 1);
	  jahrgang_alter = new Date();
	  jahrgang_alter.setTime(jetzt - geburtsjahr);
	  jahrgang_alter = jahrgang_alter.getFullYear() - 1970 - 1;
	}
	return jahrgang_alter != null && jahrgang_alter < 18 ?
	  2 : 6;
      };
    } else if (veranstaltung.art === 'otsv-bike2015')
      return function(fahrer) { return 2; };
    else if (veranstaltung.art === 'otsv-ecup2015')
      return function(fahrer) { return 1.5; };
  };

  var abgabe = otsv_beitrag(veranstaltung);
  if (abgabe) {
    features.abgabe = true;
    angular.forEach(fahrerliste, function(fahrer) {
      fahrer.abgabe = abgabe(fahrer);
    });
  }

  angular.forEach(fahrerliste, function(fahrer) {
    var match;
    if (fahrer.geburtsdatum !== null &&
	(match = fahrer.geburtsdatum.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
      fahrer.geburtsdatum = new Date(match[1], match[2] - 1, match[3]);
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

    if (fahrer.gruppe)
      $scope.anzeige.gruppen = true;
    else
      $scope.anzeige.fahrer = true;
  });
  if ($scope.anzeige.fahrer && $scope.anzeige.gruppen)
    $scope.fahrer_gruppen = true;

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

  $scope.gruppenliste = function(gruppen) {
    var liste = [];
    angular.forEach(gruppen, function(startnummer) {
      var gruppe = fahrer_nach_startnummer[startnummer];
      if (gruppe)
	liste.push(gruppe);
    });
    return liste.map(function(gruppe) {
      return join(' ', gruppe.nachname, gruppe.vorname);
    }).sort(function(a, b) { return a.localeCompare(b); }).join(', ');
  }

  $scope.anschrift = function(fahrer) {
    var anschrift = [], plz_wohnort = [];
    if (fahrer.strasse != '' && fahrer.strasse != null)
      anschrift.push(fahrer.strasse);
    if (fahrer.plz != '' && fahrer.plz != null)
      plz_wohnort.push(fahrer.plz);
    if (fahrer.wohnort != '' && fahrer.wohnort != null)
      plz_wohnort.push(fahrer.wohnort);
    if (plz_wohnort.length)
      anschrift.push(plz_wohnort.join(' '));
    return anschrift.join(', ');
  }

  var definierte_felder = {
    startnummer:
      { name: 'Startnummer',
	bezeichnung: '<span title="Startnummer">Nr.</span>',
	ausdruck: "startnummer < 0 ? null : startnummer",
	style: { 'text-align': 'center' },
	when: function() { return features.startnummer; } },
    klasse:
      { name: 'Klasse (in Nennung)',
	bezeichnung: '<span title="Klasse (in Nennung)">Kl.</span>',
	ausdruck: "klasse",
	style: { 'text-align': 'center' },
	when: function() { return features.klasse; } },
    name:
      { name: 'Name',
	bezeichnung: 'Name',
	ausdruck: "join(' ', nachname, vorname)",
	style: { 'text-align': 'left' } },
    geburtsdatum:
      { name: 'Geburtsdatum',
	bezeichnung: 'Geburtsdatum',
	ausdruck: "geburtsdatum | date:'d.M.yyyy'",
	style: { 'text-align': 'center' },
	when: function() { return features.geburtsdatum; } },
    jahrgang:
      { name: 'Jahrgang',
	bezeichnung: 'Jahrgang',
	ausdruck: "geburtsdatum | date:'yyyy'",
	style: { 'text-align': 'center' },
	when: function() { return features.geburtsdatum; } },
    wohnort:
      { name: 'Wohnort',
	bezeichnung: 'Wohnort',
	ausdruck: "wohnort",
	style: { 'text-align': 'left' },
	when: function() { return features.wohnort; } },
    club:
      { name: 'Club',
	bezeichnung: 'Club',
	ausdruck: "club",
	style: { 'text-align': 'left' },
	when: function() { return features.club; } },
    fahrzeug:
      { name: 'Fahrzeug',
	bezeichnung: 'Fahrzeug',
	ausdruck: "fahrzeug",
	style: { 'text-align': 'left' },
	when: function() { return features.fahrzeug; } },
    plz:
      { name: 'Postleitzahl',
        bezeichnung: 'PLZ',
        ausdruck: "plz",
	style: { 'text-align': 'center' },
	when: function() { return features.plz; } },
    land:
      { name: 'Land',
	bezeichnung: 'Land',
	ausdruck: "land",
	style: { 'text-align': 'left' },
	when: function() { return features.land; } },
    anschrift:
      { name: 'Anschrift',
        bezeichnung: 'Anschrift',
	ausdruck: "anschrift(fahrer)",
	style: { 'text-align': 'left' },
	when: function() { return features.strasse || features.plz || features.wohnort } },
    bundesland:
      { name: 'Bundesland',
	bezeichnung: 'Bundesland',
	ausdruck: "bundesland",
	style: { 'text-align': 'left' },
	when: function() { return features.bundesland; } },
    lbl:
      { name: 'Land (Bundesland)',
	bezeichnung: '<span title="Land (Bundesland)">Land</span>',
	ausdruck: "land_bundesland(fahrer)",
	style: { 'text-align': 'left' },
	when: function() { return features.bundesland || features.land; } },
    telefon:
      { name: 'Telefon',
	bezeichnung: 'Telefon',
	ausdruck: "telefon",
	style: { 'text-align': 'left' },
	when: function() { return features.telefon; } },
    email:
      { name: 'E-Mail',
	bezeichnung: 'E-Mail',
	ausdruck: "email",
	style: { 'text-align': 'left' },
	when: function() { return features.email; } },
    startzeit:
      { name: 'Startzeit',
	bezeichnung: 'Startzeit',
	ausdruck: "startzeit | date:'H:mm'",
	style: { 'text-align': 'center' },
	when: function() { return features.startzeit; } },
    zielzeit:
      { name: 'Zielzeit',
	bezeichnung: 'Zielzeit',
	ausdruck: "zielzeit | date:'H:mm'",
	style: { 'text-align': 'center' },
	when: function() { return features.zielzeit; } },
    nennungseingang:
      { name: 'Nennungseingang',
	bezeichnung: 'Nennungseingang',
	ausdruck: "nennungseingang ? 'Ja' : ''",
	style: { 'text-align': 'center' },
	when: function() { return features.nennungseingang; } },
    start:
      { name: 'Start',
	bezeichnung: 'Start',
	ausdruck: "start ? 'Ja' : ''",
	style: { 'text-align': 'center' },
	when: function() { return features.start; } },
    start_morgen:
      { name: 'Start morgen',
	bezeichnung: 'Start morgen',
	ausdruck: "start_morgen ? 'Ja' : ''",
	style: { 'text-align': 'center' },
	when: function() { return features.start_morgen; } },
    ausser_konkurrenz:
      { name: 'Außer Konkurrenz',
        bezeichnung: '<span title="Außer Konkurrenz">A.K.</span>',
	ausdruck: "ausser_konkurrenz ? 'Ja' : ''",
	style: { 'text-align': 'center' } },
    versicherung:
      { name: 'Versicherung',
	bezeichnung: 'Versicherung',
	ausdruck: "versicherung",
	style: { 'text-align': 'left' },
	when: function() { return features.versicherung; } },
    lizenznummer:
      { name: 'Lizenznummer',
	bezeichnung: 'Lizenznr.',
	ausdruck: "lizenznummer",
	style: { 'text-align': 'left' },
	when: function() { return features.lizenznummer; } },
    aktuelle_runde:
      { name: 'Aktuelle Runde',
	bezeichnung: '<span title="Aktuelle Runde">In Runde</span>',
	ausdruck: "(!start || ausfall || runden >= veranstaltung.klassen[veranstaltung.klassen[klasse - 1].wertungsklasse - 1]['runden']) ? null : runden + 1",
	style: { 'text-align': 'center' } },
    gruppen:
      { name: 'Gruppen',
	bezeichnung: 'Gruppen',
	ausdruck: 'gruppenliste(gruppen)',
	style: { 'text-align': 'left' },
	when: function() { return $scope.fahrer_gruppen; } },
    nenngeld:
      { name: 'Nenngeld',
	bezeichnung: 'Nenngeld',
	ausdruck: 'nenngeld',
	style: { 'text-align': 'right' },
	when: function() { return features.nenngeld; },
	aggregieren: function(a, b) { if (a != null || b != null) return Number(a) + Number(b); } },
    abgabe:
      { name: 'ÖTSV-Beitrag',
	bezeichnung: 'ÖTSV-Beitrag',
	ausdruck: 'abgabe',
	style: { 'text-align': 'right' },
	when: function() { return features.abgabe; },
	aggregieren: function(a, b) { if (a != null || b != null) return Number(a) + Number(b); } },
  };
  angular.forEach([1, 2, 3, 4], function(wertung) {
    var bezeichnung = $scope.wertungsbezeichnung(wertung);
    definierte_felder['wertung' + wertung] = {
      name: bezeichnung,
      bezeichnung: bezeichnung,
      ausdruck: "wertungen[" + (wertung - 1) + "] ? 'Ja' : ''",
      style: { 'text-align': 'center' },
      when: function() { return features['wertung' + wertung]; }
    };
  });
  angular.forEach(definierte_felder, function(feld) {
    feld.bezeichnung = $sce.trustAsHtml(feld.bezeichnung);
  });

  $scope.feldliste = (function() {
    var felder = [];
    angular.forEach(definierte_felder, function(feld, name) {
      if (!feld.when || feld.when())
	felder.push(name);
    });
    var feldliste = [];
    angular.forEach(felder, function(feld) {
      feldliste.push({ key: feld, name: definierte_felder[feld].name });
    });
    feldliste = feldliste.sort(function(a, b) { return a.name.localeCompare(b.name); });
    feldliste.unshift({ key: '', name: '' });
    return feldliste;
  })();

  function filter(fahrer) {
    var anzeige = $scope.anzeige;
    if ((fahrer.gruppe && !anzeige.gruppen) ||
	(!fahrer.gruppe && !anzeige.fahrer))
      return false;
    if (anzeige.startnummer !== null &&
	(fahrer.startnummer >= 0) !== anzeige.startnummer)
      return false;
    if (anzeige.nennungseingang !== null &&
	!fahrer.nennungseingang  == anzeige.nennungseingang)
      return false;
    if (anzeige.start !== null &&
	!fahrer.start == anzeige.start)
      return false;
    if (anzeige.start_morgen !== null &&
	!fahrer.start_morgen == anzeige.start_morgen)
      return false;
    for (var wertung = 1; wertung <= 4; wertung++) {
      if (anzeige['wertung' + wertung] !== null &&
	  (fahrer.wertungen[wertung - 1] === true) !==
	  anzeige['wertung' + wertung])
	return false;
    }
    if (anzeige.startnummer_min != null &&
	fahrer.startnummer < anzeige.startnummer_min)
      return false;
    if (anzeige.startnummer_max != null &&
	fahrer.startnummer > anzeige.startnummer_max)
      return false;
    if (anzeige.jahr_min != null &&
	(fahrer.geburtsdatum == null ||
	 fahrer.geburtsdatum.getYear() + 1900 < anzeige.jahr_min))
      return false;
    if (anzeige.jahr_max != null &&
	fahrer.geburtsdatum != null &&
	fahrer.geburtsdatum.getYear() + 1900 > anzeige.jahr_max)
      return false;

    if (anzeige.unterwegs) {
      try {
	var klasse = veranstaltung.klassen[
	  veranstaltung.klassen[fahrer.klasse - 1].wertungsklasse - 1];
	if (!fahrer.start || fahrer.ausfall || fahrer.runden >= klasse.runden || fahrer.gruppe)
	  return false;
      } catch(_) { }
    }
    return anzeige.andere_klassen ?
      anzeige.klassen[fahrer.wertungsklasse] !== false :
      anzeige.klassen[fahrer.wertungsklasse];
  }

  function group_by(fahrerliste, compare) {
    var result = [];
    if (!fahrerliste.length)
      return [];
    var group = [fahrerliste[0]];
    for (var n = 1; n != fahrerliste.length; n++) {
      if (compare(group[0], fahrerliste[n])) {
	result.push({gruppe: group[0], fahrerliste: group});
	group = [];
      }
      group.push(fahrerliste[n]);
    }
    result.push({gruppe: group[0], fahrerliste: group});
    return result;
  }

  function klasse_andere(fahrer) {
    return $scope.anzeige.klassen[fahrer.wertungsklasse] !== undefined ?
      fahrer.wertungsklasse : null;
  }

  var gruppieren_funktionen = {
    wertungsklasse: {
      heading: function(f) {
	function klassenbezeichnung(klasse) {
	  var bezeichnung = veranstaltung.klassen[klasse - 1].bezeichnung;
	  if (bezeichnung == null || bezeichnung == '')
	    bezeichnung = 'Klasse ' + klasse;
	  return bezeichnung;
	}

	return klasse_andere(f) != null ?
	       klassenbezeichnung(f.wertungsklasse) :
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
    },
    abgabe: {
      heading: function(f) {
	return f.abgabe ? 'ÖTSV-Beitrag €' + f.abgabe : 'Keine Abgabe';
      },
      compare: function(f1, f2) {
	return generic_compare(f1.abgabe, f2.abgabe);
      }
    },
    gruppe: {
      heading: function(f) {
	return f ? join(' ', f.nachname, f.vorname) : 'Keine Gruppen';
      },
      group_by: function(fahrerliste) {
	var gruppen = {}, keine_gruppen = [];
	angular.forEach(fahrerliste, function(fahrer) {
	  if (fahrer.gruppen && fahrer.gruppen.length) {
	    angular.forEach(fahrer.gruppen, function(startnummer) {
	      if (!gruppen[startnummer])
		gruppen[startnummer] = [];
	      gruppen[startnummer].push(fahrer);
	    });
	  } else
	    keine_gruppen.push(fahrer);
	});

	var ergebnisliste = [];
	if (keine_gruppen.length)
	  ergebnisliste.push({gruppe: null, fahrerliste: keine_gruppen});
	return ergebnisliste.concat(
	  Object.keys(gruppen).map(function(startnummer) {
	    return {
	      gruppe: fahrer_nach_startnummer[startnummer],
	      fahrerliste: gruppen[startnummer]
	    };
	  }).sort(function(g1, g2) {
	    return generic_compare(g1.gruppe.nachname, g2.gruppe.nachname) ||
		   generic_compare(g1.gruppe.vorname, g2.gruppe.vorname);
	  })
	);
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
      return gruppieren.heading(gruppe);
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
    if (!url.length || !angular.equals($scope.anzeige, von_url(url))) {
      $scope.ignoreRouteUpdate = true;
      $location.search(nach_url($scope.anzeige)).replace();
    }
  }

  function aktualisieren() {
    var gefiltert = fahrerliste.filter(filter);

    $scope.anzahl_fahrer = 0;
    $scope.anzahl_gruppen = 0;
    angular.forEach(gefiltert, function(fahrer) {
      if (fahrer.gruppe)
	$scope.anzahl_gruppen++;
      else
	$scope.anzahl_fahrer++;
    });

    var ergebnisliste = (function(fahrerliste) {
      var gruppieren = gruppieren_funktionen[$scope.anzeige.gruppierung];
      if (gruppieren) {
	if (gruppieren.group_by)
	  return gruppieren.group_by(gefiltert);
	else {
	  var compare = gruppieren.compare;
	  return group_by(gefiltert.sort(compare), compare);
	}
      } else
	return [{gruppe: null, fahrerliste: fahrerliste}];
    })(gefiltert);

    var sortieren = sortieren_funktionen[$scope.anzeige.reihenfolge];
    if (sortieren) {
      angular.forEach(ergebnisliste, function(gruppe) {
	gruppe.fahrerliste = gruppe.fahrerliste.sort(sortieren);
      });
    }
    $scope.ergebnisliste = ergebnisliste;

    var aggregat_berechnen = false;
    angular.forEach($scope.felder, function(feld) {
      if (feld.aggregieren)
	aggregat_berechnen = true;
    });

    $scope.aggregat = [];
    if (aggregat_berechnen) {
      angular.forEach($scope.ergebnisliste, function(gruppe) {
	var liste = [];
	angular.forEach($scope.felder, function(feld) {
	  var agg = null;
	  if (feld.aggregieren)
	    angular.forEach(gruppe.fahrerliste, function(fahrer) {
	      agg = feld.aggregieren(agg, $scope.$eval(feld.ausdruck, fahrer));
	    });
	  liste.push(agg);
	});
	$scope.aggregat.push(liste);
      });
    }

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

  $scope.$watch('anzeige.fahrer_gruppen', function() {
    var fahrer_gruppen = $scope.anzeige.fahrer_gruppen;
    $scope.anzeige.fahrer = fahrer_gruppen != 'gruppen';
    $scope.anzeige.gruppen = fahrer_gruppen != 'fahrer';
    if (!$scope.anzeige.fahrer)
      $scope.anzeige.unterwegs = false;
    angular.forEach(veranstaltung.wertungen, function(wertung, index) {
      if (!$scope.anzeige.fahrer && !wertung.fahrer)
	$scope.anzeige['wertung' + (index + 1)] = null;
      else if (!$scope.anzeige.gruppe && !wertung.gruppe)
	$scope.anzeige['wertung' + (index + 1)] = null;
    });
  });
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
    aktualisieren();
  }, true);

  $scope.$on('$routeUpdate', function() {
    if ($scope.ignoreRouteUpdate) {
      delete $scope.ignoreRouteUpdate;
      return;
    }

    var felder = [];
    angular.forEach(['startnummer', 'name'], function(feld) {
      var when = definierte_felder[feld].when;
      if (!when || when())
	felder.push(feld);
    });

    var search = $location.search();
    angular.forEach({
      start: 'yes',
      gruppierung: 'wertungsklasse',
      reihenfolge: features.startnummer ? 'startnummer' : 'name',
      andere_klassen: 'yes',
      feld: felder,
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
