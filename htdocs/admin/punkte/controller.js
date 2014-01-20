'use strict;'

function punkteController($scope, $sce, $http, $timeout, $route, $location, veranstaltung) {
  $scope.$root.kontext(veranstaltung.wertungen[0].titel);

  $scope.veranstaltung = veranstaltung;
  $scope.features = features_aus_liste(veranstaltung);
  $scope.startende_klassen = startende_klassen(veranstaltung);

  $scope.sektion_aus_wertung = function (veranstaltung) {
    var s = [];
    angular.forEach(veranstaltung.sektionen_aus_wertung, function(sektionen, index) {
      var klasse = index + 1;
      if (sektionen) {
	s[klasse - 1] = [];
	angular.forEach(sektionen, function(sektionen, index) {
	  var runde = index + 1;
	  if (sektionen) {
	    s[klasse - 1][runde - 1] = [];
	    angular.forEach(sektionen, function(sektion) {
	      s[klasse - 1][runde - 1][sektion - 1] = true;
	    });
	  }
	});
      }
    });
    return s;
  }(veranstaltung);

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
    } catch(_) {}
  };

  function url_aktualisieren() {
    var startnummer;
    if ($scope.fahrer)
      startnummer = $scope.fahrer.startnummer;
    if ($location.search().startnummer !== startnummer) {
      var search = {};
      if (startnummer)
	search.startnummer = startnummer;
      $location.search(search).replace();
    }
  }

  function fahrer_zuweisen(fahrer) {
    if ($scope.form)
      $scope.form.$setPristine();
    if (fahrer) {
      punkte_pro_sektion_auffuellen(fahrer);
      $scope.fahrer = fahrer;
      punkte_berechnen();
      $scope.klasse = $scope.fahrer.klasse;
    } else
      $scope.fahrer = undefined;
    $scope.fahrer_alt = angular.copy($scope.fahrer);
    $scope.suchbegriff = '';
    delete $scope.fahrerliste;

    url_aktualisieren();
  }

  function punkte_fokusieren() {
    try {
      var fahrer = $scope.fahrer;
      if (fahrer.papierabnahme &&
	  (fahrer.ausfall == 0 || fahrer.ausfall == 4)) {  /* 4 == Aus der Wertung */
	var sektionen = veranstaltung.sektionen[fahrer.klasse - 1];
	var punkte_pro_sektion = fahrer.punkte_pro_sektion;
	for (var runde = fahrer.runden || 1; runde <= (fahrer.runden || 0) + 1; runde++) {
	  for (var index = 0; index < sektionen.length; index++) {
	    var sektion = sektionen[index];
	    var punkte = punkte_pro_sektion[runde - 1][sektion - 1];
	    if ((punkte === undefined || punkte === null) &&
		sektion_in_wertung(fahrer.klasse, runde, sektion)) {
	      set_focus('#punkte_' + runde + '_' + sektion, $timeout);
	      return;
	    }
	  }
	}
      }
    } catch (_) {};
  }

  $scope.fahrer_laden = function(startnummer, richtung) {
    fahrer_laden($http, veranstaltung.id, startnummer, richtung,
		 richtung ? 'starter' : undefined).
      success(function(fahrer) {
	if (Object.keys(fahrer).length) {
	  fahrer_zuweisen(fahrer);
	  punkte_fokusieren();
	}
      }).
      error(netzwerkfehler);
  };

  $scope.fahrer_suchen = function() {
    if ($scope.suchbegriff != '') {
      fahrer_suchen($http, veranstaltung.id, $scope.suchbegriff).
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

  $scope.aktuelle_runde = function(fahrer) {
    if (fahrer && fahrer.papierabnahme) {
      var runde = fahrer.runden || 1;
      var sektionen = veranstaltung.sektionen[fahrer.klasse - 1];
      for (var index = 0; index < sektionen.length; index++) {
	var sektion = sektionen[index];
	var punkte = fahrer.punkte_pro_sektion[runde - 1][sektion - 1];
	if ((punkte === null || punkte === undefined) &&
	    sektion_in_wertung(fahrer.klasse, runde, sektion))
	  return runde;
      }
      if (runde < veranstaltung.klassen[fahrer.klasse - 1].runden)
	return runde + 1;
    }
  }

  $scope.rundenfarbe = function() {
    var fahrer = $scope.fahrer;
    if ($scope.fahrer_startet() && (fahrer.ausfall == 0 || fahrer.ausfall == 4)) {  /* 4 == Aus der Wertung */
      var runde = $scope.aktuelle_runde(fahrer);
      if (runde)
	return veranstaltung.kartenfarben[runde - 1];
    }
  };

  $scope.geaendert = function() {
    return !angular.equals($scope.fahrer_alt, $scope.fahrer);
  };

  function sektion_in_wertung(klasse, runde, sektion) {
    var aus_wertung = $scope.sektion_aus_wertung;
    aus_wertung = aus_wertung[klasse - 1];
    if (!aus_wertung)
      return true;
    aus_wertung = aus_wertung[runde - 1];
    if (!aus_wertung)
      return true;
    return !aus_wertung[sektion - 1];
  }

  function punkte_berechnen() {
    var fahrer = $scope.fahrer;
    if (fahrer) {
      fahrer.punkte_pro_runde = [];
      if (fahrer.papierabnahme) {
	var sektionen = veranstaltung.sektionen[fahrer.klasse - 1];
	fahrer.punkte = fahrer.zusatzpunkte;
	fahrer.runden = 0;
	fahrer.punkteverteilung = [0, 0, 0, 0, 0, 0];
	delete $scope.sektionen_ausgelassen;
	var sektion_ausgelassen = false;
	var runde;
	for (runde = 1; runde <= fahrer.punkte_pro_sektion.length; runde++) {
	  var punkte_in_runde = 0;
	  var runde_befahren = false;
	  for (var index = 0; index < sektionen.length; index++) {
	    var sektion = sektionen[index];
	    if (sektion_in_wertung(fahrer.klasse, runde, sektion)) {
	      var punkte = fahrer.punkte_pro_sektion[runde - 1][sektion - 1];
	      if (punkte === null || punkte === undefined)
		sektion_ausgelassen = true;
	      else if (!sektion_ausgelassen) {
		if (punkte == -1)
		  punkte_in_runde += veranstaltung.punkte_sektion_auslassen;
		else {
		  punkte_in_runde += punkte;
		  fahrer.punkteverteilung[punkte]++;
		}
		runde_befahren = true;
	      } else
		$scope.sektionen_ausgelassen = true;
	    }
	  }
	  if (runde_befahren) {
	    fahrer.punkte_pro_runde[runde - 1] = punkte_in_runde;
	    fahrer.punkte += punkte_in_runde;
	    fahrer.runden = runde;
	  }
	}
      } else {
	fahrer.punkte = null;
	fahrer.runden = null;
	fahrer.punkteverteilung = [null, null, null, null, null, null];
      }
    }
  }

  $scope.$watch('fahrer.punkte_pro_sektion', function() {
    punkte_berechnen();
  }, true);
  $scope.$watch('fahrer.zusatzpunkte', function() {
    punkte_berechnen();
  });

  $scope.speichern = function() {
    /* FIXME: Wenn Papierabnahme, dann muss die Klasse starten. */
    var version = 0;
    var startnummer;
    if ($scope.fahrer_alt && 'startnummer' in $scope.fahrer_alt) {
      startnummer = $scope.fahrer_alt.startnummer;
      version = $scope.fahrer_alt.version;
    }
    fahrer_speichern($http, veranstaltung.id, startnummer, version, $scope.fahrer).
      success(function(fahrer) {
	fahrer_zuweisen(fahrer);
	set_focus('#suchbegriff', $timeout);
      }).
      error(netzwerkfehler);
  };

  $scope.verwerfen = function() {
    /* FIXME: Wenn Fahrer geladen, neu laden um Versionskonflikte aufzulösen. */
    fahrer_zuweisen($scope.fahrer_alt);
  };

  $scope.rundenliste = function(klasse) {
    try {
      var rundenliste = [];
      if ($scope.startende_klassen[klasse - 1]) {
	var runden = veranstaltung.klassen[klasse - 1].runden;
	for (var n = 1; n <= runden; n++)
	  rundenliste.push(n);
	return rundenliste;
      }
    } catch (_) { }
  };

  $scope.klassensymbol = function() {
    var farbe = veranstaltung.klassen[$scope.fahrer.klasse - 1].farbe;
    if (farbe) {
      return $sce.trustAsHtml(
	'<span style="position: absolute; z-index: 1">◻</span>' +
	'<span style="color:' + farbe + '">◼</span>');
    }
  };

  $scope.fahrer_name = fahrer_name;
  $scope.fahrer_infos = fahrer_infos;

  $scope.punkte_tab_to = function(runde, index) {
    var fahrer = $scope.fahrer;
    if (fahrer) {
      var sektionen = veranstaltung.sektionen[fahrer.klasse - 1];
      while (++index < sektionen.length) {
	if (sektion_in_wertung(fahrer.klasse, runde, sektionen[index]))
	  return 'punkte_' + runde + '_' + sektionen[index];
      }
    }
  };

  $scope.ueberzeit = function() {
    try {
      var fahrer = $scope.fahrer;
      var gesamt = veranstaltung.klassen[fahrer.klasse - 1].fahrzeit;
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

  $scope.$on('$routeUpdate', function() {
    var startnummer = $location.search().startnummer;
    var aktuelle_startnummer;
    if ($scope.fahrer)
      aktuelle_startnummer = $scope.fahrer.startnummer;
    if (aktuelle_startnummer !== startnummer) {
      if (startnummer !== undefined)
	$scope.fahrer_laden(startnummer);
      else
	fahrer_zuweisen(undefined);
    }
  });
  $scope.$emit('$routeUpdate');
}

punkteController.resolve = {
  veranstaltung: function($q, $http, $route) {
    return http_request($q, $http.get('/api/veranstaltung',
				      {params: $route.current.params}));
  },
};
