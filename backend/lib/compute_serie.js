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

async function compute_serie(connection, serie_id) {
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

  let rankings = {};
  (await connection.queryAsync(`
    SELECT ranking, ranking_class,
	   COALESCE(new_number, number) AS number, id,
	   rider_rankings.rank, rider_rankings.score
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
      rider = ranking_class.riders[row.number] = {
	number: row.number,
	events: [],
	drop_score: null
      };
      if (tie_break[row.number])
	rider.tie_break = tie_break[row.number];
    }
    delete row.number;

    if (!rider.last_id || event_order[rider.last_id] < event_order[row.id])
      rider.last_id = row.id;

    rider.events.push(row);
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
      let ranking_class = rankings[row.ranking][row.ranking_class];
      if (ranking_class) {
	for (let key of ['serie', 'ranking', 'ranking_class'])
	  delete row[key];
	Object.assign(ranking_class, row);
      }
    }
  });

  Object.values(rankings).forEach((ranking) => {
    Object.values(ranking).forEach((ranking_class) => {
      ranking_class.riders.forEach((rider) => {
	rider.score = rider.events.reduce(
	  (score, _) => score + _.score, 0);
      });
    });
  });

  function drop_score(events, count) {
    return Object.values(events)
      .sort((a, b) => a.score - b.score)
      .slice(0, count)
      .reduce(
        (drop, _) => drop + _.score, 0);
  }

  Object.values(rankings).forEach((ranking) => {
    Object.values(ranking).forEach((ranking_class) => {
      if (ranking_class.events && ranking_class.drop_events) {
	let max_events = ranking_class.events - ranking_class.drop_events;
	ranking_class.riders.forEach((rider) => {
	  let events = rider.events;
	  if (events.length > max_events) {
	    rider.drop_score = drop_score(events, events.length - max_events);
	    rider.score -= rider.drop_score;
	  }
	});
      }
    });
  });

  let resolve_harder;

  function rank_order(a, b) {
    // Höhere Gesamtpunkte (nach Abzug der Streichpunkte) gewinnen
    if (a.score != b.score)
      return b.score - a.score;

    // Eine explizite Reihung von Fahrern bei Punktegleichstand überschreibt
    // den Vergleich der Platzierungen, usw.:
    if (a.tie_break != null && b.tie_break != null)
      return a.tie_break - b.tie_break;

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


  Object.values(rankings).forEach((ranking) => {
    Object.values(ranking).forEach((ranking_class) => {
      resolve_harder = true;
      ranking_class.riders.sort(rank_order);

      let rank = 1;
      let previous_rider;
      ranking_class.riders.forEach((rider) => {
	rider.rank =
	  (previous_rider && !rank_order(previous_rider, rider)) ?
	     previous_rider.rank : rank;
	if (rider.rank > 1)
	  resolve_harder = false;
	previous_rider = rider;
	rank++;
      });
    });
  });

  for (let ranking_nr of Object.keys(rankings)) {
    let ranking = rankings[ranking_nr];
    rankings[ranking_nr] =
      Object.keys(ranking).reduce((new_ranking, ranking_class_nr) => {
	let ranking_class = ranking[ranking_class_nr];
	new_ranking[ranking_class_nr] =
	  ranking_class.riders.reduce((riders, rider) => {
	    riders[rider.number] = rider;
	    delete rider.number;
	    delete rider.events;
	    delete rider.tie_break;
	    return riders;
	  }, {});
	return new_ranking;
      }, {});
  }

  return rankings;
}

module.exports = compute_serie;

/* ex:set shiftwidth=2: */
