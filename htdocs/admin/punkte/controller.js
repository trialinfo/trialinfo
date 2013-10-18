'use strict;'

function punkteController($scope, $routeParams, $http, $timeout) {
  $scope.fahrer_startet = function() {
    try {
      var fahrer = $scope.fahrer;
      return fahrer.papierabnahme &&
	     $scope.startende_klassen[fahrer.klasse - 1];
    } catch (_) {}
  };

  // Einzelpunkte auffüllen, sonst funktioniert der Vergleich zwischen
  // fahrer_alt und fahrer nicht.
  function punkte_pro_sektion_auffuellen(fahrer) {
    try {
      var punkte_pro_sektion = fahrer.punkte_pro_sektion;
      var veranstaltung = $scope.veranstaltung;
      var runden = veranstaltung.klassen[fahrer.klasse - 1].runden;
      for (var n = 0; n < runden; n++) {
	if (punkte_pro_sektion[n] === undefined)
	  punkte_pro_sektion[n] = [];
	angular.forEach(veranstaltung.sektionen[fahrer.klasse - 1],
	  function(sektion) {
	    if (punkte_pro_sektion[n][sektion - 1] === undefined)
	      punkte_pro_sektion[n][sektion - 1] = null;
	  });
      }
      return fahrer;
    } catch(_) {}
  };

  function fahrer_zuweisen(fahrer) {
    if (!fahrer)
      fahrer = $scope.fahrer_alt;
    $scope.fahrer = punkte_pro_sektion_auffuellen(fahrer);
    $scope.klasse = fahrer.klasse;
    $scope.fahrer_alt = angular.copy($scope.fahrer);
    $scope.suchbegriff = '';
    delete $scope.fahrerliste;
  }

  function punkte_fokusieren() {
    var fahrer = $scope.fahrer;
    if (fahrer && fahrer.papierabnahme &&
	(fahrer.ausfall == 0 || fahrer.ausfall == 4)) {  /* 4 == Aus der Wertung */
      var sektionen = $scope.veranstaltung.sektionen[fahrer.klasse - 1];
      var punkte_pro_sektion = fahrer.punkte_pro_sektion;
      try {
	angular.forEach(fahrer.punkte_pro_sektion, function(punkte_in_runde, $index) {
	  angular.forEach(sektionen, function(sektion) {
	    var punkte = punkte_in_runde[sektion - 1];
	    if (punkte === undefined || punkte === null) {
	      /* FIXME: Nur, wenn die Sektion nicht aus der Wertung genommen wurde! */
	      set_focus('#punkte_' + ($index + 1) + '_' + sektion, $timeout);
	      throw false;
	    }
	  });
	});
      } catch (_) {}
    }
  }

  function netzwerkfehler(data, status) {
    if (status == 500)
      $scope.fehler = 'Interner Serverfehler.';
    else
      $scope.fehler = data.error;
  }

  $scope.fahrer_laden = function(startnummer, richtung) {
    fahrer_laden($http, $routeParams.id, startnummer, richtung,
		 richtung ? 'starter' : undefined).
      success(function(fahrer) {
	fahrer_zuweisen(Object.keys(fahrer).length ? fahrer : undefined);
	punkte_fokusieren();
      }).
      error(netzwerkfehler);
  };

  $scope.suchbegriff_geaendert = function() {
    delete $scope.fahrerliste;
  }

  $scope.fahrer_suchen = function() {
    if ($scope.suchbegriff != '') {
      fahrer_suchen($http, $routeParams.id, $scope.suchbegriff).
	success(function(fahrerliste) {
	  fahrerliste = fahrerliste.filter(function(fahrer) {
	    return fahrer.startnummer !== null && fahrer.klasse !== null;
	  });
	  if (fahrerliste.length == 1)
	    $scope.fahrer_laden(fahrerliste[0].startnummer);
	  else
	    $scope.fahrerliste = fahrerliste;
	}).
	error(netzwerkfehler);
    } else {
      delete $scope.fahrerliste;
    }
  };
  $scope.suchbegriff = '';
  $scope.$watch('suchbegriff', 'fahrer_suchen()');

  function runden_zaehlen() {
    var veranstaltung = $scope.veranstaltung;
    var fahrer = $scope.fahrer;
    var sektionen = veranstaltung.sektionen[fahrer.klasse - 1];
    var punkte_pro_sektion = fahrer.punkte_pro_sektion;
    for (var runden = 0; runden < punkte_pro_sektion.length; runden++) {
      var runde_voll = true;
      angular.forEach(sektionen, function(sektion) {
	var punkte = punkte_pro_sektion[runden][sektion - 1];
	if (punkte === null || punkte === undefined) {
	  // FIXME: Hier müsste berücksichtigt werden wenn Sektionen aus der
	  // Wertung genommen wurden; das Trialtool führt das aber nicht mit
	  // sondern löscht stattdessen die Punkte aller Fahrer in der Sektion!
	  runde_voll = false;
	}
      });
      if (!runde_voll)
	break;
    }
    return runden;
  }

  $scope.rundenfarbe = function() {
    try {
      var veranstaltung = $scope.veranstaltung;
      var fahrer = $scope.fahrer;
      if ($scope.fahrer_startet() && (fahrer.ausfall == 0 || fahrer.ausfall == 4)) {  /* 4 == Aus der Wertung */
	var runden = fahrer.runden /* FIXME: runden_zaehlen() */ + 1;
	if (runden <= veranstaltung.klassen[fahrer.klasse - 1].runden) {
	  var farbe = veranstaltung.kartenfarben[runden - 1];
	  if (farbe !== 'white' && farbe !== '#000000')
	    return farbe;
	  }
      }
    } catch (_) { }
  };

  $scope.geaendert = function() {
    return !angular.equals($scope.fahrer_alt, $scope.fahrer);
  };

  $scope.punkte_berechnen = function() {
    try {
      var fahrer = $scope.fahrer;
      if (fahrer.papierabnahme) {
	var punkte_summe = fahrer.zusatzpunkte;
	var punkte_pro_runde = [];
	var punkte_verteilung = [0, 0, 0, 0, $scope.veranstaltung.vierpunktewertung ? 0 : null, 0];
	angular.forEach(fahrer.punkte_pro_sektion, function(punkte_in_runde, runde) {
	  var summe_sinnvoll = true;
	  punkte_pro_runde[runde] = null;
	  angular.forEach(punkte_in_runde, function(punkte) {
	    if (punkte === null)
	      summe_sinnvoll = false;  /* FIXME: Nur wenn Sektion nich aus der Wertung genommen wurde! */
	    else {
	      punkte_summe += punkte;
	      punkte_pro_runde[runde] = (punkte_pro_runde[runde] || 0) + punkte;
	      if (punkte <= 5)
		punkte_verteilung[punkte] = (punkte_verteilung[punkte] || 0) + 1;
	    }
	  });
	  if (!summe_sinnvoll)
	    punkte_pro_runde[runde] = null;
	});
	$scope.punkte_pro_runde = punkte_pro_runde;
	$scope.punkte_verteilung = punkte_verteilung;
	fahrer.punkte = punkte_summe;
      } else {
	delete $scope.punkte_pro_runde;
	delete $scope.punkte_verteilung;
	if (fahrer.punkte != undefined)
	  fahrer.punkte = null;
      }
    } catch (_) { }
  };
  $scope.$watch('fahrer.punkte_pro_sektion', 'punkte_berechnen()', true);
  $scope.$watch('fahrer.zusatzpunkte', 'punkte_berechnen()');

  $scope.speichern = function() {
    /* FIXME: Wenn Papierabnahme, dann muss die Klasse starten. */
    /* FIXME: Punkte gleich mitspeichern ... */
    var version = 0;
    var startnummer;
    if ($scope.fahrer_alt && 'startnummer' in $scope.fahrer_alt) {
      startnummer = $scope.fahrer_alt.startnummer;
      version = $scope.fahrer_alt.version;
    }
    fahrer_speichern($http, $routeParams.id, startnummer, version, $scope.fahrer).
      success(function(fahrer) {
	fahrer_zuweisen(fahrer);
	set_focus('#suchbegriff', $timeout);
      }).
      error(function (data, status) {
	if (status === 409)
	  $scope.fehler = 'Veränderung der Daten am Server festgestellt.';
	else
	  netzwerkfehler(data, status);
      });
  };

  $scope.verwerfen = function() {
    /* FIXME: Wenn Fahrer geladen, neu laden um Versionskonflikte aufzulösen. */
    fahrer_zuweisen(undefined);
  };

  $scope.rundenliste = function(klasse) {
    try {
      var rundenliste = [];
      if ($scope.startende_klassen[klasse - 1]) {
	var runden = $scope.veranstaltung.klassen[klasse - 1].runden;
	for (var n = 1; n <= runden; n++)
	  rundenliste.push(n);
	return rundenliste;
      }
    } catch (_) { }
  };

  $scope.klassensymbol = function() {
    var farbe = $scope.veranstaltung.klassen[$scope.fahrer.klasse - 1].farbe;
    if (farbe) {
      return '<span style="position: absolute; z-index: 1">◻</span>' +
	     '<span style="color:' + farbe + '">◼</span>';
    }
  };

  $scope.fahrer_name = fahrer_name;
  $scope.fahrer_infos = fahrer_infos;

  $scope.punkte_gueltig = function(punkte) {
    if (punkte === undefined || punkte === null)
      return true;
    var vierpunktewertung = $scope.veranstaltung.vierpunktewertung;
    return punkte >= 0 && punkte <= 5 &&
	   (vierpunktewertung || punkte != 4);
  };

  $scope.tab_weiter = function(runde, index) {
    var sektionen = $scope.veranstaltung.sektionen[$scope.klasse - 1];
    if (index + 1 < sektionen.length)
      return 'punkte_' + runde + '_' + sektionen[index + 1];
  };

  $scope.ueberzeit = function() {
    try {
      var fahrer = $scope.fahrer;
      var gesamt = $scope.veranstaltung.klassen[fahrer.klasse - 1].fahrzeit;
      if (fahrer.startzeit && fahrer.zielzeit && gesamt) {
	var startzeit = fahrer.startzeit.match(/^(\d\d):(\d\d):(\d\d)$/);
	startzeit = (+startzeit[1] * 60 + +startzeit[2]) * 60 + +startzeit[3];
	var zielzeit = fahrer.zielzeit.match(/^(\d\d):(\d\d):(\d\d)$/);
	zielzeit = (+zielzeit[1] * 60 + +zielzeit[2]) * 60 + +zielzeit[3];
	gesamt = gesamt.match(/^(\d\d):(\d\d):(\d\d)$/);
	gesamt = (+gesamt[1] * 60 + +gesamt[2]) * 60 + +gesamt[3];
	var fahrzeit = zielzeit - startzeit;
	if (fahrzeit < 0)
	  fahrzeit += 24 * 60 * 60;
	fahrzeit -= gesamt;
	if (fahrzeit > 0)
	  return '+' +
	    ('0' + Math.floor(fahrzeit / (60 * 60))).slice(-2) + ':' +
	    ('0' + Math.floor((fahrzeit / 60) % 60)).slice(-2);
      }
    } catch (_) {}
  };

  $scope.keydown = function(event) {
    if (event.which == 13) {
      $timeout(function() {
	if ($scope.geaendert() && $scope.form.$valid)
	  $scope.speichern();
      });
    } else if (event.which == 27) {
      $timeout(function() {
	if ($scope.geaendert())
	  $scope.verwerfen();
      });
    }
  };

  beim_verlassen_warnen($scope, $scope.geaendert);

  veranstaltung_laden($scope, $http, $routeParams.id).
    success(function(veranstaltung) {
      $scope.startende_klassen = startende_klassen(veranstaltung);

      /* Um die Maske sinnvoll darstellen zu können, Felder für die befahrenen
       * Sektionen und Runden der ersten definierten Klasse anzeigen.  Das
       * stimmt zumindest bei allen Veranstaltungen, bei denen alle Klassen
       * die selben Sektionen und Runden befahren.  */
      for (var klasse = 1; klasse < veranstaltung.sektionen.length + 1; klasse++) {
	if (veranstaltung.sektionen[klasse - 1]) {
	  $scope.klasse = klasse;
	  break;
	}
      }
    }).
    error(netzwerkfehler);
}
