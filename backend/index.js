/*
 * Copyright 2016  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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

"use strict";

var fs = require('fs');
var Promise = require('bluebird');
var compression = require('compression');
var express = require('express');
var exphbs = require('express-handlebars');
var mysql = require('mysql');
var deepEqual = require('deep-equal');
var clone = require('clone');

/*
 * Authentication
 */
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

/*
 * Apache htpasswd MD5 hashes
 */
var apache_md5 = require('apache-md5');

/*
 * Inject getConnectionAsync, queryAsync, and similar functions into mysql for
 * promise support.
 */
Promise.promisifyAll(require('mysql/lib/Pool').prototype);
Promise.promisifyAll(require('mysql/lib/Connection').prototype, {
  suffix: 'MultiAsync',
  filter: (name) => (name === 'query'),
  multiArgs: true});
Promise.promisifyAll(require('mysql/lib/Connection').prototype);

/*
 * Local things
 */
String.prototype.latinize = require('./lib/latinize');
var config = require('./config.js');

/*
 * mysql: type cast TINYINT(1) to bool
 */
function myTypeCast(field, next) {
  if (field.type == 'TINY' && field.length == 1) {
    return (field.string() == '1'); // 1 = true, 0 = false
  }
  return next();
}

var pool = mysql.createPool({
  connectionLimit: 64,
  host: config.database.host,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  // debug: true,
  typeCast: myTypeCast,
  dateStrings: true,
});

async function validate_user(connection, user) {
  if (!user || !user.email || !user.password)
    throw 'Wrong user or password';

  var rows = await connection.queryAsync(`
    SELECT password, tag, admin
    FROM users
    WHERE email = ? AND password IS NOT NULL`, [user.email]);

  try {
    var password_hash = rows[0].password;
    delete rows[0].password;
    if (apache_md5(user.password, password_hash) == password_hash) {
      Object.assign(user, rows[0]);
      return user;
    }
    console.error('Wrong password for user ' + JSON.stringify(user.email));
  } catch(e) {
    console.error('User ' + JSON.stringify(user.email) + ' does not exist');
  }
  throw 'Wrong user or password';
}

/*
 * Cache
 */
var cache = {
  cached_events: {},
  saved_events: {},
  get_event: function(id) {
    return this.cached_events[id];
  },
  set_event: function(id, event) {
    delete this.saved_events[id];
    this.cached_events[id] = event;
  },
  update_event: function(id, event) {
    if (!(id in this.saved_events))
      this.saved_events[id] = this.cached_events[id];
    this.cached_events[id] = event;
  },

  /*
   * Riders include the groups of riders as well (rider.group trueish).
   */
  cached_riders: {},
  saved_riders: {},
  get_riders: function(id) {
    return this.cached_riders[id];
  },
  set_riders: function(id, riders) {
    delete this.saved_riders[id];
    this.cached_riders[id] = riders;
  },
  update_rider: function(id, number, rider) {
    if (!(id in this.saved_riders))
      this.saved_riders[id] = {};
    if (!(number in this.saved_riders[id]))
      this.saved_riders[id][number] = this.cached_riders[id][number];
    this.cached_riders[id][number] = rider;
  },
};

async function get_list(connection, table, index, key, key_value, column) {
  return connection.queryAsync(`
    SELECT *
    FROM ` + table + `
    WHERE ` + key + ` = ?`, [key_value])
  .then((row) => {
    var list = [];
    row.forEach((_) => {
      if (column) {
	list[_[index] - 1] = _[column];
      } else {
	list[_[index] - 1] = _;
	delete _[index];
	delete _[key];
      }
    });
    return list;
  });
}

async function get_series(connection, email) {
  return connection.queryAsync(`
    SELECT serie, name, abbreviation, closed
    FROM series
    JOIN series_all_admins USING (serie)
    WHERE email = ?
    ORDER BY serie`, [email]);
}

async function get_serie(connection, serie_id) {
  var series = await connection.queryAsync(`
    SELECT *
    FROM series
    WHERE serie = ?`, [serie_id]);

  if (series.length != 1)
    throw 'No serie with number ' + JSON.stringify(serie_id) + ' exists';

  var serie = series[0];

  serie.events = (await connection.queryAsync(`
    SELECT id
    FROM series_events
    JOIN events USING (id)
    WHERE serie = ?
    ORDER BY date, id`, [serie_id])
  ).map((row) => row.id);

  serie.classes = await connection.queryAsync(`
    SELECT ranking_class AS class, events, drop_events
    FROM series_classes
    WHERE serie = ?`, [serie_id]);

  serie.new_numbers = {};
  (await connection.queryAsync(`
    SELECT id, number, new_number
    FROM new_numbers
    WHERE serie = ?`, [serie_id])
  ).forEach((row) => {
    var event = serie.new_numbers[row.id];
    if (!event)
      event = serie.new_numbers[row.id] = {};
    event[row.number] = row.new_number;
  });

  return serie;
}

