/*
 * Copyright 2019  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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

function new_rider(rider) {
  return {
    number: rider.number,
    date_of_birth: rider.date_of_birth,
    events: [],
    drop_score: null
  };
}

async function compute_serie(connection, serie_id, last_event) {
  let tie_break = {};
  (await connection.queryAsync(`
    SELECT *
    FROM series_tie_break
    WHERE serie = ?
  `, [serie_id])).forEach((row) => {
    tie_break[row.number] = row.tie_break;
  });

  let event_order = [];
  (await connection.queryAsync(`
    SELECT id
    FROM events
    JOIN series_events USING (id)
    WHERE serie = ?
    ORDER BY date
  `, [serie_id])).forEach((row) => {
    event_order.push(row.id);
  });
  event_order = event_order.reduce((event_order, id, index) => {
    event_order[id] = index;
    return event_order;
  }, {});

  function higher_event_id(a, b) {
    return event_order[a] > event_order[b] ? a : b;
  }

  /*
   * Ignore events which have no results at all.  This ensures that events
   * won't show up in the results during registration, but it also means that
   * an event that no riders participated in cannot be part of the results.
   *
   * (An event can still be part of the results when it has individual classes
   * with no riders in them.)
   */

  let events_so_far = [];
  (await connection.queryAsync(`
    SELECT ranking, ranking_class, COUNT(*) AS events
    FROM (
      SELECT DISTINCT ranking_class, ranking, id
      FROM series_events
      JOIN (
	  SELECT id
	  FROM events
	  JOIN rider_rankings USING (id)
	  WHERE score
      ) AS events USING (id)
      JOIN rankings USING (id)
      JOIN (
	  SELECT id, class, ranking_class, no_ranking1
	  FROM classes
	  JOIN zones USING (id, class)
	  WHERE rounds AND NOT COALESCE(non_competing, 0)
      ) AS classes USING (id)
      JOIN series_classes USING (serie, ranking, ranking_class)
      WHERE serie = ? AND
            (ranking <> 1 OR NOT COALESCE(no_ranking1, 0))
    ) AS _
    GROUP BY ranking, ranking_class
  `, [serie_id])).forEach((row) => {
    let esf = events_so_far[row.ranking - 1];
    if (!esf)
      esf = events_so_far[row.ranking - 1] = [];
    esf[row.ranking_class - 1] = row.events;
  });

  let rankings = {};
  (await connection.queryAsync(`
    SELECT ranking, ranking_class,
	   COALESCE(new_number, number) AS number, id,
	   rider_rankings.rank, rider_rankings.score,
	   date_of_birth
    FROM rider_rankings
    JOIN riders USING (id, number)
    JOIN classes USING (id, class)
    JOIN events USING (id)
    JOIN series_events USING (id)
    JOIN series_classes USING (serie, ranking, ranking_class)
    LEFT JOIN new_numbers USING (serie, id, number)
    WHERE serie = ? AND enabled AND rider_rankings.score IS NOT NULL AND
	  (new_numbers.number IS NULL OR new_numbers.new_number IS NOT NULL)
  `, [serie_id])).forEach((row) => {
    let ranking = rankings[row.ranking];
    if (!ranking)
      ranking = rankings[row.ranking] = {};
    delete row.ranking;

    let ranking_class = ranking[row.ranking_class];
    if (!ranking_class)
      ranking_class = ranking[row.ranking_class] = { riders: {} };
    delete row.ranking_class;

    let rider = ranking_class.riders[row.number];
    if (!rider) {
      rider = ranking_class.riders[row.number] = new_rider(row);
      if (tie_break[row.number])
	rider.tie_break = tie_break[row.number];
    }
    delete row.date_of_birth;
    delete row.number;

    if (rider.last_id)
      rider.last_id = higher_event_id(rider.last_id, row.id);
    else
      rider.last_id = row.id;

    rider.events.push(row);
  });

  Object.keys(rankings).forEach((ranking_nr) => {
    let ranking = rankings[ranking_nr];
    Object.keys(ranking).forEach((ranking_class_nr) => {
      let ranking_class = ranking[ranking_class_nr];
      ranking_class.events_so_far =
	(events_so_far[ranking_nr - 1] || [])
	[ranking_class_nr - 1] || 0;
    });
  });

  Object.values(rankings).forEach((ranking) => {
    Object.values(ranking).forEach((ranking_class) => {
      ranking_class.riders = Object.values(ranking_class.riders);
    });
  });

  (await connection.queryAsync(`
    SELECT *
    FROM series_classes
    WHERE serie = ?
  `, [serie_id])).forEach((row) => {
    let ranking = rankings[row.ranking];
    if (ranking) {
      let ranking_class = ranking[row.ranking_class];
      if (ranking_class) {
	for (let key of ['serie', 'ranking', 'ranking_class'])
	  delete row[key];
	Object.assign(ranking_class, row);
      }
    }
  });

  function compute_ranking(ranking_class) {
    let riders = ranking_class.riders;
    let resolve_harder;

    function rank_order(a, b) {
      if (a.ranked != b.ranked)
	return b.ranked - a.ranked;

      // Höhere Gesamtpunkte (nach Abzug der Streichpunkte) gewinnen
      if (a.score != b.score)
	return b.score - a.score;

      // Eine explizite Reihung von Fahrern bei Punktegleichstand überschreibt
      // den Vergleich der Platzierungen, usw.:
      if (a.tie_break != null && b.tie_break != null)
	return a.tie_break - b.tie_break;

      if (last_event.type == 'otsv-acup') {
	let _a = a.date_of_birth || '9999-99-99';
	let _b = b.date_of_birth || '9999-99-99';
	return _a.localeCompare(_b);
      }

      // Laut Telefonat am 22.10.2014 mit Martin Suchy (OSK): Wenn Fahrer
      // punktegleich sind, werden sie in der Ergebnisliste anhand der besseren
      // Platzierungen gereiht.  Der Rang wird allerdings nur dann "aufgelöst",
      // wenn es den ersten Platz betrifft; sonst gibt es Ex Aequo-Platzierungen.
      //
      // Das ist so implementiert, dass resolve_harder zunächst true ist, bei der
      // Zuweisung der Ränge wird es aber nach den Fahrern mit Platz 1 auf false
      // gesetzt.

      if (resolve_harder) {
	function event_ranks(x) {
	  return x.events.map((event) => event.rank).sort((a, b) => a - b);
	}

	let a_ranks = event_ranks(a);
	let b_ranks = event_ranks(b);
	for (let n = 0; n < Math.min(a_ranks.length, b_ranks.length); n++) {
	  if (a_ranks[n] != b_ranks[n])
	    return a_ranks[n] - b_ranks[n];
	}

	if (a_ranks.length != b_ranks.length)
	  return b_ranks.length - a_ranks.length;

	// Fahrer mit höheren Streichpunkten gewinnt
	if (a.drop_score != b.drop_score)
	  return b.drop_score - a.drop_score;

	// Folgende Regel ist nicht implementiert, und muss als explizite
	// Reihung definiert werden (Tabelle series_tie_break):
	//
	// Ist auch dann noch keine Differenzierung möglich, wird der
	// OSK-Prädikatstitel dem Fahrer zuerkannt, der den letzten wertbaren
	// Lauf zu dem entsprechenden Bewerb gewonnen hat.
	//
	// Im Jahr 2017 ist dieser Fall für die beiden Besten in der roten Spur
	// eingetreten.  Nach Intervention hat die AMF diese Regelung für Trial
	// gestrichen; es gibt im Jahr 2017 zwei Staatsmeister (16.11.2017).
      }
    }

    function assign_ranks(riders) {
      resolve_harder = true;
      riders.sort(rank_order);

      let rank = 1;
      let previous_rider;
      riders.forEach((rider) => {
	rider.rank =
	  (previous_rider && !rank_order(previous_rider, rider)) ?
	     previous_rider.rank : rank;
	if (rider.rank > 1)
	  resolve_harder = false;
	previous_rider = rider;
	rank++;
      });
    }

    function drop_score(events, drop_limit) {
      let events_list = Object.values(events);
      if (events_list.length <= drop_limit)
	return null;
      return events_list
	.sort((a, b) => a.score - b.score)
	.slice(0, events_list.length - drop_limit)
	.reduce(
	  (drop, _) => drop + _.score, 0);
    }

    riders.forEach((rider) => {
      rider.score = rider.events.reduce(
	(score, _) => score + _.score, 0);
    });

    let num_events = ranking_class.events_so_far;
    let max_events = Math.max(num_events, ranking_class.max_events || 0);
    let drop_limit = max_events - (ranking_class.drop_events || 0);
    if (num_events > drop_limit) {
      riders.forEach((rider) => {
	rider.drop_score = drop_score(rider.events, drop_limit);
	rider.score -= rider.drop_score;
      });
    }

    if (ranking_class.min_events > 1) {
      for (rider of riders) {
	/* Assume the rider will participate in all events still taking place. */
	let events_to_come = max_events - num_events;
	rider.ranked = rider.events.length + events_to_come >= ranking_class.min_events;
      }
    }

    assign_ranks(riders);

    return riders.reduce((riders, rider) => {
      let rider_copy = riders[rider.number] = {};
      let ignore_keys = {
	number: true,
	events: true,
	tie_break: true,
	date_of_birth: true
      };
      for (let key of Object.keys(rider)) {
	if (!(key in ignore_keys))
	  rider_copy[key] = rider[key];
      }
      return riders;
    }, {});
  }

  Object.keys(rankings).forEach((ranking_nr) => {
    let ranking = rankings[ranking_nr];

    let joint;
    if (last_event) {
      let event_ranking = last_event.rankings[ranking_nr - 1];
      if (event_ranking)
	joint = event_ranking.joint;
    }

    if (joint) {
      /*
       * Collapse all the classes in the ranking into one, but keep the joint
       * result attached to each of the original ranking classes.  That way,
       * the series_scores table will end up with a copy of the joint ranking
       * for each of the contained ranking classes, making database queries
       * much easier.
       */

      let first_ranking_class;
      let joint_ranking_class;
      let joint_riders = {};
      let placeholder = {};
      Object.keys(ranking).forEach((ranking_class_nr) => {
	let ranking_class = ranking[ranking_class_nr];

	ranking_class.riders.forEach((rider) => {
	  let joint_rider = joint_riders[rider.number];
	  if (!joint_rider) {
	    joint_rider = joint_riders[rider.number] = new_rider(rider);
	  }
	  joint_rider.events =
	    joint_rider.events.concat(rider.events);
	  if (rider.last_id) {
	    if (!joint_rider.last_id) {
	      joint_rider.last_id = rider.last_id;
	    } else {
	      joint_rider.last_id =
		higher_event_id(joint_rider.last_id, rider.last_id);
	    }
	  }
	});

	if (joint_ranking_class) {
	  for (let key of ['max_events', 'min_events',
			   'drop_events', 'events_so_far']) {
	    if (first_ranking_class[key] != ranking_class[key]) {
	      console.log(`Collapsed ranking ${ranking_nr}: ${key} differs; ignoring`);
	      joint_ranking_class[key] = null;
	    }
	  }
	} else {
	  joint_ranking_class = Object.assign({}, ranking_class);
	  first_ranking_class = ranking_class;
	}
	ranking[ranking_class_nr] = placeholder;
      });
      if (joint_ranking_class) {
	joint_ranking_class.riders = Object.values(joint_riders);
	Object.assign(placeholder, compute_ranking(joint_ranking_class));
      }
    } else {
      Object.keys(ranking).forEach((ranking_class_nr) => {
	let ranking_class = ranking[ranking_class_nr];
	ranking[ranking_class_nr] = compute_ranking(ranking_class);
      });
    }
  });

  return rankings;
}

module.exports = compute_serie;

/* ex:set shiftwidth=2: */
