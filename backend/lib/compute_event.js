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

var deepEqual = require('deep-equal');
var common = require('../htdocs/js/common');
let acup = require('./acup.js');

function compute_event(cached_riders, event, compute_marks) {
  function compute_rider_marks(riders) {
    let marks_skipped_zone = event.marks_skipped_zone || 0;
    let active_zones;

    riders.forEach((rider) => {
      if (rider.group)
	return;

      let last_completed_round;

      if (rider.start && rider.ranking_class) {
	rider.unfinished_zones = 0;
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
		rider.unfinished_zones++;
	      } else {
		let actual_marks = (marks == -1) ? marks_skipped_zone : marks;
		rider.marks_per_round[round - 1] += actual_marks;

		let index;
		if (event.uci_x10) {
		  if (actual_marks % 10 == 0 && actual_marks >= 0 && actual_marks <= 60)
		    index = actual_marks / 10;
		} else {
		  if (actual_marks >= 0 && actual_marks <= 5)
		    index = actual_marks;
		}
		if (index != null) {
		  if (rider.marks_distribution.length == 0) {
		    rider.marks_distribution = [0, 0, 0, 0, 0, 0];
		    if (event.uci_x10)
		      rider.marks_distribution.push(0);
		  }
		  rider.marks_distribution[index]++;
		}
	      }
	    } else {
	      zone_skipped = true;
	      rider.unfinished_zones++;
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

	if (last_completed_round == null)
	  last_completed_round = rounds;

	if (rider.additional_marks != null)
	  rider.marks += rider.additional_marks;
	if (rider.penalty_marks != null)
	  rider.marks += rider.penalty_marks;
	for (let marks of rider.marks_per_round)
	  rider.marks += marks;
      }

      rider.rounds = last_completed_round;
    });
  }

  function compute_group_marks(groups) {
    let marks_skipped_zone = event.marks_skipped_zone || 0;

    /* FIXME: Rider numbers are not guaranteed to be unique in rankings that
       combine multiple events! */
    let riders_by_number = {};
    for (let rider of groups)
      riders_by_number[rider.number] = rider;

    groups.forEach((group) => {
      if (!group.group)
	return;

      let marks_per_zone = [];

      if (group.start) {
	group.riders.forEach((number) => {
	  let rider = riders_by_number[number];
	  if (marks_per_zone == undefined)
	    return;
	  else if (!rider.marks_per_zone) {
	    marks_per_zone = undefined;
	    return;
	  }
	  if (rider && rider.start && rider.ranking_class) {
	    let zones = event.zones[rider.ranking_class - 1] || [];
	    let rounds = event.classes[rider.ranking_class - 1].rounds;

	    for (let round = 1; round <= rounds; round++) {
	      for (let zone of zones) {
		let marks;
		if (((event.skipped_zones[rider.ranking_class] || {})[round] || {})[zone])
		  continue;
		marks = (rider.marks_per_zone[round - 1] || [])[zone - 1];
		if (marks != null) {
		  if (!marks_per_zone[round - 1])
		    marks_per_zone[round - 1] = [];
		  if (marks_per_zone[round - 1][zone - 1] == undefined)
		    marks_per_zone[round - 1][zone - 1] = 0;

		  marks_per_zone[round - 1][zone - 1] +=
		    (marks == -1) ? marks_skipped_zone : marks;
		}
	      }
	    }

	    for (let index in rider.marks_distribution) {
	      if (rider.marks_distribution[index] != null) {
		if (group.marks_distribution.length == 0) {
		  group.marks_distribution = [0, 0, 0, 0, 0, 0];
		  if (event.uci_x10)
		    group.marks_distribution.push(0);
		}
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
		group.rounds = rider.rounds;
	    }
	    if (rider.unfinished_zones) {
	      if (group.unfinished_zones == null)
		group.unfinished_zones = 0;
	      group.unfinished_zones += rider.unfinished_zones;
	    }
	  }
	});

	if (group.additional_marks != null)
	  group.marks += group.additional_marks;
	if (group.penalty_marks != null)
	  group.marks += group.penalty_marks;
	for (let marks of group.marks_per_round)
	  group.marks += marks;
      }

      if (marks_per_zone != undefined)
	group.marks_per_zone = marks_per_zone;
    });
  }

  /* Groups are returned with key 'G' */
  function group_riders_per_class(riders) {
    var riders_per_class = {};

    riders.forEach((rider) => {
      let ranking_class =
	rider.group ? 'G' : rider.ranking_class;
      if (rider.start && ranking_class) {
	if (!riders_per_class[ranking_class])
	  riders_per_class[ranking_class] = [];
	riders_per_class[ranking_class].push(rider);
      }
    });

    return riders_per_class;
  }

  function rank_order(ranking, set_decisive) {
    return function(a, b) {
      if (a.ranking_class != b.ranking_class) {
	if (event.type == 'otsv-acup' && ranking == 2) {
	  try {
	    let color_a = event.classes[a.ranking_class - 1].color;
	    let color_b = event.classes[b.ranking_class - 1].color;
	    if (color_a != color_b)
	      return acup.color_order[color_a] - acup.color_order[color_b];
	  } catch (err) {
	    throw new Error(`Failed to compare ranking classes ${a.ranking_class} and ${b.ranking_class}`);
	  }
	} else {
	  try {
	    return event.classes[a.ranking_class - 1].order -
		   event.classes[b.ranking_class - 1].order;
	  } catch (_) {}
	  return a.ranking_class - b.ranking_class;
	}
      }

      let cmp =
	(a.non_competing - b.non_competing) ||
	(!b.failure - !a.failure) ||
	(a.unfinished_zones - b.unfinished_zones) ||
	(event.uci_x10 ? (b.marks - a.marks) : (a.marks - b.marks)) ||
	(a.tie_break - b.tie_break);
      if (cmp)
	return cmp;

      if (event.type == 'otsv-acup') {
	/* We only care about the number of clean sections. */
	cmp = b.marks_distribution[0] - a.marks_distribution[0];
	if (cmp) {
	  if (set_decisive)
	    set_decisive.marks(cmp < 0 ? a : b, 0);
	  return cmp;
	}

	let _a = a.date_of_birth || '9999-99-99';
	let _b = b.date_of_birth || '9999-99-99';
	return _a.localeCompare(_b);
      }

      function compare_marks_distribution(a, b, n) {
	cmp = b.marks_distribution[n] - a.marks_distribution[n];
	if (cmp && set_decisive)
	  set_decisive.marks(cmp < 0 ? a : b, n);
	return cmp;
      }

      /* More cleaned sections win, etc. */
      if (event.uci_x10) {
	for (let n = 6; n >= 0; n--) {
	  cmp = compare_marks_distribution(a, b, n);
	  if (cmp)
	    return cmp;
	}
      } else {
	for (let n = 0; n < 6; n++) {
	  cmp = compare_marks_distribution(a, b, n);
	  if (cmp)
	    return cmp;
	}
      }

      if (event.equal_marks_resolution) {
	let ra = a.marks_per_round;
	let rb = b.marks_per_round;
	if (ra && rb) {
	  if (event.equal_marks_resolution == 1) {
	    /* First better round wins */
	    for (let n = 0; n < ra.length; n++) {
	      cmp = event.uci_x10 ? (rb[n] - ra[n]) : (ra[n] - rb[n]);
	      if (cmp) {
		if (set_decisive)
		  set_decisive.round(cmp < 0 ? a : b, n + 1);
		return cmp;
	      }
	    }
	  } else {
	    /* Last better round wins */
	    for (let n = ra.length - 1; n >= 0; n--) {
	      cmp = event.uci_x10 ? (rb[n] - ra[n]) : (ra[n] - rb[n]);
	      if (cmp) {
		if (set_decisive)
		  set_decisive.round(cmp < 0 ? a : b, n + 1);
		return cmp;
	      }
	    }
	  }
	}
      }
    };
  }

  function compute_ranks(riders_in_class, ranking, set_decisive, assign) {
    let decisive_order = rank_order(ranking, set_decisive);
    riders_in_class.sort(rank_order(ranking));

    let rank, next_rank = 1;
    let riders_at_rank = [], previous_rider;
    for (let rider of riders_in_class) {
      if (!previous_rider || decisive_order(previous_rider, rider)) {
	if (riders_at_rank.length)
	  assign(riders_at_rank, rank);
	riders_at_rank = [];
	rank = next_rank;
      }
      riders_at_rank.push(rider);
      previous_rider = rider;
      next_rank++;
    }
    if (riders_at_rank.length)
      assign(riders_at_rank, rank);
  }

  function score_for_rank(rank, number_of_riders) {
    let score = 0;
    if (event.split_score) {
      let first_rank = rank;
      for (let i = 0; i < number_of_riders; i++) {
	rank = first_rank + i;
	if (rank > event.scores.length)
	  rank = event.scores.length;
	score += event.scores[rank - 1] || 0;
      }
      score /= number_of_riders;
    } else {
      if (rank > event.scores.length)
	rank = event.scores.length;
      score = event.scores[rank - 1] || 0;
    }
    return score || null;
  }

  function assign_overall_rank(riders_at_rank, rank) {
    for (let rider of riders_at_rank)
      rider.rank = rank;
  }

  function assign_ranking_rank(ranking) {
    return function(riders_at_rank, rank) {
      let score = score_for_rank(rank, riders_at_rank.length);
      for (let rider of riders_at_rank) {
	rider.rankings[ranking - 1].rank = rank;
	if (!(rider.non_competing || rider.failure || rider.zones_todo ||
	      rider.unfinished_zones))
	  rider.rankings[ranking - 1].score = score;
      }
    };
  }

  let riders = [];
  for (let cached_rider of cached_riders) {
    let class_ = cached_rider['class'];
    let ranking_class;
    if (!cached_rider.group && class_ != null)
      ranking_class = event.classes[class_ - 1].ranking_class;

    let rider = {
	ranking_class: ranking_class,
	start: (cached_rider.group || ranking_class) &&
	       cached_rider.verified && cached_rider.start &&
	       (cached_rider.registered || !event.features.registered),
	non_competing: cached_rider.non_competing ||
		       (event.classes[class_ - 1] || {}).non_competing,
	rankings: cached_rider.rankings.map(
	  (ranking) => ranking && {
	    rank: null,
	    score: null,
	    decisive_marks: null,
	    decisive_round: null,
	  }
	),
	rank: null,
	decisive_marks: null,
	decisive_round: null,
    };
    for (let field of ['number', 'group', 'date_of_birth', 'class',
		       'year_of_manufacture', 'penalty_marks', 'failure',
		       'marks_per_zone', 'tie_break'])
      rider[field] = cached_rider[field];
    if (compute_marks) {
      rider.marks = null;
      rider.marks_distribution = [];
      rider.marks_per_round = [];
      rider.unfinished_zones = null;
      rider.additional_marks = null;
    } else {
      for (let field of ['marks', 'marks_distribution', 'marks_per_round',
			 'unfinished_zones', 'additional_marks'])
	rider[field] = cached_rider[field];
    }
    riders.push(rider);
  }

  if (compute_marks) {
    if (event.type == 'otsv-acup') {
      let year_of_event = (common.date_of_event(event)).getFullYear();
      for (let rider of riders) {
	if ((rider.class >= 8 && rider.class <= 11) && !rider.group) {
	  let year = rider.year_of_manufacture || year_of_event;
	  let m = Math.trunc(Math.max(0, (year - 1987 + 3) / 3));
	  if (m)
	    rider.additional_marks = m;
	}
      }
    }
  }

  if (compute_marks) {
    compute_rider_marks(riders);
    if (event.features.groups)
      compute_group_marks(riders);
  }

  function rider_not_split(rider) {
    for (let n = 0; n < event.rankings.length; n++) {
      try {
	if (event.rankings[n].split && rider.rankings[n])
	  return false;
      } catch (_) {}
    }
    return true;
  }

  let set_decisive_overall = {
    marks: function(rider, marks) {
      rider.decisive_marks = marks;
    },
    round: function(rider, round) {
      rider.decisive_round = round;
    }
  };

  /* Compute overall ranking including all starters. The rank is stored in
     rider.rank, with no associated score.  */
  let riders_per_class = group_riders_per_class(riders);
  for (let ranking_class in riders_per_class) {
    let riders_in_class = riders_per_class[ranking_class]
      .filter(rider_not_split);

    compute_ranks(riders_in_class, null, set_decisive_overall, assign_overall_rank);
  }

  /* Compute sub-rankings including only the selected riders.  The rank and
     score are stored in rider.rankings[ranking - 1] as:
     {rank: rank, score: score}.  */
  for (let ranking = 1; ranking <= 4; ranking++) {
    if ((event.rankings[ranking - 1] || {ignore: true}).ignore)
      continue;

    function rider_in_ranking(rider) {
      return rider.rankings[ranking - 1] &&
	     (rider.ranking_class == 'G' ||
	      ranking > 1 ||
	      !(event.classes[rider.class - 1] || {}).no_ranking1);
    }

    let set_decisive_in_ranking = {
      marks: function(rider, marks) {
	rider.rankings[ranking - 1].decisive_marks = marks;
      },
      round: function(rider, round) {
	rider.rankings[ranking - 1].decisive_round = round;
      }
    }

    if (event.rankings[ranking - 1].joint) {
      let riders_in_ranking = [];
      for (let ranking_class in riders_per_class) {
	riders_in_ranking = riders_in_ranking.concat(
	  riders_per_class[ranking_class].filter(rider_in_ranking)
	);
      }
      compute_ranks(riders_in_ranking, ranking, set_decisive_in_ranking,
		    assign_ranking_rank(ranking));
    } else {
      for (let ranking_class in riders_per_class) {
	let riders_in_class = riders_per_class[ranking_class]
	  .filter(rider_in_ranking);
	compute_ranks(riders_in_class, ranking, set_decisive_in_ranking,
		      assign_ranking_rank(ranking));
      }
    }
  }

  for (let rider of riders) {
    delete rider.ranking_class;
    delete rider.start;
    delete rider.non_competing;
  }

  return riders;
}

module.exports = compute_event;

/* ex:set shiftwidth=2: */