async function get_events(connection, email) {
  var ids = await connection.queryAsync(`
    SELECT DISTINCT id
    FROM events
    WHERE id NOT IN (
      SELECT id
      FROM series_events)

    UNION

    SELECT id
    FROM series_events
    JOIN series USING (serie)
    WHERE NOT closed OR closed IS NULL`);

  var enabled = {};
  ids.forEach((row) => {
    enabled[row.id] = true;
  });

  var events_hash = {};

  var events = await connection.queryAsync(`
    SELECT DISTINCT id, tag, date, title, enabled
    FROM events
    JOIN events_all_admins USING (id)
    LEFT JOIN rankings USING (id)
    WHERE email = ? AND ranking = 1
    ORDER BY date, title, id`, [email]);

  events.forEach((row) => {
    events_hash[row.id] = row;
    row.series = [];
    row.closed = !enabled[row.id];
  });

  (await connection.queryAsync(`
    SELECT id, serie, abbreviation
    FROM series_events
    JOIN series USING (serie)
    WHERE COALESCE(abbreviation, '') != ''
    ORDER BY serie`)
  ).forEach((row) => {
    var event = events_hash[row.id];
    if (event) {
      delete row.id;
      event.series.push(row);
    }
  });

  return events;
}

function make_revalidate_event(connection, id) {
  var valid;

  return async function() {
    if (valid != null)
      return valid;

    let version;
    (await connection.queryAsync(`
      SELECT version
      FROM events
      WHERE id = ?`, [id])
    ).forEach((row) => {
      version = row.version;
    });

    let event = cache.get_event(id);
    let cached_version = (event || {}).version;
    valid = (cached_version == version);
    if (!valid)
      console.log('/event/' + id + ': version ' +
		  cached_version + ' != ' + version);
    return valid;
  };
}

async function read_event(connection, id, revalidate) {
  var event = cache.get_event(id);
  if (event && (!revalidate || await revalidate()))
    return event;

  var events = await connection.queryAsync(`
    SELECT *
    FROM events
    WHERE id = ?`, [id]);

  if (events.length != 1)
    throw 'No event with number ' + JSON.stringify(id) + ' exists';

  event = events[0];

  event.classes = await get_list(connection, 'classes', 'class', 'id', id);
  event.rankings = await get_list(connection, 'rankings', 'ranking', 'id', id);

  event.card_colors = await get_list(connection, 'card_colors', 'round', 'id', id, 'color');
  event.scores = await get_list(connection, 'scores', 'rank', 'id', id, 'score');

  event.zones = [];
  (await connection.queryAsync(`
    SELECT class, zone
    FROM zones
    WHERE id = ?`, [id])
  ).forEach((row) => {
    var class_ = event.zones[row['class'] - 1];
    if (!class_)
      class_ = event.zones[row['class'] - 1] = [];
    class_.push(row.zone);
  });

  event.features = {};
  (await connection.queryAsync(`
    SELECT feature
    FROM event_features
    WHERE id = ?`, [id])
  ).forEach((row) => {
    event.features[row.feature] = true;
  });

  if (event.features.skipped_zones) {
    event.skipped_zones = {};
    (await connection.queryAsync(`
      SELECT class, round, zone
      FROM skipped_zones
      WHERE id = ?`, [id])
    ).forEach((row) => {
      var classes = event.skipped_zones;
      var rounds = classes[row['class']];
      if (!rounds)
	rounds = classes[row['class']] = {};
      var zones = rounds[row.round];
      if (!zones)
	zones = rounds[row.round] = {};
      zones[row.zone] = true;
    });
  }

  cache.set_event(id, event);
  return event;
}

/* FIXME: The current representation isn't very compact, and only useful for data entry. */
function skipped_zones_list(skipped_zones_hash) {
  var skipped_zones_list = [];
  Object.keys(skipped_zones_hash).forEach((_) => {
    skipped_zones_list[_ - 1] = ((event_class) => {
      var rounds = [];
      Object.keys(event_class).forEach((_) => {
	rounds[_ - 1] = ((event_round) => {
	  var sections = Object.keys(event_round)
	    .map((s) => +s)
	    .sort();
	  return sections;
	})(event_class[_]);
      });
      return rounds;
    })(skipped_zones_hash[_]);
  });
  return skipped_zones_list;
}

async function get_event(connection, id) {
  var revalidate = make_revalidate_event(connection, id);
  var event = await read_event(connection, id, revalidate);
  var copy = clone(event, false, 1);

  copy.features = Object.keys(event.features);

  if (event.skipped_zones)
    copy.skipped_zones = skipped_zones_list(event.skipped_zones);

  copy.base = {tag: event.base};
  if (event.base != null) {
    var bases = await connection.queryAsync(`
      SELECT tag, id, title
      FROM events
      JOIN rankings USING(id)
      WHERE tag = ? AND ranking = 1`, [event.base]);

    if (bases.length == 1) {
      Object.assign(copy.base, bases[0]);

      var _ = await connection.queryAsync(`
        SELECT COUNT(*) AS start_tomorrow
	FROM riders
	JOIN event_features USING (id)
	WHERE id = ? AND start_tomorrow AND feature = 'start_tomorrow'`,
	[copy.base.id]);
      copy.base.start_tomorrow = _[0].start_tomorrow;
    }

    /*
     * NOTE: A list of bases (event.bases) is useful in the TrialInfo file
     * format so that we can inherit rights from the closest base that exists
     * in the database, it doesn't help the web frontend, though.  Omit here.
     */
  }

  /* FIXME: event.start_tomorrow = ...; (what for?) */

  /*
   * NOTE: In the TrialInfo file format, we also want event.series, a list of
   * series the event is a part of.
   */

  return copy;
}

