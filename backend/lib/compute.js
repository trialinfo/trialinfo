/*
 * Copyright 2017  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License
 * for more details.
 *
 * You can find a copy of the GNU Affero General Public License at
 * <http://www.gnu.org/licenses/>.
 */

'use strict';

function compute(riders, event) {
  function rider_starts(rider) {
    return rider.verified &&
	   (rider.registered || !event.features.registered) &&
	   rider.start;
  }

  function compute_active_zones() {
    let active_zones = {};

    Object.values(riders).forEach((rider) => {
      if (rider.ranking_class && rider_starts(rider)) {
	let marks_per_zone = rider.marks_per_zone;
	for (round = 1; round <= marks_per_zone.length; round++) {
	  let marks_in_round =
	    rider.marks_per_zone[rider.ranking_class - 1] || [];
	  marks_in_round.forEach((marks, index) => {
	    if (marks != null) {
	      if (!active_zones[rider.ranking_class])
		active_zones[rider.ranking_class] = {};
	      if (!active_zones[rider.ranking_class][round])
		active_zones[rider.ranking_class][round] = {};
	      active_zones[rider.ranking_class][round][index + 1] = true;
	    }
	  });
	}
      }
    });
  }

  function compute_ranking_class() {
    Object.values(riders).forEach((rider) => {
      if (!rider.group) {
	let class_ = rider['class'];
	if (class_ != null)
	  rider.ranking_class = event.classes[class_ - 1].ranking_class;
      }
    });
  }

  function compute_rider_marks() {
    let marks_skipped_zone = event.marks_skipped_zone || 0;
    let trialtool_compatible = !event.features.skipped_zones;
    let active_zones;

    /* Das Trialtool erlaubt es, Sektionen in der Punkte-Eingabemaske
       auszulassen.  Die ausgelassenen Sektionen sind danach "leer" (in den
       Trialtool-Dateien wird der Wert 6 verwendet; in der Datenbank verwenden
       wir NULL).  Für die Punkteanzahl des Fahrers zählen diese Sektionen wie
       ein 0er, was zu einer falschen Bewertung führt.

       Derselbe Wert wird auch für Sektionen verwendet, die  aus der Wertung
       genommen werden.  In diesem Fall soll die Sektion ignoriert werden.

       Um diese Situation besser zu behandeln, überprüfen wir wenn wir eine
       "leere" Sektion finden, ob die Sektion für alle anderen Fahrer auch
       "leer" ist.  Das ist dann der Fall, wenn die Sektion noch nicht befahren
       oder aus der Wertung genommen wurde; in beiden Fällen können wir die
       Sektion ignorieren.  Wenn die Sektion für andere Fahrer nicht "leer"
       ist, muss sie offensichtlich befahren werden, und wir dürfen sie nicht
       ignorieren.

       Wenn die Daten nicht vom Trialtool stammen, merken wir uns immer
       explizit, welche Sektionen aus der Wertung genommen wurden
       (skipped_zones); das Feature skipped_zones ist gesetzt.  Wir wissen
       genau, welche Sektionen ein Fahrer noch befahren muss.

       In jedem Fall werden die Fahrer zuerst nach der Anzahl der gefahrenen
       Sektionen gereiht (bis zur ersten nicht erfassten Sektion, die befahren
       werden muss), und erst danach nach den erzielten Punkten.  Das ergibt
       auch eine brauchbare Zwischenwertung, wenn die Ergebnisse Sektion für
       Sektion statt Runde für Runde eingegeben werden.

       Das Trialtool setzt rider.rounds auf die letzte begonnene Runde, wodurch
       wir dann nicht erkennen können, welche Fahrer in der letzten Runde und
       welche Fahrer schon "fertig" sind.  Wir verhalten uns nur dann
       kompatibel, wenn die Daten vom Trialtool stammen, weil das Auswertungen
       wie "Fahrer auf der Strecke" stört.  */

    Object.values(riders).forEach((rider) => {
      if (rider.group)
	return;

      rider.marks_per_round = [];
      rider.marks_distribution = [];
      rider.marks = null;

      let last_started_round, last_completed_round;

      if (rider.ranking_class && rider_starts(rider)) {
	rider.zones_todo = 0;
	let zone_skipped;

	let zones = event.zones[rider.ranking_class - 1] || [];
	let rounds = event.classes[rider.ranking_class - 1].rounds;

	for (let round = 1; round <= rounds; round++) {
	  rider.marks_per_round[round - 1] = null;
	  let marks_in_round =
	    rider.marks_per_zone[round - 1] || [];

	  for (let zone of zones) {
	    if (((event.skipped_zones[rider.ranking_class] || {})[round] || {})[zone])
	      continue;

	    let marks = marks_in_round[zone - 1];
	    if (marks != null) {
	      if (zone_skipped) {
		rider.zones_todo++;
	      } else {
		rider.marks_per_round[round - 1] +=
		  (marks == -1) ? marks_skipped_zone : marks;
		if (marks >= 0 && marks <= 5) {
		  if (rider.marks_distribution.length == 0)
		    rider.marks_distribution = [0, 0, 0, 0, 0, 0];
		  rider.marks_distribution[marks]++;
		}
		last_started_round = round;
	      }
	    } else if (trialtool_compatible) {
	      if (!active_zones)
		active_zones = compute_active_zones();
	      if (((active_zones[rider.ranking_class] || {})[round] || {})[zone]) {
		zone_skipped = true;
		rider.zones_todo++;
	      }
	      if (last_completed_round == null)
		last_completed_round = round - 1;
	    } else {
	      zone_skipped = true;
	      rider.zones_todo++;
	      if (last_completed_round == null)
		last_completed_round = round - 1;
	    }
	  }
	}

	for (let round = rider.marks_per_round.length; round >= 1; round--) {
	  if (rider.marks_per_round[round - 1] != null)
	    break;
	  rider.marks_per_round.pop();
	}

	if (last_started_round == null)
	  last_started_round = 0;
	if (last_completed_round == null)
	  last_completed_round = rounds;
	rider.marks = rider.additional_marks || null;
	for (let marks of rider.marks_per_round)
	  rider.marks += marks;
      }

      rider.rounds = trialtool_compatible ? last_started_round : last_completed_round;
    });
  }

  function compute_group_marks() {
    let marks_skipped_zone = event.marks_skipped_zone || 0;

    Object.values(rider).forEach((group) => {
      if (!group.group)
	return;

      group.marks_per_zone = [];
      group.marks_per_round = [];
      group.marks_distribution = [];
      group.marks = null;

      if (group.ranking_class &&
	  (group.registered || !event.features.registered) &&
	  group.start) {
	group.riders.forEach((number) => {
	  let rider = riders[number];
	  if (rider && rider.ranking_class && rider_starts(rider)) {
	    let zones = event.zones[rider.ranking_class - 1] || [];
	    let rounds = event.classes[rider.ranking_class - 1].rounds;

	    for (let round = 1; round <= rounds; round++) {
	      for (let zone of zones) {
		let marks;
		if (((event.skipped_zones[rider.ranking_class] || {})[round] || {})[zone])
		  continue;
		marks = (rider.marks_per_zone[round - 1] || [])[zone - 1];
		if (marks != null) {
		  if (!group.marks_per_zone[round - 1])
		    group.marks_per_zone[round - 1] = [];
		  if (group.marks_per_zone[round - 1][zone - 1] == undefined)
		    group.marks_per_zone[round - 1][zone - 1] = 0;

		  group.marks_per_zone[round - 1][zone - 1] +=
		    (marks == -1) ? marks_skipped_zone : marks;
		}
	      }
	    }

	    for (let index in rider.marks_distribution) {
	      if (rider.marks_distribution[index] != null) {
		if (group.marks_distribution.length == 0)
		  group.marks_distribution = [0, 0, 0, 0, 0, 0];
	        group.marks_distribution[index] +=
	          rider.marks_distribution[index];
	      }
	    }

	    for (let index in rider.marks_per_round) {
	      if (group.marks_per_round[index] == null)
		group.marks_per_round[index] = 0;
	      group.marks_per_round[index] +=
	        rider.marks_per_round[index];
	    }

	    if (rider.rounds != null) {
	      if (rider.rounds > (group.rounds || -1))
		groups.rounds = rider.rounds;
	    }
	    if (rider.zones_todo) {
	      if (group.zones_todo == null)
		group.zones_todo = 0;
	      group.zones_todo += rider.zones_todo;
	    }
	  }
	});

	if (group.additional_marks != 0)
	  group.marks += group.additional_marks;
	for (let marks of group.marks_per_round)
	  group.marks += marks;
      }
    });
  }

  function reset_all_rankings() {
    Object.values(riders).forEach((rider) => {
      rider.rank = null;
      rider.rankings.forEach((ranking) => {
	ranking.rank = null;
	ranking.score = null;
      });
    });
  }

  /* Groups are returned with key 'G' */
  function group_riders_per_class() {
    var riders_per_class = {};

    Object.values(riders).forEach((rider) => {
      if (rider_starts(rider)) {
	let ranking_class =
	  rider.group ? 'G' : rider.ranking_class;
	if (ranking_class) {
	  if (!riders_per_class[ranking_class])
	    riders_per_class[ranking_class] = [];
	  riders_per_class[ranking_class].push(rider);
	}
      }
    });

    return riders_per_class;
  }

  function competing(rider) {
    return !(rider.non_competing ||
	     (event.classes[rider['class'] - 1] || {}).non_competing);
  }

  function rank_order(a, b) {
    let cmp =
      (competing(b) - competing(a)) ||
      (!b.failure - !a.failure) ||
      (a.zones_todo - b.zones_todo) ||
      (a.marks - b.marks) ||
      (a.tie_break - b.tie_break);
    if (cmp)
      return cmp;

    /* Fewer cleaned sections win, etc. */
    for (let n = 0; n < 5; n++) {
      cmp = b.marks_distribution[n] - a.marks_distribution[n];
      if (cmp)
	return cmp;
    }

    if (event.equal_marks_resolution) {
      let ra = a.marks_per_round;
      let rb = b.marks_per_round;
      if (event.equal_marks_resolution == 1) {
	/* First better round wins */
	for (let n = 0; n < ra.length; n++) {
	  cmp = ra[n] - rb[n];
	  if (cmp)
	    return cmp;
	}
      } else {
	/* Last better round wins */
	for (let n = ra.length - 1; n >= 0; n--) {
	  cmp = ra[n] - rb[n];
	  if (cmp)
	    return cmp;
	}
      }
    }
  }

  function compute_ranks(riders_in_class) {
    riders_in_class.sort(rank_order);

    let ranks = {};
    let rank = 1;
    let previous_rider;
    riders_in_class.forEach((rider) => {
      ranks[rider.number] =
        (previous_rider && rank_order(previous_rider, rider) == 0) ?
	  ranks[previous_rider.number] : rank;
      previous_rider = rider;
      rank++;
    });

    return ranks;
  }

  function assign_score(riders_in_class, ranking, ranks) {
    function skip_rider(rider) {
      return !competing(rider) || rider.failure || rider.zones_todo;
    }

    if (event.split_score) {
      let m, n;
      for (m = 0; m < riders_in_class.length; m = n) {
	let rider_m = riders_in_class[m];
	if (skip_rider(rider_m)) {
	  n = m + 1;
	  continue;
	}

	let number_of_riders = 1;
	for (n = m + 1; n < riders_in_class.length; n++) {
	  let rider_n = riders_in_class[n];
	  if (ranks[rider_m.number] != ranks[rider_n.number])
	    break;
	  if (skip_rider(rider_n))
	    continue;
	  number_of_riders++;
	}

	let score = 0;
	let first_rank = ranks[rider_m.number];
	for (let i = 0; i < number_of_riders; i++) {
	  let rank = Math.min(first_rank + i, event.scores.length);
	  score += event.scores[rank - 1];
	}
	score /= number_of_riders;
	score = score || null;

	for (n = m; n < m + number_of_riders; n++) {
	  let rider_n = riders_in_class[n];
	  if (ranks[rider_m.number] != ranks[rider_n.number])
	    break;
	  if (skip_rider(rider_n))
	    continue;
	  rider_n.rankings[ranking - 1].score = score;
	}
      }
    } else {
      riders_in_class.forEach((rider) => {
	if (skip_rider(rider))
	  return;

	let rank = Math.min(ranks[rider.number], event.scores.length);
	let score = event.scores[rank - 1] || null;
	rider.rankings[ranking - 1].score = score;
      });
    }
  }

  compute_ranking_class();
  compute_rider_marks();
  if (event.features.groups)
    compute_group_marks();
  reset_all_rankings();

  /* Compute overall ranking, including all riders. The rank is stored in
     rider.rank; no score is associated with the overall ranking.  */
  let riders_per_class = group_riders_per_class(riders);
  for (let ranking_class in riders_per_class) {
    let riders_in_class = riders_per_class[ranking_class];

    let ranks = compute_ranks(riders_in_class);
    for (let number in ranks) {
      let rider = riders[number];
      rider.rank = ranks[number];
    }
  }

  /* Compute sub-rankings including only the selected riders.  The rank and
     score are stored in rider.rankings[ranking - 1] as:
     {rank: rank, score: score}.  */
  for (let ranking = 1; ranking <= 4; ranking++) {
    if (!event.features['ranking' + ranking])
      continue;

    for (let ranking_class in riders_per_class) {
      let riders_in_class = riders_per_class[ranking_class].filter(
        (rider) =>
	  rider.rankings[ranking - 1] &&
	  (ranking_class == 'G' ||
	   (ranking > 1 ||
	    !(event.classes[ranking_class - 1] || {}).no_ranking1))
      );

      let ranks = compute_ranks(riders_in_class);
      for (let number in ranks) {
	let rider = riders[number];
	rider.rankings[ranking - 1].rank = ranks[number];
      }

      if (ranking == 1 || event.score_234)
	assign_score(riders_in_class, ranking, ranks);
    }
  }

  Object.values(riders).forEach((rider) => {
    delete rider.ranking_class;
    delete rider.zones_todo;
  });
}

module.exports = compute;

/* ex:set shiftwidth=2: */