function make_revalidate_rider(id, number, version) {
  var valid;

  return async function() {
    if (valid != null)
      return valid;

    let riders = cache.get_riders(id) || {};
    let cached_version = (riders[number] || {}).version;
    valid = (cached_version == version);
    if (!valid)
      console.log('/event/' + id + '/rider/' + number + ': version ' +
		  cached_version + ' != ' + version);
    return valid;
  };
}

async function read_riders(connection, id, revalidate) {
  let riders = cache.get_riders(id);
  if (riders && (!revalidate || await revalidate()))
    return riders;

  riders = {};

  (await connection.queryAsync(`
    SELECT *
    FROM riders
    WHERE id = ?`, [id])
  ).forEach((row) => {
    riders[row.number] = row;

    delete row.id;
    row.marks_distribution = [];
    for (let n = 0; n <= 5; n++) {
      if (row['s'+n] != null)
        row.marks_distribution[n] = row['s'+n];
      delete row['s'+n];
    }
    row.marks_per_zone = [];
    row.marks_per_round = [];
    row.rankings = [];
    if (row.group)
      row.riders = [];
  });

  (await connection.queryAsync(`
    SELECT number, round, zone, marks
    FROM marks
    WHERE id = ?`, [id])
  ).forEach((row) => {
    if (riders[row.number]) {
      var marks_per_zone = riders[row.number].marks_per_zone;
      var round = marks_per_zone[row.round - 1];
      if (!round)
	round = marks_per_zone[row.round - 1] = [];
      round[row.zone - 1] = row.marks;
    }
  });

  (await connection.queryAsync(`
    SELECT number, round, marks
    FROM rounds
    WHERE id = ?`, [id])
  ).forEach((row) => {
    if (riders[row.number])
      riders[row.number].marks_per_round[row.round - 1] = row.marks;
  });

  (await connection.queryAsync(`
    SELECT group_number, number
    FROM riders_groups
    WHERE id = ?
    `, [id])
  ).forEach((row) => {
    try {
      riders[row.group_number].riders.push(row.number);
    } catch (_) { }
  });

  (await connection.queryAsync(`
    SELECT ranking, number, subrank, score
    FROM rider_rankings
    WHERE id = ?`, [id])
  ).forEach((row) => {
    var rider = riders[row.number];
    if (rider) {
      rider.rankings[row.ranking - 1] = {rank: row.subrank, score: row.score};
    }
  });

  cache.set_riders(id, riders);
  return riders;
}

async function get_event_suggestions(connection, id) {
  /*
   * We don't need the suggestions to be exact, so don't revalidate the riders
   * here.
   */
  var riders = await read_riders(connection, id);

  var suggestions = {};
  ['province', 'country', 'vehicle', 'club'].forEach((field) => {
    var hist = {};
    Object.values(riders).forEach((rider) => {
      var value = rider[field];
      if (value != null && value != '') {
	if (value in hist)
	  hist[value]++;
	else
	  hist[value] = 1;
      }
    });
    var values = Object.keys(hist).sort((a, b) => hist[b] - hist[a]);
    suggestions[field] = values.slice(0, 100);
  });
  return suggestions;
}

async function get_rider(connection, id, params, number, direction) {
  var filters = [`id = ?`];
  var args = [id];
  var order_limit = '';

  if (params.start)
    filters.push('start');
  if (direction != null) {
    if (params.active)
      filters.push('(number >= 0 OR start)');
  }
  if (params.group !== undefined) {
    if (+params.group)
      filters.push('`group`');
    else
      filters.push('NOT COALESCE(`group`, 0)');
  }
  if (direction < 0) {
    if (number != null) {
      filters.push('number < ?');
      args.push(number);
    }
    order_limit = `
      ORDER BY number DESC
      LIMIT 1
    `;
  } else if (direction > 0) {
    if (number != null) {
      filters.push('number > ?');
      args.push(number);
    }
    order_limit = `
      ORDER BY number
      LIMIT 1
    `;
  } else {
    if (number != null) {
      filters.push('number = ?');
      args.push(number);
    }
  }

  var rows = await connection.queryAsync(`
    SELECT number, version
    FROM riders
    WHERE ` + filters.join(' AND ') +
    order_limit, args
  );
  if (rows.length != 1)
    return {};

  number = rows[0].number;
  let revalidate = make_revalidate_rider(id, number, rows[0].version);
  var riders = await read_riders(connection, id, revalidate);

  var rider = clone(riders[number], false, 1);

  if (rider.group) {
    var group = rider;
    var classes = {};
    group.riders.forEach((number) => {
      var rider = riders[number];
      if (rider && rider.start)
	classes[rider.class] = true;
    });
    group.classes = Object.keys(classes)
      .map((c) => +c)
      .sort();
  }

  /*
   * FIXME: A (sorted) list of enabled rankings would be a better representation.
   */
  var rider_rankings = [];
  rider.rankings.forEach((ranking, index) => {
    if (ranking)
      rider_rankings[index] = true;
  });
  rider.rankings = rider_rankings;

  return rider;
}

function strcmp(a, b) {
  a = (a || '').latinize();
  b = (b || '').latinize();
  return (a < b) ? -1 : (a > b) ? 1 : 0;
}

async function find_riders(connection, id, params) {
  let revalidate = make_revalidate_riders(connection, id);
  var riders = await read_riders(connection, id, revalidate);

  var term = (params.term || '').trim();
  if (term == '')
    return {};

  function rider_applies(rider) {
    return (!params.start || rider.start) &&
	   (params.group === undefined || +rider.group == +params.group) &&
	   (!params.active || rider.group || rider.number >= 0 || rider.start);
  }

  let found = [];
  if (riders[term]) {
    if (rider_applies(riders[term]))
      found.push(+term);
  } else {
    term = new RegExp(
      '^' +
      term.latinize()
	.replace(/[[+?\\.|^$({]/g, '\\$&')
	.replace(/\*/g, '.*')
	.replace(/\s+/g, '.* ')
      + '.*',
      'i'
    );

    Object.values(riders).forEach((rider) => {
      if (!rider_applies(rider))
	return;

      var first_name = (rider.first_name || '').latinize();
      var last_name = (rider.last_name || '').latinize();

      if ((first_name + ' ' + last_name).match(term) ||
	  (last_name + ' ' + first_name).match(term))
	found.push(rider.number);
    });
  }

  return found
    .map((number) => {
      var rider = riders[number];
      return {
	number: number,
	last_name: rider.last_name,
	first_name: rider.first_name,
	date_of_birth: rider.date_of_birth,
	'class': rider['class']
      };
    })
    .sort((a, b) => {
      return strcmp(a.last_name, b.last_name) ||
	     strcmp(a.first_name, b.first_name);
    })
    .splice(0, 20);
}

function make_revalidate_riders(connection, id) {
  var valid;

  return async function() {
    if (valid != null)
      return valid;

    let versions = {};
    (await connection.queryAsync(`
      SELECT number, version
      FROM riders
      WHERE id = ?`, [id])
    ).forEach((row) => {
      versions[row.number] = row.version;
    });

    let cached_versions = {};
    Object.values(cache.get_riders(id) || {}).forEach((rider) => {
      cached_versions[rider.number] = rider.version;
    });

    valid = deepEqual(versions, cached_versions);
    return valid;
  };
}

async function get_riders_summary(connection, id) {
  let revalidate = make_revalidate_riders(connection, id);
  var riders = await read_riders(connection, id, revalidate);

  var hash = {};

  Object.keys(riders).forEach((number) => {
    var rider = riders[number];
    if (!rider.group) {
      hash[number] = {
	first_name: rider.first_name,
	last_name: rider.last_name,
	date_of_birth: rider.date_of_birth,
	'class': rider['class'],
	start: rider.start,
	groups: []
      };
    }
  });

  /* FIXME: What for do we need the groups a rider is in? */
  Object.keys(riders).forEach((number) => {
    var group = riders[number];
    if (group.group) {
      group.riders.forEach((number) => {
	var rider = hash[number];
	if (rider)
	  rider.groups.push(group.number);
      });
    }
  });

  return hash;
}

async function get_groups_summary(connection, id) {
  let revalidate = make_revalidate_riders(connection, id);
  var riders = await read_riders(connection, id, revalidate);

  var hash = {};

  Object.keys(riders).forEach((number) => {
    var group = riders[number];
    if (group.group) {
      hash[number] = {
	first_name: group.first_name,
	last_name: group.last_name,
	'class': group['class'],
	start: group.start,
	riders: group.riders
      };
    }
  });

  return hash;
}

async function get_riders_list(connection, id) {
  let revalidate = make_revalidate_riders(connection, id);
  var riders = await read_riders(connection, id, revalidate);

  var list = [];

  Object.values(riders).forEach((rider) => {
    var r = {
      rankings: []
    };
    ['city', 'class', 'club', 'country', 'date_of_birth', 'email', 'entry_fee',
    'failure', 'finish_time', 'first_name', 'group', 'insurance', 'last_name',
    'license', 'non_competing', 'number', 'phone', 'province', 'registered',
    'riders', 'rounds', 'start', 'start_time', 'start_tomorrow', 'street',
    'vehicle', 'zip'].forEach(
      (field) => { r[field] = rider[field]; }
    );
    rider.rankings.forEach((ranking, index) => {
      if (ranking)
	r.rankings.push(index + 1);
    });
    list.push(r);
  });

  return list;
}

async function get_event_scores(connection, id) {
  let revalidate_riders = make_revalidate_riders(connection, id);
  let revalidate_event = make_revalidate_event(connection, id);
  let revalidate = async function() {
    return await revalidate_riders() &&
	   await revalidate_event();
  }
  var event = await read_event(connection, id, revalidate);
  var riders = await read_riders(connection, id, revalidate);

  var hash = {};

  var groups = [];
  var active_riders = {};
  var riders_per_class = {};
  Object.keys(riders).forEach((number) => {
    var rider = riders[number];

    if (!rider.start)
      return;

    var r = {
      rankings: []
    };

    ['number', 'last_name', 'first_name', 'club', 'vehicle',
    'country', 'province', 'rank', 'failure', 'non_competing',
    'additional_marks', 'marks', 'marks_distribution', 'marks_per_round',
    'marks_per_zone', 'rankings'].forEach(
      (field) => { r[field] = rider[field]; }
    );
    active_riders[rider.number] = r;

    if (rider.group) {
      r.riders = rider.riders;
      groups.push(r);
    } else {
      let class_ = rider['class'];
      if (class_ == null)
	return;
      if (!riders_per_class[class_])
	riders_per_class[class_] = [];
      riders_per_class[class_].push(r);
    }
  });

  function ranking_class(class_) {
    if (class_ != null && event.classes[class_ - 1])
      return event.classes[class_ - 1].ranking_class;
  }

  /*
   * Convert index of riders_per_class from class to ranking class.
   * Riders in classes which are not defined are dropped.
   */
  riders_per_class = (() => {
    var rs = {};
    Object.keys(riders_per_class).forEach((class_) => {
      let rc = ranking_class(class_);
      if (rc != null) {
	if (!rs[rc])
	  rs[rc] = [];
	rs[rc].push(...riders_per_class[class_]);
      }
    });
    return rs;
  })();

  hash.event = {};
  ['equal_marks_resolution', 'mtime', 'four_marks', 'date',
  'split_score'].forEach(
    (field) => { hash.event[field] = event[field]; }
  );

  hash.event.features = Object.keys(event.features);

  hash.event.classes = [];
  hash.event.zones = [];
  Object.keys(riders_per_class).forEach((class_) => {
    let hash_event_class = hash.event.classes[class_ - 1] = {};
    let event_class = event.classes[class_ - 1];
    ['rounds', 'color', 'name'].forEach((field) => {
      hash_event_class[field] = event_class[field];
    });
    hash_event_class.groups = false;
    hash.event.zones[class_ - 1] = event.zones[class_ - 1];
  });

  var active_rankings = [];
  Object.values(riders_per_class).forEach((riders) => {
    Object.values(riders).forEach((rider) => {
      rider.rankings.forEach((ranking, index) => {
	if (ranking)
	  active_rankings[index] = true;
      });
    });

  });

  hash.event.rankings = [];
  active_rankings.forEach((ranking, index) => {
    hash.event.rankings[index] = event.rankings[index];
  });

  if (event.skipped_zones)
    hash.event.skipped_zones = skipped_zones_list(event.skipped_zones);

  hash.riders = [];
  Object.keys(riders_per_class).forEach((class_) => {
    if (riders_per_class[class_].length)
      hash.riders[class_ - 1] = riders_per_class[class_];
  });

  /*
   * Groups are added as a new pseudo-class ...
   */
  if (groups.length) {
    let classes = {};
    groups.forEach((group) => {
      group.riders.forEach((number) => {
	let rider = riders[number];
	let rc = ranking_class(rider.class);
	if (rc != null)
	  classes[rc] = true;
      });
    });

    let rounds;
    let zones;
    if (Object.keys(classes).length == 1) {
      let class_ = Object.keys(classes)[0];
      rounds = event.classes[class_ - 1].rounds;
      zones = event.zones[class_ - 1];
    } else {
      rounds = 0;
      zones = {};
      Object.keys(classes).forEach((class_) => {
	let rc = ranking_class(class_);
	if (rc != null) {
	  rounds = Math.max(rounds, event.classes[rc - 1].rounds);
	  event.zones[rc - 1].forEach((zone) => {
	    zones[zone] = true;
	  });
	}
      });
      zones = Object.keys(zones)
        .map((_) => +_)
	.sort((a, b) => a - b);
    }

    let groups_class = {
      name: 'Gruppen',
      rounds: rounds,
      groups: true,
    };
    let n = hash.event.classes.length;
    hash.riders[n] = groups;
    hash.event.zones[n] = zones;
    hash.event.classes[n] = groups_class;
  }

  return hash;
}

async function zip(a, b, func) {
  var length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++)
    func(a[index], b[index], index);
}

function remove_identical_fields(a, b) {
  Object.keys(a).forEach((key) => {
    if (a[key] === b[key]) {
      delete a[key];
      delete b[key];
    }
  });
}

async function update(connection, table, keys, map_func, old_values, new_values) {
  old_values = map_func(old_values);
  new_values = map_func(new_values);

  if (old_values === undefined) {
    if (new_values === undefined)
      return false;

    let columns = Object.keys(keys).concat(Object.keys(new_values));
    let values = Object.values(keys).concat(Object.values(new_values));
    await connection.queryAsync(
      'INSERT INTO `' + table + '` (' +
        columns.map((x) => '`' + x + '`').join(', ') + ') ' +
      'VALUES (' + values.map((x) => '?').join(', ') + ')',
      values);
  } else {
    if (new_values === undefined) {
      await connection.queryAsync(
        'DELETE FROM `' + table + '` ' +
	'WHERE ' + Object.keys(keys).map((x) => '`' + x + '` = ?').join(', '),
	Object.values(keys));
    } else {
      if (old_values === [] && new_values === [])
	return false;

      await connection.queryAsync(
        'UPDATE `' + table + '` SET ' +
	  Object.keys(new_values).map((x) => '`' + x + '` = ?').join(', ') + ' ' +
	  'WHERE ' + Object.keys(keys).map((x) => '`' + x + '` = ?').join(', '),
	  new_values.concat(Object.values(keys)));
    }
  }
  /* FIXME: How are database failures handled? */
  return true;
}

function working_obj(obj) {
  if (!obj)
    return {};
  return clone(obj, false, 1);
}

function flatten_marks_distribution(rider) {
  if (rider.marks_distribution) {
    for (let n = 0; n <= 5; n++)
      rider['s' + n] = rider.marks_distribution[n];
    delete rider.marks_distribution;
  }
}

/*
 * We only update the rider version when rankings are added or removed, not
 * when a rider's rank or score within a ranking changes.  (The rank and score
 * are computed values.)
 */
function rankings_added_or_removed(a, b) {
  var map = (list) => list.map((x) => !!x);
  return !deepEqual(map(a.rankings), map(b.rankings));
}

async function update_rider(connection, id, number, rider) {
  var changed = false;
  var riders = cache.get_riders(id);
  var old_rider = old_riders[number];

  var real_old_rider = old_rider, real_rider = rider;
  old_rider = working_obj(old_rider);
  rider = working_obj(rider);

  flatten_marks_distribution(old_rider);
  flatten_marks_distribution(rider);

  changed = changed || rankings_added_or_removed(old_rider, rider);
  zip(old_rider.rankings || [], rider.rankings || [],
    (a, b, index) => {
      update(connection, 'rider_rankings',
	{id: id, number: number, ranking: index + 1},
	(x) => (x ? {subrank: x.rank, score: x.score} : undefined),
	a, b);
    });
  delete rider.rankings;
  delete old_rider.rankings;

  zip(old_rider.marks_per_zone || [], rider.marks_per_zone || [],
    (a, b, round_index) => {
      zip(a, b, (a, b, zone_index) => {
	update(connection, 'marks',
	  {id: id, number: number, round: round_index + 1, zone: zone_index + 1},
	  (x) => (x != null ? {marks: x} : undefined),
	  a, b) && (changed = true);
      });
    });
  delete rider.marks_per_zone;
  delete old_rider.marks_per_zone;

  zip(old_rider.marks_per_round || [], rider.marks_per_round || [],
    (a, b, index) => {
      update(connection, 'rounds',
	{id: id, number: number, round: index + 1},
	(x) => (x != null ? {marks: x} : undefined),
	a, b) && (changed = true);
    });
  delete rider.marks_per_round;
  delete old_rider.marks_per_round;

  var version = old_rider.version || 0;
  remove_identical_fields(old_rider, rider);
  if (changed || Object.keys(old_rider) || Object.keys(rider)) {
    old_rider.version = version;
    rider.version = version + 1;
  }

  update(connection, 'rider',
    {id: id, number: number},
    (x) => x,
    real_old_rider ? old_rider : undefined,
    real_rider ? rider : undefined);

  if (real_rider) {
    /* FIXME: Normalize rider. */
    riders[number] = rider;
  } else {
    delete riders[number];
  }
}

passport.use('local', new LocalStrategy(
  {
    usernameField: 'email',
  },
  (email, password, done) => {
    // console.log('LocalStrategy("' + email + '", "' + password + '")');
    pool.getConnectionAsync()
      .then((connection) => {
	validate_user(connection, {email: email, password: password})
	  .then((user) => {
	    return done(null, user);
	  }).catch(String, (msg) => {
	    return done(null, false, {message: msg});
	  }).catch((err) => {
	    return done(err);
	  }).finally(() => {
	    connection.release();
	  });
      });
  }));

async function register_get_event(connection, id) {
  var event = await get_event(connection, id);
  var result = {
    id: id,
    title: event.rankings[0].title
  };
  ['date', 'registration_ends', 'ranking1_enabled',
   'type', 'features'].forEach((field) => {
    result[field] = event[field];
  });
  result.classes = [];
  event.classes.forEach((class_, index) => {
    if (class_ && class_.rounds && event.zones[index]) {
      result.classes[index] = class_.name;
    }
  });
  return result;
}

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

var app = express();

function clientErrorHandler(err, req, res, next) {
  if (!res.headersSent) {
    if (typeof err === 'string' || err instanceof String) {
      res.send({error: err});
      // return next();
    }
    res.status(500);
    res.send({ error: err.message || err });
  }
  next(err);
}

function conn(pool) {
  return function(req, res, next) {
    if (req.conn)
      return next();

    conn = pool.getConnectionAsync()
      .then((connection) => {
	req.conn = connection;
	var end = res.end;
	res.end = function() {
	  connection.release();
	  delete req.conn;
	  res.end = end;
	  res.end.apply(res, arguments);
	}

	next();
      }).catch(next);
  };
}

function auth(req, res, next) {
  return validate_user(req.conn, req.user)
    .then(() => {
      next();
    }).catch(String, function() {
      res.status(403);
      res.json({message: 'Not Authorized'});
    }).catch(function(err) {
      next(err);
    });
}

function will_read_event(req, res, next) {
  req.conn.queryAsync(`
    SELECT 1
    FROM events_all_admins
    WHERE id = ? AND email = ?`,
    [req.params.id, req.user.email])
  .then((allowed) => {
    return next();

    if (allowed.length == 0) {
      return Promise.reject(
	'No read access to event ' + JSON.stringify(req.params.id) +
	' for user ' + JSON.stringify(req.user.email));
    }
    next();
  }).catch(next);
}

function will_write_event(req, res, next) {
  req.conn.queryAsync(`
    SELECT 1
    FROM events_all_admins
    WHERE id = ? AND email = ? AND NOT read_only`,
    [req.params.id, req.user.email])
  .then((allowed) => {
    return next();

    if (allowed.length == 0) {
      return Promise.reject(
	'No write access to event ' + JSON.stringify(req.params.id) +
	' for user ' + JSON.stringify(req.user.email));
    }
    next();
  }).catch(next);
}

function will_read_serie(req, res, next) {
  req.conn.queryAsync(`
    SELECT 1
    FROM series_all_admins
    WHERE serie = ? AND email = ?`,
    [req.params.serie, req.user.email])
  .then((allowed) => {
    if (allowed.length == 0) {
      return Promise.reject(
	'No read access to serie ' + JSON.stringify(req.params.serie) +
	' for user ' + JSON.stringify(req.user.email));
    }
    next();
  }).catch(next);
}

function will_write_serie(req, res, next) {
  req.conn.queryAsync(`
    SELECT 1
    FROM series_all_admins
    WHERE serie = ? AND email = ? AND NOT read_only`,
    [req.params.serie, req.user.email])
  .then((allowed) => {
    if (allowed.length == 0) {
      return Promise.reject(
	'No write access to serie ' + JSON.stringify(req.params.serie) +
	' for user ' + JSON.stringify(req.user.email));
    }
    next();
  }).catch(next);
}

function minified_redirect(req, res, next) {
  var minified = req.url.replace(/.js$/, '.min.js');
  fs.stat('htdocs' + minified, function(err, stats) {
    if (!err && stats.isFile()) {
      req.url = minified;
      return next('route');
    }
    next();
  });
}

app.set('case sensitive routing', true);

if (!config.session)
  config.session = {};
if (!config.session.secret)
  config.session.secret = require('crypto').randomBytes(64).toString('hex');

app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');

app.configure(function() {
  var production = process.env.NODE_ENV == 'production';

  app.use(express.logger());
  if (production)
    app.get('*.js', minified_redirect);
  app.use(express.static('htdocs'));
  app.use(express.bodyParser());
  app.use(express.cookieParser(config.session.secret));
  app.use(express.cookieSession({key: 'trialinfo.session'}));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/api', conn(pool));
  app.use(compression());
  app.use(app.router);
  app.use(clientErrorHandler);
});

function login(req, res, next) {
  passport.authenticate('local', function(err, user) {
    if (err)
      return next(err);
    if (user) {
      req.logIn(user, function(err) {
	if (err)
	  return next(err);
	res.cookie('trialinfo.user', JSON.stringify({email: user.email}));
	next();
      });
    } else {
      var params = {
	email: req.body.email,
	error: 'Anmeldung fehlgeschlagen.'
      };
      if (req.query.redirect)
	params.query = '?redirect=' + encodeURIComponent(req.query.redirect);
      res.clearCookie('trialinfo.user');
      return res.render('login', params);
    }
  })(req, res, next);
}

app.post('/login', login, function(req, res, next) {
  var url = '/';
  if (req.query.redirect)
    url = decodeURIComponent(req.query.redirect);
  return res.redirect(303, url);
});

app.post('/new-password', login, function(req, res, next) {
  var params = {email: req.user.email};
  if (req.query.redirect)
    params.query = '?redirect=' + encodeURIComponent(req.query.redirect);
  res.render('new-password', params);
});

app.post('/change-password', conn(pool), auth, function(req, res, next) {
  var new_password = req.body.password;

  var errors = [];
  if (new_password.length < 6)
    errors.push('Kennwort muss mindestens 6 Zeichen lang sein.');
  if (req.user.email.indexOf(new_password) != -1)
    errors.push('Kennwort darf nicht in der E-Mail-Adresse enthalten sein.');
  if (errors.length) {
    var params = {email: req.user.email};
    if (req.query.redirect)
      params.query = '?redirect=' + encodeURIComponent(req.query.redirect);
    params.error = errors.join(', ');
    return res.render('new-password', params);
  }

  var hash = apache_md5(new_password);
  console.log('>>> ' + req.user.email + ': ' + hash);
  req.conn.queryAsync(`
    UPDATE users
    SET password = ?
    WHERE email = ?`, [hash, req.user.email])
  .then(function() {
    req.user.password = req.body.password;
    next();
  }).catch(next);
}, function(req, res, next) {
  var params = {redirect: req.query.redirect || '/'};
  res.render('password-changed', params);
});

app.get('/logout', function(req, res, next) {
  req.logout();
  res.clearCookie('trialinfo.user');
  res.redirect(303, '/admin/');
});

/*
 * Freely accessible without authorization:
 */

app.get('/api/event/:id/scores', function(req, res, next) {
  get_event_scores(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/register/event/:id', function(req, res, next) {
  register_get_event(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

/*
 * All other /api/ routes require authorization:
 */

app.all('/api/*', auth);

/* Administration */

app.get('/api/events', function(req, res, next) {
  get_events(req.conn, req.user.email)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/series', function(req, res, next) {
  get_series(req.conn, req.user.email)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id', will_read_event, function(req, res, next) {
  get_event(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/suggestions', will_read_event, function(req, res, next) {
  get_event_suggestions(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/rider/:number', will_read_event, function(req, res, next) {
  get_rider(req.conn, req.params.id, req.query, req.params.number)
  .then((result) => {
    res.json(result);
  }).catch(next);
});
app.get('/api/event/:id/first-rider', will_read_event, function(req, res, next) {
  get_rider(req.conn, req.params.id, req.query, null, 1)
  .then((result) => {
    res.json(result);
  }).catch(next);
});
app.get('/api/event/:id/previous-rider/:number', will_read_event, function(req, res, next) {
  get_rider(req.conn, req.params.id, req.query, req.params.number, -1)
  .then((result) => {
    res.json(result);
  }).catch(next);
});
app.get('/api/event/:id/next-rider/:number', will_read_event, function(req, res, next) {
  get_rider(req.conn, req.params.id, req.query, req.params.number, 1)
  .then((result) => {
    res.json(result);
  }).catch(next);
});
app.get('/api/event/:id/last-rider', will_read_event, function(req, res, next) {
  get_rider(req.conn, req.params.id, req.query, null, -1)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/find-riders', will_read_event, function(req, res, next) {
  find_riders(req.conn, req.params.id, req.query)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/riders', will_read_event, function(req, res, next) {
  get_riders_summary(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/groups', will_read_event, function(req, res, next) {
  get_groups_summary(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/list', will_read_event, function(req, res, next) {
  get_riders_list(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/serie/:serie', will_read_serie, function(req, res, next) {
  get_serie(req.conn, req.params.serie)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/login/', function(req, res, next) {
  var params = {};
  if (req.query.redirect)
    params.query = '?redirect=' + encodeURIComponent(req.query.redirect);
  res.render('login', params);
});

app.get('/admin/', function(req, res, next) {
  if (!(req.user || {}).admin) {
    if (req.user)
      req.logout();
    res.redirect(303, '/login/?redirect=' + encodeURIComponent(req.url));
  } else {
    res.sendfile('htdocs/admin/main.html');
  }
});

/*
 * Let Angular handle page-internal routing.  (Static files in /admin/ such as
 * /admin/api.js are already handled by express.static above.)
 */
app.get('/admin/*', function(req, res, next) {
  if (!(req.user || {}).admin) {
    if (req.user)
      req.logout();
    /* Session cookie not defined, so obviously not logged in. */
    res.redirect(303, '/login/?redirect=' + encodeURIComponent(req.url));
  }
  res.sendfile('htdocs/admin/main.html');
});

if (!config.http && !config.https)
  config.http = {};

if (config.http) {
  var http = require('http');
  var port = config.http.port || 80;
  http.createServer(app).listen(port);
}

if (config.https) {
  var fs = require('fs');
  var https = require('https');
  var options = {
    key: fs.readFileSync(config.https.key),
    cert: fs.readFileSync(config.https.cert)
  };
  var port = config.https.port || 443;
  https.createServer(options, app).listen(port);
}

/* ex:set shiftwidth=2: */
