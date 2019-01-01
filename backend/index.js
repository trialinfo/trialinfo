/*
 * Copyright 2016-2017  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
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
var fsp = require('fs-promise');
var Promise = require('bluebird');
var compression = require('compression');
var express = require('express');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session')
var cookieSession = require('cookie-session');
require('marko/express'); //enable res.marko
var html_escape = require('html-escape');
var mysql = require('mysql');
var deepEqual = require('deep-equal');
var common = require('./htdocs/js/common');
var moment = require('moment');
var crypto = require('crypto');
var base64url = require('base64url');
var nodemailer = require('nodemailer');
var zlib = require('zlib');
var clone = require('clone');
var jsonpatch = require('json-patch');
var child_process = require('child_process');
var tmp = require('tmp');
var diff = require('diff');
var cors = require('cors');
var start_times = require('./start_times');
var random_shuffle = require('./lib/random_shuffle');

var config = JSON.parse(fs.readFileSync('config.json'));

var views = {
  'index': require('./views/index.marko.js'),
  'login': require('./views/login.marko.js'),
  'change-password': require('./views/change-password.marko.js'),
  'confirmation-sent': require('./views/confirmation-sent.marko.js'),
  'password-changed': require('./views/password-changed.marko.js'),
};

var emails = {
  'change-password': require('./emails/change-password.marko.js'),
  'notify-registration': require('./emails/notify-registration.marko.js')
};

var regforms_dir = 'pdf/regform';

var object_values = require('object.values');
if (!Object.values)
  object_values.shim();

/*
 * Authentication
 */
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

/*
 * Logging
 */

logger.token('email', function (req, res) {
  return (req.user || {}).email || '-';
});

var production_log_format =
  ':email ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms ":user-agent"';

function log_sql(sql) {
  if (config.log_sql)
    console.log(sql + ';');
}

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
var compute_event = require('./lib/compute_event.js');
String.prototype.latinize = require('./lib/latinize');

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

async function column_exists(connection, table, column) {
  var rows = await connection.queryAsync(`
    SELECT 1
    FROM INFORMATION_SCHEMA.columns
    WHERE table_schema = ? AND table_name = ? AND column_name = ?
    LIMIT 1
    `, [config.database.database, table, column]);
  return rows.length != 0;
}

async function update_database(connection) {
  if (!await column_exists(connection, 'riders', 'accept_conditions')) {
    console.log('Adding column `accept_conditions` to table `riders`');
    await connection.queryAsync(`
      ALTER TABLE riders
      ADD accept_conditions BOOLEAN NOT NULL DEFAULT 0
    `);
  }

  if (!await column_exists(connection, 'riders', 'penalty_marks')) {
    console.log('Adding column `penalty_marks` to table `riders`');
    await connection.queryAsync(`
      ALTER TABLE riders
      ADD penalty_marks FLOAT AFTER failure;
    `);
    await connection.queryAsync(`
      UPDATE riders
      SET penalty_marks = additional_marks
    `);
  }

  if (!await column_exists(connection, 'riders', 'year_of_manufacture')) {
    console.log('Adding column `year_of_manufacture` to table `riders`');
    await connection.queryAsync(`
      ALTER TABLE riders
      ADD year_of_manufacture INT AFTER vehicle
    `);
  }

  if (!await column_exists(connection, 'classes', 'order')) {
    let bt = '`';
    console.log('Adding column `order` to table `classes`');
    await connection.queryAsync(`
      ALTER TABLE classes
      ADD ${bt}order${bt} INT NOT NULL
    `);
    await connection.queryAsync(`
      UPDATE classes
      SET ${bt}order${bt} = ${bt}class${bt}
    `);
  }

  if (await column_exists(connection, 'events', 'class_order')) {
    console.log('Removing column `class_order` from table `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      DROP class_order
    `);
  }

  if (!await column_exists(connection, 'events', 'title')) {
    console.log('Moving column `title` to table `event`');
    await connection.queryAsync(`
      ALTER TABLE events
      ADD title VARCHAR(70) AFTER base_fid,
      ADD subtitle VARCHAR(70) AFTER title
    `);
    await connection.queryAsync(`
      UPDATE events
      JOIN rankings USING (id)
      SET events.title = rankings.title,
        events.subtitle = rankings.subtitle
      WHERE ranking = 1
    `);
    await connection.queryAsync(`
      ALTER TABLE rankings
      DROP title, DROP subtitle
    `);
  }

  if (!await column_exists(connection, 'series_scores', 'serie')) {
    console.log('Creating table `series_scores`');
    await connection.queryAsync(`
      CREATE TABLE series_scores (
	serie INT DEFAULT NULL,
	class INT DEFAULT NULL,
	number INT DEFAULT NULL,
	last_id INT NOT NULL,
	rank INT,
	drop_score double,
	score double,
	PRIMARY KEY (serie, class, number)
      )
    `);
  }
}

pool.getConnectionAsync()
  .then((connection) => {
    update_database(connection)
    .finally(() => {
      connection.release();
    });
  });

class HTTPError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HTTPError';
    this.status = status;
  }
}

async function validate_user(connection, user) {
  if (!user || !user.email || !user.password)
    throw 'E-Mail-Adresse oder Kennwort fehlt.';

  var rows = await connection.queryAsync(`
    SELECT email, password, user_tag, verified, admin
    FROM users
    WHERE email = ?`, [user.email]);

  if (rows.length != 1) {
    console.error('User ' + JSON.stringify(user.email) + ' does not exist');
    throw 'E-Mail-Adresse ' + JSON.stringify(user.email) + ' ist nicht registriert. ' +
	  'Bitte fahren Sie mit <em>Neu registrieren</em> fort.';
  }
  if (rows[0].password == null) {
    console.error('No password set for user ' + JSON.stringify(user.email));
    throw 'Für die E-Mail-Adresse ' + JSON.stringify(user.email) +
	  ' ist noch kein Kennwort gesetzt.<br>' +
          'Bitte fahren Sie mit der an diese Adresse geschickten ' +
	  'Bestätigungs-E-Mail fort, oder schicken Sie über ' +
	  '<em>Kennwort zurücksetzen</em> erneut eine ' +
	  'Bestätigungs-E-Mail an diese Adresse.';
  }
  var password_hash = rows[0].password;
  delete rows[0].password;
  if (apache_md5(user.password, password_hash) != password_hash) {
    console.error('Wrong password for user ' + JSON.stringify(user.email));
    throw 'Falsches Kennwort für E-Mail-Adresse ' + JSON.stringify(user.email) + '.';
  }
  Object.assign(user, rows[0]);
  return user;
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
  modify_event: function(id) {
    if (!(id in this.saved_events)) {
      var event = this.cached_events[id];
      this.saved_events[id] = event;
      event = Object.assign({}, event);
      this.cached_events[id] = event;
      return event;
    }

    return this.cached_events[id];
  },
  delete_event: function(id) {
    delete this.saved_events[id];
    delete this.cached_events[id];
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
  get_rider: function(id, number) {
    return (this.cached_riders[id] || {})[number];
  },
  modify_rider: function(id, number) {
    if (!this.saved_riders[id])
      this.saved_riders[id] = {};
    if (!this.cached_riders[id])
      this.cached_riders[id] = {};

    if (!(number in this.saved_riders[id])) {
      var rider = this.cached_riders[id][number];
      this.saved_riders[id][number] = rider;
      rider = Object.assign({}, rider);
      this.cached_riders[id][number] = rider;
      return rider;
    }

    return this.cached_riders[id][number];
  },
  modify_riders: function(id) {
    for (let number in this.cached_riders[id])
      this.modify_rider(id, number);
    return this.cached_riders[id];
  },
  delete_riders: function(id) {
    delete this.saved_riders[id];
    delete this.cached_riders[id];
  },
  delete_rider: function(id, number) {
    if (this.saved_riders[id])
      delete this.saved_riders[id][number];
    if (this.cached_riders[id])
      delete this.cached_riders[id][number];
  },
  set_rider: function(id, number, rider) {
    if (this.saved_riders[id])
      delete this.saved_riders[id][number];
    if (rider) {
      if (!this.cached_riders[id])
	this.cached_riders[id] = {};
      this.cached_riders[id][number] = rider;
    } else {
      if (this.cached_riders[id])
	delete this.cached_riders[id][number];
    }
  },

  begin: async function(connection) {
    // assert(!this.transaction);
    await connection.queryAsync(`BEGIN`);
    this.transaction = true;
  },
  commit: async function(connection) {
    try {
      await commit_world(connection);

      delete this.transaction;
      await connection.queryAsync(`COMMIT`);
      this._roll_forward();
    } catch (exception) {
      await this.rollback(connection);
      throw exception;
    }
  },
  _roll_forward: function() {
    this.saved_events = {};
    this.saved_riders = {};
  },
  _roll_back: function() {
    Object.keys(this.saved_events).forEach((id) => {
      if (this.saved_events[id])
	this.cached_events[id] = this.saved_events[id];
      else
	delete this.cached_events[id];
    });
    this.saved_events = {};
    Object.keys(this.saved_riders).forEach((id) => {
      Object.keys(this.saved_riders[id]).forEach((number) => {
	let old_rider = this.saved_riders[id][number];
	if (old_rider)
	  this.cached_riders[id][number] = old_rider;
	else
	  delete this.cached_riders[id][number];
      });
    });
    this.saved_riders = {};
  },
  rollback: async function(connection) {
    this._roll_back();
    if (this.transaction) {
      delete this.transaction;
      await connection.queryAsync(`ROLLBACK`);
    }
  }
};

function hash_future_starts(future_starts, rider) {
  if (rider) {
    let rider_tag = rider.rider_tag;
    for (let fid in rider.future_starts) {
      if (rider.future_starts[fid]) {
	future_starts[fid + ' ' + rider_tag] = {
	  fid: fid,
	  rider_tag: rider_tag
	};
      }
    }
  }
}

async function update_future_starts(connection, id) {
  let numbers = Object.keys(cache.saved_riders[id]);
  let old_future_starts = {}, new_future_starts = {};
  for (let number of numbers) {
    let old_rider = cache.saved_riders[id][number];
    let new_rider = cache.cached_riders[id][number];
    hash_future_starts(old_future_starts, old_rider);
    hash_future_starts(new_future_starts, new_rider);
  }

  await zipHashAsync(old_future_starts, new_future_starts,
    async function(a, b) {
      await update(connection, 'future_starts',
	Object.assign({id: id}, a || b),
	[],
	a != null && {}, b != null && {});
    });
}

async function commit_world(connection) {
  var ids = Object.keys(cache.saved_riders);
  for (let id of ids) {
    let numbers = Object.keys(cache.saved_riders[id]);
    for (let number of numbers) {
      let old_rider = cache.saved_riders[id][number];
      let new_rider = cache.cached_riders[id][number];
      await update_rider(connection, id, number,
			 old_rider, new_rider);
    }
    /*
     * The 'future_starts' table uses 'rider_tag' as the rider key instead of
     * 'number'.  We cannot simply update it in update_rider() which processes
     * the riders per number because otherwise number changes would lead to
     * duplicate key errors in 'future_starts'.  (The 'rider_tag' doesn't
     * change when 'number' changes).
     *
     * FIXME: Change 'future_starts' table to use 'number' as key instead of
     * 'rider_tag' and revert this change.  (May conflict with
     * pre-registration.)
     */
    await update_future_starts(connection, id);
  }

  ids = Object.keys(cache.saved_events);
  for (let id of ids) {
    let old_event = cache.saved_events[id];
    let new_event = cache.cached_events[id];
    await update_event(connection, id, old_event, new_event);
  }
}

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
    ORDER BY name`, [email]);
}

async function get_serie(connection, serie_id) {
  var series = await connection.queryAsync(`
    SELECT *
    FROM series
    WHERE serie = ?`, [serie_id]);

  if (series.length != 1)
    throw new HTTPError(404, 'Not Found');

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

  serie.tie_break = {};
  (await connection.queryAsync(`
    SELECT number, tie_break
    FROM series_tie_break
    WHERE serie = ?`, [serie_id])
  ).forEach((row) => {
    serie.tie_break[row.number] = row.tie_break;
  });

  return serie;
}

async function rider_regform_data(connection, id, number, event) {
  let rider = await get_rider(connection, id, number);
  if (!rider)
    throw new HTTPError(404, 'Not Found');

  rider = Object.assign({}, rider);

  if (rider.number < 0)
    rider.number = null;

  if (rider.class != null) {
    var cls = event.classes[rider.class - 1];
    if (cls) {
      cls = event.classes[cls.ranking_class - 1];
      if (cls) {
	var match;
	if (cls.color && (match = cls.color.match(/^#([0-9a-fA-F]{6})$/)))
	  rider['class_' + match[1].toLowerCase()] = true;
      }
    }
  }

  if (common.guardian_visible(rider, event)) {
    if (!rider.guardian)
      rider.guardian = '……………………………………………………';
  } else {
      rider.guardian = null;
  }

  if (rider.date_of_birth != null) {
    rider.date_of_birth = moment(common.parse_timestamp(rider.date_of_birth))
      .locale('de').format('D.M.YYYY');
  }

  let all_starts = {};
  for (let future_event of event.future_events) {
    if (future_event.date && future_event.active)
      all_starts[future_event.date] =
        rider.future_starts[future_event.fid] || false;
  }
  if (event.date)
    all_starts[event.date] = rider.start;
  for (let date in all_starts) {
    let date_obj = common.parse_timestamp(date);
    rider['start_' + moment(date_obj).format('ddd').toLowerCase()] =
      all_starts[date];
  }

  return rider;
}

async function admin_regform(res, connection, id, numbers) {
  let event = await get_event(connection, id);
  if (event.type == null)
    throw new HTTPError(404, 'Not Found');

  var riders;

  if (Array.isArray(numbers)) {
    riders = [];
    for (let number of numbers) {
      var rider = await rider_regform_data(connection, id, number, event);
      riders.push(rider);
    }
  } else {
    riders = await rider_regform_data(connection, id, numbers, event);
  }

  var form = regforms_dir + '/' + event.type + '.pdf';
  var child = child_process.spawn('./pdf-fill-form.py', ['--fill', form], {
    stdio: ['pipe', 'pipe', process.stderr]
  });

  child.stdin.write(JSON.stringify(riders));
  child.stdin.end();

  var headers_sent;
  child.stdout.on('data', (chunk) => {
    if (!headers_sent) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${Array.isArray(numbers) ? 'Nennformulare' : 'Nennformular'}.pdf"`);
      res.setHeader('Transfer-Encoding', 'chunked');
    }
    res.write(chunk);
    headers_sent = true;
  });

  child.stdout.on('end', () => {
    res.end();
  });

  /* FIXME: error handling! */
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
    WHERE email = ?
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
  event.result_columns = await get_list(connection, 'result_columns', 'n', 'id', id, 'name');

  event.future_events = await connection.queryAsync(`
    SELECT *
    FROM future_events
    WHERE id = ?
    ORDER BY date, title`, [id]);
  Object.values(event.future_events).forEach((future_event) => {
    delete future_event.id;
  });

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

  event.series = (await connection.queryAsync(`
    SELECT DISTINCT abbreviation
    FROM series_events
    JOIN series USING (serie)
    JOIN classes USING (id)
    JOIN series_classes USING (serie, ranking_class)
    WHERE id = ? AND ranking
    ORDER BY abbreviation`, [id])
  ).reduce((series, row) => {
    if (series)
      series += ', ';
    series += row.abbreviation;
    return series;
  }, '');

  cache.set_event(id, event);
  return event;
}

/* FIXME: The current admin skipped_zones representation is pretty horrible.  */
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

function skipped_zones_hash(skipped_zones_list) {
  return skipped_zones_list.reduce(function(classes, v, i) {
    if (v) {
      classes[i + 1] = v.reduce(function(rounds, v, i) {
	if (v) {
	  rounds[i + 1] = v.reduce(function(zones, zone) {
	    zones[zone] = true;
	    return zones;
	  }, {});
	}
	return rounds;
      }, {});
    }
    return classes;
  }, {});
}

async function get_event(connection, id) {
  var revalidate = make_revalidate_event(connection, id);
  return await read_event(connection, id, revalidate);
}

function admin_event_to_api(event) {
  var copy = Object.assign({}, event);

  if (event.skipped_zones)
    copy.skipped_zones = skipped_zones_list(event.skipped_zones);

  return copy;
}

function admin_event_from_api(event) {
  if (event)
    event.skipped_zones = skipped_zones_hash(event.skipped_zones || []);
}

async function admin_get_event(connection, id) {
  var event = await get_event(connection, id);
  return admin_event_to_api(event);
}

function make_revalidate_rider(id, number, version) {
  var valid;

  return async function() {
    if (valid != null)
      return valid;

    let riders = cache.get_riders(id) || {};
    let cached_version = (riders[number] || {}).version;
    valid = (cached_version == version);
    return valid;
  };
}

async function read_riders(connection, id, revalidate, number) {
  var filters = ['id = ' + connection.escape(id)];
  if (number)
    filters.push('number = ' + connection.escape(number));
  filters = filters.join(' AND ');

  var group_filters = ['id = ' + connection.escape(id)];
  if (number)
    group_filters.push('group_number = ' + connection.escape(number));
  group_filters = group_filters.join(' AND ');

  let riders = cache.get_riders(id);
  if (riders && (!revalidate || await revalidate()))
    return riders;

  riders = {};

  (await connection.queryAsync(`
    SELECT *
    FROM riders
    WHERE ` + filters)
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
    row.future_starts = {};
  });

  (await connection.queryAsync(`
    SELECT number, round, zone, marks
    FROM marks
    WHERE ` + filters)
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
    WHERE ` + filters)
  ).forEach((row) => {
    if (riders[row.number])
      riders[row.number].marks_per_round[row.round - 1] = row.marks;
  });

  (await connection.queryAsync(`
    SELECT group_number, number
    FROM riders_groups
    WHERE ` + group_filters)
  ).forEach((row) => {
    try {
      riders[row.group_number].riders.push(row.number);
    } catch (_) { }
  });

  (await connection.queryAsync(`
    SELECT ranking, number, rank, score
    FROM rider_rankings
    WHERE ` + filters)
  ).forEach((row) => {
    var rider = riders[row.number];
    if (rider) {
      rider.rankings[row.ranking - 1] = {rank: row.rank, score: row.score};
    }
  });

  (await connection.queryAsync(`
    SELECT fid, number
    FROM future_starts
    JOIN riders using (id, rider_tag)
    WHERE ` + filters)
  ).forEach((row) => {
    var rider = riders[row.number];
    if (rider)
      rider.future_starts[row.fid] = true;
  });

  if (number) {
    var rider = riders[number];
    cache.set_rider(id, number, rider);
  } else {
    cache.set_riders(id, riders);
  }
  return riders;
}

async function read_rider(connection, id, number, revalidate) {
  var riders = await read_riders(connection, id, revalidate, number);
  return riders[number];
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

async function get_rider(connection, id, number, params, direction, event) {
  var filters = [`id = ?`];
  var args = [id];
  var order_limit = '';

  if (!params)
    params = {};
  if (params.start) {
    if (event && event.features.registered)
      filters.push('(registered AND start)');
    else
      filters.push('start');
  }
  if (direction != null) {
    var or = ['number >= 0', 'start', '`group`'];
    if (event) {
      if (event.features.registered)
	or.push('registered');
      or.push('rider_tag IN (SELECT rider_tag FROM future_events ' +
	        'JOIN future_starts USING (id, fid) ' +
		'WHERE id = ' + connection.escape(id) + ' AND active)');
    }
    filters.push('(' + or.join(' OR ') + ')');
  }
  if (params.group != null) {
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
  if (rows.length != 1) {
    if (!Object.keys(params).length && !direction)
      throw new HTTPError(404, 'Not Found');
    return null;
  }

  number = rows[0].number;
  let revalidate = make_revalidate_rider(id, number, rows[0].version);
  return await read_rider(connection, id, number, revalidate);
}

async function admin_rider_to_api(connection, id, rider, event) {
  rider = Object.assign({}, rider);

  if (rider.group) {
    var group = rider;
    var classes = {};
    for (let number of group.riders) {
      let rider = await get_rider(connection, id, number);
      if (rider && (!event.features.registered || rider.registered) && rider.start)
	classes[rider.class] = true;
    }
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

function admin_rider_from_api(rider) {
  if (rider) {
    if (rider.rankings) {
      rider.rankings = rider.rankings.map(
        (ranking) => ranking ? {rank: null, score: null} : null
      );
    }
  }
  return rider;
}

async function admin_get_rider(connection, id, number, params, direction) {
  let event = await get_event(connection, id);
  let rider = await get_rider(connection, id, number, params, direction, event);
  if (!rider)
    return {};

  return await admin_rider_to_api(connection, id, rider, event);
}

function strcmp(a, b) {
  a = (a || '').latinize();
  b = (b || '').latinize();
  return (a < b) ? -1 : (a > b) ? 1 : 0;
}

async function get_riders(connection, id) {
  let revalidate = make_revalidate_riders(connection, id);
  return await read_riders(connection, id, revalidate);
}

async function find_riders(connection, id, params) {
  var riders = await get_riders(connection, id);
  var term = (params.term || '').trim();
  if (term == '')
    return {};

  function rider_applies(rider) {
    return (params.group === undefined || +rider.group == +params.group) &&
	   (!params.active || rider.group || rider.number >= 0 || rider.start || rider.registered);
  }

  let found = [];
  if (riders[term]) {
    if (rider_applies(riders[term]))
      found.push(+term);
  } else {
    term = new RegExp(
      '\\b' +
      term.latinize()
	.replace(/[[+?\\.|^$({]/g, '\\$&')
	.replace(/\*/g, '.*')
	.replace(/\s+/g, '.*\\b'),
      'i'
    );

    Object.values(riders).forEach((rider) => {
      if (!rider_applies(rider))
	return;

      var first_name = (rider.first_name || '').latinize();
      var last_name = (rider.last_name || '').latinize();

      if ((first_name + ' ' + last_name).match(term) ||
	  (last_name + ' ' + first_name).match(term) ||
	  (rider.email || '').latinize().match(term))
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

async function delete_rider(connection, id, number) {
  let query;

  query = 'DELETE future_starts ' +
          'FROM future_starts ' +
	  'JOIN riders USING (id, rider_tag) ' +
	  'WHERE id = ' + connection.escape(id) +
	    ' AND number = ' + connection.escape(number);
  log_sql(query);
  await connection.queryAsync(query);

  for (let table of ['riders', 'riders_groups', 'rider_rankings', 'marks',
		     'rounds', 'new_numbers']) {
    query = 'DELETE FROM ' + connection.escapeId(table) +
	    ' WHERE id = ' + connection.escape(id) +
	      ' AND number = ' + connection.escape(number);
    log_sql(query);
    await connection.queryAsync(query);
  }

  query = 'DELETE FROM riders_groups' +
	  ' WHERE id = ' + connection.escape(id) +
	    ' AND group_number = ' + connection.escape(number);
  log_sql(query);
  await connection.queryAsync(query);
  cache.delete_rider(id, number);
}

async function rider_change_number(connection, id, old_number, new_number) {
  let query;

  for (let table of ['riders', 'riders_groups', 'rider_rankings', 'marks',
		     'rounds']) {
    query = 'UPDATE ' + connection.escapeId(table) +
	    ' SET number = ' + connection.escape(new_number) +
	    ' WHERE id = ' + connection.escape(id) +
	      ' AND number = ' + connection.escape(old_number);
    log_sql(query);
    await connection.queryAsync(query);
  }

  query = 'UPDATE riders_groups' +
	  ' SET group_number = ' + connection.escape(new_number) +
	  ' WHERE id = ' + connection.escape(id) +
	    ' AND group_number = ' + connection.escape(old_number);
  log_sql(query);
  await connection.queryAsync(query);

  for (let riders of [cache.saved_riders[id], cache.cached_riders[id]]) {
    if (riders) {
      var old_rider = riders[old_number];
      if (old_rider) {
	delete riders[old_number];
	old_rider.number = new_number;
	riders[new_number] = old_rider;
      }
    }
  }
}

async function admin_save_rider(connection, id, number, rider, tag, query) {
  rider = admin_rider_from_api(rider);

  await cache.begin(connection);
  try {
    var event = await get_event(connection, id);
    if (event.version != query.event_version)
      throw new HTTPError(409, 'Conflict');

    await get_riders(connection, id);
    var old_rider;
    if (number != null) {
      old_rider = await get_rider(connection, id, number);
      if (rider && rider.number === undefined)
	rider.number = number;
    } else {
      if (rider.marks_per_zone === undefined)
	rider.marks_per_zone = [];
    }
    if (rider && rider.number == null) {
      var result = await connection.queryAsync(`
        SELECT COALESCE(MIN(number), 0) - 1 AS number
	FROM riders
	WHERE id = ?`, [id]);
      rider.number = result[0].number;
      if (number == null)
	number = rider.number;
    }

    let version = query.version;
    if (rider && version == null)
      version = rider.version;
    if (old_rider) {
      if (old_rider.version != version)
	throw new HTTPError(409, 'Conflict');
    }

    if (rider && rider.number != number) {
      await rider_change_number(connection, id, number, rider.number);
      number = rider.number;
    }

    if (rider && rider.rider_tag == null)
      rider.rider_tag = random_tag();

    if (rider) {
      if (!old_rider && !rider.rankings && event.ranking1_enabled)
	rider.rankings = [{"rank":null, "score":null}];
      rider = Object.assign(cache.modify_rider(id, number), rider);
    } else {
      await delete_rider(connection, id, number);
    }

    event = cache.modify_event(id);
    event.mtime = moment().format('YYYY-MM-DD HH:mm:ss');

    compute_event(cache, id, event);

    /* When verifying a rider, also verify the user so that future changes by
       that user will not need verification in the future.  */
    var user_tag = (rider && rider.user_tag) ||
		   (old_rider && old_rider.user_tag);
    if (user_tag && rider && rider.verified) {
      await connection.queryAsync(`
	UPDATE users
	SET verified = 1
	WHERE user_tag = ?
      `, [user_tag]);
    }

    await cache.commit(connection);
    if (!old_rider) {
      /* Reload from database to get any default values defined there.  */
      rider = await read_rider(connection, id, number, () => {});
    }

    if (rider)
      return await admin_rider_to_api(connection, id, rider, event);
  } catch (err) {
    await cache.rollback(connection);
    throw err;
  }
}

function event_reset_numbers(riders) {
  let min_number = Math.min(0, Math.min.apply(this, Object.keys(riders)));

  for (let number in riders) {
    if (number >= 0) {
      min_number--;
      let rider = riders[number];
      rider.number = min_number;
      delete riders[number];
      riders[min_number] = rider;
    }
  }
}

function reset_event(base_event, base_riders, event, riders, reset) {
  if (reset == 'master' || reset == 'register' || reset == 'start_times' || reset == 'start') {
    Object.values(riders).forEach((rider) => {
      rider.finish_time = null;
      rider.tie_break = 0;
      rider.rounds = null;
      rider.failure = 0;
      rider.additional_marks = null;
      rider.marks = null;
      rider.marks_per_zone = [];
      rider.marks_per_round = [];
      rider.marks_distribution = [];
      rider.rank = null;
      rider.rankings = rider.rankings.map(
        (ranking) => ranking && {rank: null, score: null}
      );
    });
    event.skipped_zones = [];
  }

  if (reset == 'start_times') {
    set_start_times(event, riders);
  }

  if (reset == 'master' || reset == 'register') {
    Object.values(riders).forEach((rider) => {
      rider.registered = false;
      rider.start = false;
      rider.start_time = null;
      rider.entry_fee = null;
      rider.rider_comment = null;
    });
    Object.keys(riders).forEach((number) => {
      if (riders[number].group)
	delete riders[number];
    });
  }

  if (reset == 'register' && event.base && event.base_fid) {
    let fid = event.base_fid;

    /* Change base_riders to be indexed by rider_tag */
    base_riders = Object.values(base_riders).reduce(
      (riders, rider) => {
	let rider_tag = rider.rider_tag;
	if (rider_tag)
	  riders[rider_tag] = rider;
	return riders;
      }, {});

    let future_event = base_event.future_events.find(
      (future_event) => future_event.fid == fid);
    let active = (future_event || {}).active;
    Object.values(riders).forEach((rider) => {
      let base_rider = base_riders[rider.rider_tag];
      if (base_rider) {
	if (base_rider.future_starts[fid]) {
	  rider.start = true;
	  if (base_rider.registered && active)
	    rider.registered = true;
	}
      }
    });
  }

  if (reset == 'master') {
    event_reset_numbers(riders);
    Object.values(riders).forEach((rider) => {
      rider.future_starts = {};
      rider.license = null;
    });
    event.base = null;
  }
}

async function event_tag_to_id(connection, tag, email) {
  let result = await connection.queryAsync(`
    SELECT id, events_all_admins.email AS email
    FROM (
      SELECT id, ? as email from events
      WHERE tag = ?
    ) AS _
    LEFT JOIN events_all_admins USING (id, email)`,
    [email, tag]);
  if (result.length != 1)
    return new HTTPError(404, 'Not Found');
  if (result[0].email == null)
    return new HTTPError(403, 'Forbidden');
  return result[0].id;
}

async function admin_reset_event(connection, id, query, email) {
  await cache.begin(connection);
  var event = await get_event(connection, id);
  var riders = await get_riders(connection, id);

  if (query.version && event.version != query.version)
    throw new HTTPError(409, 'Conflict');

  event = cache.modify_event(id);
  riders = cache.modify_riders(id);

  try {
    if (query.reset == 'master') {
      let min_number = Math.min(0, Math.min.apply(this, Object.keys(riders)));
      for (let number of Object.keys(riders)) {
	if (number >= 0) {
	  min_number--;
	  await rider_change_number(connection, id, number, min_number);
	}
      }
    }

    let base_event, base_riders;

    if (query.reset == 'register' && event.base && event.base_fid) {
      let base_id = await event_tag_to_id(connection, event.base, email);
      base_event = await get_event(connection, base_id);
      base_riders = await get_riders(connection, base_id);
    }

    reset_event(base_event, base_riders, event, riders, query.reset);

    if (query.reset == 'master') {
      await connection.queryAsync(`
	DELETE FROM new_numbers
	WHERE id = ?`, [id]);
    }
    await cache.commit(connection);
  } catch (err) {
    await cache.rollback(connection);
    throw err;
  }
}

async function inherit_rights_from_event(connection, id, base_id) {
  await connection.queryAsync(`
    INSERT INTO events_admins (id, user, read_only)
    SELECT ?, user, read_only
    FROM events_admins_inherit
    WHERE id = ?`, [id, base_id]);

  await connection.queryAsync(`
    INSERT INTO events_admins_inherit (id, user, read_only)
    SELECT ?, user, read_only
    FROM events_admins_inherit
    WHERE id = ?`, [id, base_id]);

  await connection.queryAsync(`
    INSERT INTO events_groups (id, `+'`group`'+`, read_only)
    SELECT ?, `+'`group`'+`, read_only
    FROM events_groups_inherit
    WHERE id = ?`, [id, base_id]);

  await connection.queryAsync(`
    INSERT INTO events_groups_inherit (id, `+'`group`'+`, read_only)
    SELECT ?, `+'`group`'+`, read_only
    FROM events_groups_inherit
    WHERE id = ?`, [id, base_id]);
}

async function add_event_write_access(connection, id, email) {
  await connection.queryAsync(`
    INSERT INTO events_admins (id, user, read_only)
    SELECT ?, user, 0
    FROM users
    WHERE email = ?
    ON DUPLICATE KEY UPDATE read_only = 0`,
    [id, email]);
}

async function add_serie_write_access(connection, serie, email) {
  await connection.queryAsync(`
    INSERT INTO series_admins (serie, user, read_only)
    SELECT ?, user, 0
    FROM users
    WHERE email = ?
    ON DUPLICATE KEY UPDATE read_only = 0`,
    [serie, email]);
}

function copy_event(event) {
  return Object.assign({}, event);
}

function copy_riders(riders) {
  return Object.values(riders).reduce(
    (riders, rider) => {
      riders[rider.number] = Object.assign({}, rider);
      return riders;
    }, {});
}

async function inherit_from_event(connection, id, base_id, reset, email) {
  var event = copy_event(await get_event(connection, base_id));
  var riders = copy_riders(await get_riders(connection, base_id));

  /* Only events imported from TrialTool don't have the skipped_zones feature
     set.  */
  event.features.skipped_zones = true;

  Object.assign(cache.modify_event(id), event);
  for (let number in riders)
    Object.assign(cache.modify_rider(id, number), riders[number]);

  if (reset != 'master') {
    await connection.queryAsync(`
      INSERT INTO new_numbers (serie, id, number, new_number)
      SELECT serie, ?, number, new_number
      FROM new_numbers
      JOIN series_all_admins USING (serie)
      WHERE id = ? AND email = ? AND NOT COALESCE(read_only, 0)`,
      [id, base_id, email]);
  }

  await connection.queryAsync(`
    INSERT INTO series_events (serie, id)
    SELECT serie, ?
    FROM series_events
    JOIN series_all_admins USING (serie)
    WHERE id = ? AND email = ? AND NOT COALESCE(read_only, 0)`,
    [id, base_id, email]);

  await inherit_rights_from_event(connection, id, base_id);
}

async function delete_event(connection, id) {
  for (let table of ['events', 'classes', 'rankings', 'card_colors', 'scores',
		     'zones', 'skipped_zones', 'event_features',
		     'events_admins', 'events_admins_inherit', 'events_groups',
		     'events_groups_inherit', 'riders', 'riders_groups',
		     'rider_rankings', 'marks', 'rounds', 'series_events',
		     'new_numbers', 'result_columns',
		     'future_events', 'future_starts']) {
    let query = 'DELETE FROM ' + connection.escapeId(table) +
		' WHERE id = ' + connection.escape(id);
    log_sql(query);
    await connection.queryAsync(query);
  }
  cache.delete_event(id);
  cache.delete_riders(id);
}

function future_event_ids_equal(old_event, event) {
  function fid_map(event) {
    if (!event)
      return {};
    return event.future_events.reduce((map, future_event) => {
      let fid = future_event.fid;
      if (fid)
	map[fid] = true;
      return map;
    }, {});
  }
  return deepEqual(fid_map(old_event), fid_map(event));
}

/* Delete future_starts for all removed future_events */
async function reduce_future_starts(event, riders) {
  let future_events = {};
  event.future_events.forEach((future_event) => {
    let fid = future_event.fid;
    if (fid)
      future_events[fid] = true;
  });

  Object.values(riders).forEach((rider) => {
    var future_starts = Object.assign({}, rider.future_starts);
    Object.keys(future_starts).forEach((fid) => {
      if (!future_events[fid]) {
	delete future_starts[fid];
	rider.future_starts = future_starts;
      }
    });
  });
}

async function admin_save_event(connection, id, event, version, reset, email) {
  admin_event_from_api(event);

  await cache.begin(connection);
  try {
    var old_event;
    if (id) {
      old_event = await get_event(connection, id);
      await get_riders(connection, id);
    } else {
      var result = await connection.queryAsync(`
        SELECT COALESCE(MAX(id), 0) + 1 AS id
	FROM events`);
      id = result[0].id;
    }

    if (event && version == null)
      version = event.version;
    if (old_event && version) {
      if (old_event.version != version)
	throw new HTTPError(409, 'Conflict');
    }

    if (event) {
      let base_id;
      if (event.base)
        base_id = await event_tag_to_id(connection, event.base, email);

      if (!old_event) {
	event.tag = random_tag();
	if (event.base)
	  await inherit_from_event(connection, id, base_id, reset, email);
	await add_event_write_access(connection, id, email);
      }
      event.mtime = moment().format('YYYY-MM-DD HH:mm:ss');
      event = Object.assign(cache.modify_event(id), event);

      if (reset) {
	let base_event = await get_event(connection, base_id);
	let base_riders = await get_riders(connection, base_id);
	if (old_event)
	  await get_riders(connection, id);
	let riders = cache.modify_riders(id);
	reset_event(base_event, base_riders, event, riders, reset);
      }

      if (!future_event_ids_equal(old_event, event)) {
	if (old_event)
	  await get_riders(connection, id);
	let riders = cache.modify_riders(id);
	await reduce_future_starts(event, riders);
      }

      compute_event(cache, id, event);
    } else {
      await delete_event(connection, id);
    }

    await cache.commit(connection);
    if (!old_event) {
      /* Reload from database to get any default values defined there.  */
      event = await read_event(connection, id, () => {});
    }

    if (event)
      return admin_event_to_api(event);
  } catch (err) {
    await cache.rollback(connection);
    throw err;
  }
}

async function __update_serie(connection, serie_id, old_serie, new_serie) {
  var changed = false;

  if (!old_serie)
    old_serie = {};
  if (!new_serie)
    new_serie = {};

  function hash_events(events) {
    if (!events)
      return {};
    return events.reduce((hash, id) => {
      hash[id] = true;
      return hash;
    }, {});
  }

  await zipHashAsync(
    hash_events(old_serie.events), hash_events(new_serie.events),
    async function(a, b, id) {
      await update(connection, 'series_events',
        {serie: serie_id, id: id},
	[],
	a != null && {}, b != null && {})
      && (changed = true);
    });

  function hash_classes(classes) {
    if (!classes)
      return {};
    return classes.reduce((hash, cls) => {
      hash[cls['class']] = cls;
      return hash;
    }, {});
  }

  await zipHashAsync(
    hash_classes(old_serie.classes), hash_classes(new_serie.classes),
    async function(a, b, ranking_class) {
      await update(connection, 'series_classes',
        {serie: serie_id, ranking_class: ranking_class},
        ['events', 'drop_events'],
        a, b)
      && (changed = true);
    });

  await zipHashAsync(old_serie.new_numbers, new_serie.new_numbers,
    async function(a, b, id) {
      await zipHashAsync(a, b, async function(a, b, number) {
	await update(connection, 'new_numbers',
	  {serie: serie_id, id: id, number: number},
	  ['new_number'],
	  a, b,
	  (new_number) => (new_number !== undefined &&
			   {number: number, new_number: new_number}))
	&& (changed = true);
      });
    });

  await zipHashAsync(
    old_serie.tie_break, new_serie.tie_break,
    async function(a, b, number) {
      await update(connection, 'series_tie_break',
        {serie: serie_id, number: number},
        ['tie_break'],
        a, b,
	(x) => (x != null ? {tie_break: x} : null))
      && (changed = true);
    });

  return changed;
}

async function update_serie(connection, serie_id, old_serie, new_serie) {
  var changed = false;

  await __update_serie(connection, serie_id, old_serie, new_serie)
    && (changed = true);

  var ignore_fields = {
    events: true,
    classes: true,
    new_numbers: true,
    version: true,
    tie_break: true
  };

  var nonkeys = Object.keys(new_serie || {}).filter(
    (field) => !(field in ignore_fields)
  );

  if (!changed && old_serie && new_serie) {
    for (let field of nonkeys) {
      if (old_serie[field] != new_serie[field]) {
	changed = true;
	break;
      }
    }
  }

  if (new_serie) {
    if (changed) {
      nonkeys.push('version');
      new_serie.version = old_serie ? old_serie.version + 1 : 1;
    }
  }

  await update(connection, 'series',
    {serie: serie_id},
    nonkeys,
    old_serie, new_serie);
}

async function save_serie(connection, serie_id, serie, version, email) {
  var old_serie;
  if (serie_id) {
    old_serie = await get_serie(connection, serie_id);
  } else {
    var result = await connection.queryAsync(`
      SELECT COALESCE(MAX(serie), 0) + 1 AS serie
      FROM series`);
    serie_id = result[0].serie;
  }

  if (old_serie && version == null)
    version = old_serie.version;
  if (serie && version) {
    if (serie.version != version)
      throw new HTTPError(409, 'Conflict');
  }

  if (serie) {
    if (!old_serie) {
      if (!serie.tag)
        serie.tag = random_tag();

      if (email)
	await add_serie_write_access(connection, serie_id, email);
    }
    await update_serie(connection, serie_id, old_serie, serie);
    return serie_id;
  } else {
    for (let table of ['series', 'series_classes', 'series_events',
		       'series_admins', 'series_groups',
		       'series_scores']) {
      let query =
	'DELETE FROM ' + connection.escapeId(table) +
	' WHERE serie = ' + connection.escape(serie_id);
      log_sql(query);
      await connection.queryAsync(query);
    }
  }
}

async function admin_save_serie(connection, serie_id, serie, version, email) {
  await connection.queryAsync('BEGIN');
  try {
    serie_id = await save_serie(connection, serie_id, serie, version, email);
    await connection.queryAsync('COMMIT');

    if (serie_id != null)
      return await get_serie(connection, serie_id);
  } catch (err) {
    await connection.queryAsync('ROLLBACK');
    throw err;
  }
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
  var riders = await get_riders(connection, id);
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
  var riders = await get_riders(connection, id);

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
  var riders = await get_riders(connection, id);

  var list = [];

  Object.values(riders).forEach((rider) => {
    var r = {
      rankings: []
    };
    ['city', 'class', 'club', 'country', 'date_of_birth', 'email', 'entry_fee',
    'failure', 'finish_time', 'first_name', 'group', 'insurance', 'last_name',
    'license', 'non_competing', 'number', 'phone', 'province', 'registered',
    'riders', 'rounds', 'start', 'start_time', 'street', 'vehicle',
    'year_of_manufacture', 'zip', 'guardian', 'comment', 'rider_comment', 'verified',
    'future_starts'].forEach(
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

var rider_public_fields = [
  'club', 'country', 'first_name', 'last_name', 'province', 'vehicle',
  'year_of_manufacture'
];

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

    if (!rider.start ||
        (!rider.registered && event.features.registered) ||
        (!rider.verified && event.features.verified))
      return;

    var r = {};

    rider_public_fields.concat([
      'additional_marks', 'failure', 'marks', 'marks_distribution',
      'marks_per_round', 'marks_per_zone', 'non_competing', 'number', 'rank',
      'rankings'
    ]).forEach(
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
	// I'm having trouble getting babel to substitute the spread operator
	// on node v4.6.1.  Use push.apply instead for now:
	//rs[rc].push(...riders_per_class[class_]);
	Array.prototype.push.apply(rs[rc], riders_per_class[class_]);
      }
    });
    return rs;
  })();

  hash.event = {};
  ['title', 'subtitle', 'equal_marks_resolution', 'mtime', 'four_marks',
   'date', 'split_score', 'features', 'type', 'result_columns'].forEach(
    (field) => { hash.event[field] = event[field]; }
  );

  hash.event.classes = [];
  hash.event.zones = [];
  Object.keys(riders_per_class).forEach((class_) => {
    let hash_event_class = hash.event.classes[class_ - 1] = {};
    let event_class = event.classes[class_ - 1];
    ['rounds', 'color', 'name', 'order'].forEach((field) => {
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

function zip(a, b, func) {
  if (!a)
    a = [];
  if (!b)
    b = [];
  var length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++)
    func(a[index], b[index], index);
}

function zipHash(a, b, func) {
  if (!a)
    a = {};
  if (!b)
    b = {};
  for (let key in a) {
    func(a[key], b[key], key);
  }
  for (let key in b) {
    if (!(key in a))
      func(undefined, b[key], key);
  }
}

async function zipAsync(a, b, func) {
  if (!a)
    a = [];
  if (!b)
    b = [];
  var length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++)
    await func(a[index], b[index], index);
}

async function zipHashAsync(a, b, func) {
  if (!a)
    a = {};
  if (!b)
    b = {};
  for (let key in a) {
    await func(a[key], b[key], key);
  }
  for (let key in b) {
    if (!(key in a))
      await func(undefined, b[key], key);
  }
}

async function update(connection, table, keys, nonkeys, old_values, new_values, map_func) {
  function assign(object, old_object) {
    return function(field) {
      return connection.escapeId(field) + ' = ' +
	     (old_object ? '/* ' + connection.escape(old_object[field]) + ' */ ' : '') +
	     connection.escape(object[field]);
    };
  }

  if (map_func) {
    old_values = map_func(old_values);
    new_values = map_func(new_values);
  }

  var query;
  if (!old_values) {
    if (!new_values)
      return false;

    let fields = [];
    Array.prototype.push.apply(fields, Object.keys(keys).map(assign(keys)));
    Array.prototype.push.apply(fields, nonkeys.map(assign(new_values)));

    query = 'INSERT INTO ' + connection.escapeId(table) +
	    ' SET ' + fields.join(', ');
  } else {
    if (!new_values) {
      query =
        'DELETE FROM ' + connection.escapeId(table) +
	' WHERE ' + Object.keys(keys).map(assign(keys)).join(' AND ');
    } else {
      var fields = [];
      for (let field of nonkeys) {
	if (old_values[field] != new_values[field]) {
	  fields.push(assign(new_values, old_values)(field));
	}
      }
      if (!fields.length)
	return false;

      query =
        'UPDATE ' + connection.escapeId(table) +
	' SET ' + fields.join(', ') +
	' WHERE ' + Object.keys(keys).map(assign(keys)).join(' AND ');
    }
  }
  log_sql(query);
  await connection.queryAsync(query);
  return true;
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
  return !deepEqual(map(a.rankings || []), map(b.rankings || []));
}

async function __update_rider(connection, id, number, old_rider, new_rider) {
  var changed = false;

  if (!old_rider)
    old_rider = {};
  if (!new_rider)
    new_rider = {};

  changed = changed || rankings_added_or_removed(old_rider, new_rider);
  await zipAsync(old_rider.rankings, new_rider.rankings,
    async function(a, b, index) {
      await update(connection, 'rider_rankings',
	{id: id, number: number, ranking: index + 1},
	['rank', 'score'],
	a, b);
    });

  await zipAsync(old_rider.marks_per_zone, new_rider.marks_per_zone,
    async function(a, b, round_index) {
      await zipAsync(a, b, async function(a, b, zone_index) {
	await update(connection, 'marks',
	  {id: id, number: number, round: round_index + 1, zone: zone_index + 1},
	  ['marks'],
	  a, b,
	  (x) => (x != null ? {marks: x} : null))
	&& (changed = true);
      });
    });

  await zipAsync(old_rider.marks_per_round, new_rider.marks_per_round,
    async function(a, b, index) {
      await update(connection, 'rounds',
	{id: id, number: number, round: index + 1},
	['marks'],
	a, b,
	(x) => (x != null ? {marks: x} : null))
      && (changed = true);
    });

  function hash_riders(riders) {
    if (!riders)
      return {};
    return riders.reduce((hash, id) => {
      hash[id] = true;
      return hash;
    }, {});
  }

  await zipHashAsync(
    hash_riders(old_rider.riders), hash_riders(new_rider.riders),
    async function(a, b, rider_number) {
      await update(connection, 'riders_groups',
	{id: id, group_number: number, number: rider_number},
	[],
	a != null && {}, b != null && {})
      && (changed = true);
    });

  if (!deepEqual(old_rider.future_starts, new_rider.future_starts))
    changed = true;

  return changed;
}

async function update_rider(connection, id, number, old_rider, new_rider) {
  var real_new_rider = new_rider;
  var changed = false;

  await __update_rider(connection, id, number, old_rider, new_rider)
    && (changed = true);

  /* FIXME: Remove fields s0..s5 from table riders and calculate them on
     demand. Get rid of real_new_rider, flatten_marks_distribution, and the
     object copying here.  */

  if (old_rider) {
    old_rider = Object.assign({}, old_rider);
    flatten_marks_distribution(old_rider);
  }

  if (new_rider) {
    new_rider = Object.assign({}, new_rider);
    flatten_marks_distribution(new_rider);
  }

  var ignore_fields = {
    classes: true,
    future_starts: true,
    marks_distribution: true,
    marks_per_round: true,
    marks_per_zone: true,
    number: true,
    rankings: true,
    riders: true,
    version: true,
  };

  var nonkeys = Object.keys(new_rider || {}).filter(
    (field) => !(field in ignore_fields)
  );

  if (!changed && old_rider && new_rider) {
    for (let field of nonkeys) {
      if (old_rider[field] != new_rider[field]) {
	changed = true;
	break;
      }
    }
  }

  if (changed && new_rider) {
    nonkeys.push('version');
    new_rider.version = old_rider ? old_rider.version + 1 : 1;
    real_new_rider.version = new_rider.version;
  }

  await update(connection, 'riders',
    {id: id, number: number},
    nonkeys,
    old_rider, new_rider);
}

async function __update_event(connection, id, old_event, new_event) {
  var changed = false;

  if (!old_event)
    old_event = {};
  if (!new_event)
    new_event = {};

  await zipAsync(old_event.classes, new_event.classes,
    async function(a, b, index) {
      await update(connection, 'classes',
	{id: id, 'class': index + 1},
	b ? Object.keys(b) : [],
	a, b)
      && (changed = true);
    });

  await zipAsync(old_event.rankings, new_event.rankings,
    async function(a, b, index) {
      await update(connection, 'rankings',
	{id: id, ranking: index + 1},
	b ? Object.keys(b) : [],
	a, b)
      && (changed = true);
    });

  await zipAsync(old_event.card_colors, new_event.card_colors,
    async function(a, b, index) {
      await update(connection, 'card_colors',
	{id: id, round: index + 1},
	['color'],
	a, b,
	(color) => (color != null && {color: color}))
      && (changed = true);
    });

  await zipAsync(old_event.scores, new_event.scores,
    async function(a, b, index) {
      await update(connection, 'scores',
	{id: id, rank: index + 1},
	['score'],
	a, b,
	(score) => (score != null && {score: score}))
      && (changed = true);
    });

  await zipAsync(old_event.result_columns, new_event.result_columns,
    async function(a, b, index) {
      await update(connection, 'result_columns',
	{id: id, n: index + 1},
	['name'],
	a, b,
	(name) => (name != null && {name: name}))
      && (changed = true);
    });

  if (new_event.future_events) {
    let max_fid;
    for (let future_event of new_event.future_events) {
      if (future_event.fid == null) {
	if (max_fid == null) {
	  max_fid = (await connection.queryAsync(`
	    SELECT COALESCE(MAX(fid), 0) AS max_fid
	    FROM future_events
	    WHERE id = ?`, [id]))[0].max_fid;
	}
	max_fid++;
	future_event.fid = max_fid;
      }
    }
  }

  function hash_future_events(future_events) {
    if (!future_events)
      return {};
    return future_events.reduce((hash, future_event) => {
      hash[future_event.fid] = future_event;
      return hash;
    }, {});
  }

  await zipHashAsync(hash_future_events(old_event.future_events),
		     hash_future_events(new_event.future_events),
    async function(a, b, fid) {
      await update(connection, 'future_events',
		   {id: id, fid: fid},
		   ['active', 'date', 'title', 'series'],
		   a, b)
      && (changed = true);
    });

  function hash_zones(zones) {
    if (!zones)
      return {};
    return zones.reduce((hash, section) => {
      hash[section] = true;
      return hash;
    }, {});
  }

  await zipAsync(old_event.zones, new_event.zones,
    async function(a, b, class_index) {
      await zipHashAsync(hash_zones(a), hash_zones(b),
        async function(a, b, zone) {
	  await update(connection, 'zones',
	    {id: id, 'class': class_index + 1, zone: zone},
	    [],
	    a && {}, b && {})
	  && (changed = true);
	});
    });

  await zipHashAsync(old_event.skipped_zones, new_event.skipped_zones,
    async function(a, b, class_) {
      await zipHashAsync(a, b,
        async function(a, b, round) {
	  await zipHashAsync(a, b,
	    async function(a, b, zone) {
	      await update(connection, 'skipped_zones',
		{id: id, 'class': class_, round: round, zone: zone},
		[],
		a && {}, b && {})
	      && (changed = true);
	    });
	});
    });

  await zipHashAsync(old_event.features, new_event.features,
    async function(a, b, feature) {
      await update(connection, 'event_features',
	{id: id, feature: feature},
	[],
	a && {}, b && {})
      && (changed = true);
    });

  return changed;
}

async function update_event(connection, id, old_event, new_event) {
  var changed = false;

  await __update_event(connection, id, old_event, new_event)
    && (changed = true);

  var ignore_fields = {
    id: true,
    classes: true,
    rankings: true,
    card_colors: true,
    scores: true,
    zones: true,
    skipped_zones: true,
    features: true,
    mtime: true,
    version: true,
    result_columns: true,
    future_events: true,
    series: true
  };

  var nonkeys = Object.keys(new_event || {}).filter(
    (field) => !(field in ignore_fields)
  );

  if (!changed && old_event && new_event) {
    for (let field of nonkeys) {
      if (old_event[field] != new_event[field]) {
	changed = true;
	break;
      }
    }
  }

  if (new_event) {
    if (changed) {
      nonkeys.push('version');
      new_event.version = old_event ? old_event.version + 1 : 1;
    }

    /* Don't account for mtime changes in the version.  */
    if (!(old_event || {}).mtime != new_event.mtime)
      nonkeys.push('mtime');
  }

  await update(connection, 'events',
    {id: id},
    nonkeys,
    old_event, new_event);

  if (!old_event && new_event) {
    /* Reload from database to get any default values defined there.  */
    await read_event(connection, id, () => {});
  }
}

passport.use('local', new LocalStrategy(
  {
    usernameField: 'email',
    badRequestMessage: 'E-Mail-Adresse oder Kennwort fehlt.'
  },
  (email, password, done) => {
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

const register_event_fields = {
  date: true,
  features: true,
  future_events: true,
  insurance: true,
  registration_ends: true,
  registration_info: true,
  series: true,
  type: true,
  version: true
};

async function register_get_event(connection, id, user) {
  var event = await get_event(connection, id);
  var result = {
    id: id,
    title: event.title,
  };
  Object.keys(register_event_fields).forEach((field) => {
    result[field] = event[field];
  });
  result.classes = [];
  event.classes.forEach((class_, index) => {
    if (class_ && class_.rounds && event.zones[index]) {
      result.classes[index] = {
	name: class_.name,
	ranking_class: class_.ranking_class
      };
    }
  });
  return result;
}

const register_rider_fields = {
  accept_conditions: true,
  applicant: true,
  city: true,
  'class': true,
  club: true,
  country: true,
  date_of_birth: true,
  displacement: true,
  email: true,
  emergency_phone: true,
  first_name: true,
  frame_number: true,
  future_starts: true,
  guardian: true,
  insurance: true,
  last_name: true,
  license: true,
  non_competing: true,
  number: true,
  phone: true,
  province: true,
  registered: true,
  registration: true,
  rider_comment: true,
  start: true,
  street: true,
  vehicle: true,
  version: true,
  year_of_manufacture: true,
  zip: true,
};

function register_filter_rider(rider) {
    var result = {};
    Object.keys(register_rider_fields).forEach((field) => {
      result[field] = rider[field];
    });
    result.rankings = rider.rankings.map(
      (ranking) => !!ranking
    );
    return result;
}

async function register_get_riders(connection, id, user) {
  var rows = await connection.queryAsync(`
    SELECT number
    FROM riders
    WHERE id = ? AND (user_tag = ? OR email = ?) AND NOT COALESCE(`+'`group`'+`, 0)
    ORDER BY last_name, first_name, date_of_birth, number`,
    [id, user.user_tag, user.email]);

  var riders = [];
  for (let row of rows) {
    var rider = await get_rider(connection, id, row.number);
    riders.push(register_filter_rider(rider));
  }

  return riders;
}

/* Return a random 16-character string */
function random_tag() {
  return base64url(crypto.randomBytes(12));
}

function parse_time(time) {
  var match = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (match)
    return (+match[1] * 60 + +match[2]) * 60 + +match[3];
}

function format_time(time) {
  let seconds = time % 60;
  time = Math.trunc(time / 60);
  let minutes = time % 60;
  time = Math.trunc(time / 60);
  let hours = time % 24;
  return ('0' + hours).slice(-2) + ':' +
	 ('0' + minutes).slice(-2) + ':' +
	 ('0' + seconds).slice(-2)
}

function set_start_times(event, riders) {
  if (event.start_time == null)
    throw new HTTPError(400, 'Startzeit in Einstellungen nicht definiert.');
  if (event.start_interval == null)
    throw new HTTPError(400, 'Startintervall in Einstellungen nicht definiert.');
  if (event.start_spec == null)
    throw new HTTPError(400, 'Startklassen in Einstellungen nicht definiert.');

  let start_time = parse_time(event.start_time);
  let start_interval = event.start_interval;
  let tree = start_times.parse(event.start_spec);

  if (tree == null)
    throw new HTTPError(400, 'Startklassen in Einstellungen nicht korrekt gesetzt.');

  function ranking_class(class_) {
    if (class_ != null && event.classes[class_ - 1])
      return event.classes[class_ - 1].ranking_class;
  }

  function riders_in_classes(riders, classes) {
    classes = classes.reduce(function(result, cls) {
      result[cls] = true;
      return result;
    }, {});
    var numbers = [];
    for (let number of Object.keys(riders)) {
      let rider = riders[number];
      if (rider.verified && rider.start &&
	  classes[ranking_class(rider['class'])])
	numbers.push(number);
    };
    return numbers;
  }

  function recursive_set(node) {
    switch(node.op) {
      case '|': // in parallel
	let first_start_time = start_time;
	let last_start_time = first_start_time;
	for (let n = 0; n < node.args.length; n++) {
	  recursive_set(node.args[n]);
	  if (start_time > last_start_time)
	    last_start_time = start_time;
	  start_time = first_start_time;
	}
	start_time = last_start_time;
	break;

      case ' ': // sequential
	for (let n = 0; n < node.args.length; n++) {
	  recursive_set(node.args[n]);
	}
	break;

      default: // class or classes
	var numbers = riders_in_classes(riders, node.args);
	for (let number of random_shuffle(numbers)) {
	  let rider = riders[number];
	  rider.start_time = format_time(start_time);
	  start_time += start_interval;
	};
    }
  }

  for (let rider of Object.values(riders))
    rider.start_time = null;
  recursive_set(tree);
}

async function create_user_secret(connection, email, create_user) {
  var secret = random_tag();
  var expires =
    moment(new Date(Date.now() + 1000 * 60 * 60 * 24 * 3))
    .format('YYYY-MM-DD HH:mm:ss');

  if (create_user) {
    try {
      await connection.queryAsync(`
	INSERT INTO users (user, email, user_tag, secret, secret_expires)
	  SELECT COALESCE(MAX(user), 0) + 1 AS user, ?, ?, ?, ?
	  FROM users
      `, [email, random_tag(), secret, expires]);
    } catch(err) {
      if (err.code == 'ER_DUP_ENTRY')
	return null;
      throw err;
    }
  } else {
    var result = await connection.queryAsync(`
      UPDATE users
      SET secret = ?, secret_expires = ?
      WHERE email = ?
    `, [secret, expires, email]);
    if (result.affectedRows != 1)
      return null;
  }
  return secret;
}

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

function clientErrorHandler(err, req, res, next) {
  if (res.headersSent)
    return next(err);

  if (err instanceof HTTPError) {
    res.status(err.status);
    return res.json({error: err.message});
  }

  console.error(err.stack);
  res.status(500);
  res.json({ error: err });
}

function conn(pool) {
  return function(req, res, next) {
    if (req.conn)
      return next();

    pool.getConnectionAsync()
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

function may_admin(req, res, next) {
  if (!req.user.admin) {
    res.status(403);
    res.json({message: 'Not Authorized'});
  }
  next();
}

function will_read_event(req, res, next) {
  req.conn.queryAsync(`
    SELECT DISTINCT id, events_all_admins.email
    FROM (
      SELECT id, ? AS email
      FROM events
      WHERE id = ? OR tag = ?
    ) AS events
    LEFT JOIN events_all_admins USING (id, email)`,
    [req.user.email, req.params.id, req.params.tag])
  .then((result) => {
    if (result.length != 1)
      return Promise.reject(new HTTPError(404, 'Not Found'));
    if (result[0].email == null)
      return Promise.reject(new HTTPError(403, 'Forbidden'));
    req.params.id = result[0].id;
    next();
  }).catch(next);
}

function will_write_event(req, res, next) {
  req.conn.queryAsync(`
    SELECT DISTINCT id, events_all_admins.email
    FROM (
      SELECT id, ? AS email
      FROM events
      WHERE id = ? OR tag = ?
    ) AS events
    LEFT JOIN (
      SELECT id, email
      FROM events_all_admins
      WHERE NOT COALESCE(read_only, 0)
    ) AS events_all_admins USING (id, email)`,
    [req.user.email, req.params.id, req.params.tag])
  .then((result) => {
    if (result.length != 1)
      return Promise.reject(new HTTPError(404, 'Not Found'));
    if (result[0].email == null)
      return Promise.reject(new HTTPError(403, 'Forbidden'));
    req.params.id = result[0].id;
    next();
  }).catch(next);
}

function will_read_serie(req, res, next) {
  req.conn.queryAsync(`
    SELECT DISTINCT serie, series_all_admins.email
    FROM (
      SELECT serie, ? AS email
      FROM series
      WHERE serie = ? OR tag = ?
    ) AS series
    LEFT JOIN series_all_admins USING (serie, email)`,
    [req.user.email, req.params.serie, req.params.tag])
  .then((result) => {
    if (result.length != 1)
      return Promise.reject(new HTTPError(404, 'Not Found'));
    if (result[0].email == null)
      return Promise.reject(new HTTPError(403, 'Forbidden'));
    req.params.serie = result[0].serie;
    next();
  }).catch(next);
}

function will_write_serie(req, res, next) {
  req.conn.queryAsync(`
    SELECT DISTINCT serie, series_all_admins.email
    FROM (
      SELECT serie, ? AS email
      FROM series
      WHERE serie = ? OR tag = ?
    ) AS series
    LEFT JOIN (
      SELECT serie, email
      FROM series_all_admins
      WHERE NOT COALESCE(read_only, 0)
    ) AS series_all_admins USING (serie, email)`,
    [req.user.email, req.params.serie, req.params.tag])
  .then((result) => {
    if (result.length != 1)
      return Promise.reject(new HTTPError(404, 'Not Found'));
    if (result[0].email == null)
      return Promise.reject(new HTTPError(403, 'Forbidden'));
    req.params.serie = result[0].serie;
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

function login(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    if (err)
      return next(err);
    if (!user || (req.query.admin != null && !user.admin)) {
      var params = {
	mode: 'login',
	email: req.body.email,
	error: (info || {}).message || 'Anmeldung fehlgeschlagen.'
      };
      if (user)
	params.error = 'Benutzer hat keine Administratorrechte.';
      if (req.query.redirect)
	params.query = '?redirect=' + encodeURIComponent(req.query.redirect);
      return res.marko(views['login'], params);
    } else {
      req.logIn(user, function(err) {
	if (err)
	  return next(err);
	next();
      });
    }
  })(req, res, next);
}

async function email_change_password(mode, to, confirmation_url) {
  var params = {
    url: config.url,
    confirmation_url: confirmation_url
  };
  params[mode] = true;
  var message = emails['change-password'].renderToString(params).trim();

  if (!config.from)
    return console.log('> ' + confirmation_url);

  var transporter = nodemailer.createTransport(config.nodemailer);

  await transporter.sendMail({
    date: moment().locale('en').format('ddd, DD MMM YYYY HH:mm:ss ZZ'),
    from: config.from,
    to: to,
    subject: 'TrialInfo - ' +
      (mode == 'signup' ? 'Anmeldung bestätigen' : 'Kennwort zurücksetzen'),
    text: message,
    headers: {
      'Auto-Submitted': 'auto-generated',
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
  console.log('Confirmation email sent to ' + JSON.stringify(to));
}

async function signup_or_reset(req, res, mode) {
  var email = req.body.email;
  var params = {email: email};
  if (!email.match(/^[^@\s]+@[^@\s]+$/)) {
    params.mode = mode;
    if (req.query)
      params.query = query_string(req.query);
    params.error =
      'Die E-Mail-Adresse <em>' +
      html_escape(email) +
      '</em> ist ungültig.';
    return res.marko(views['login'], params);
  }
  var secret = await create_user_secret(req.conn, email, mode == 'signup');
  if (secret) {
    params.secret = secret;
    if (req.query.redirect)
      params.redirect = req.query.redirect;
    if (!config.url)
      config.url = req.protocol + '://' + req.headers.host + '/';
    try {
      await email_change_password(mode, email,
	config.url + 'change-password' + query_string(params));
    } catch (err) {
      console.error(err.stack);
      params.mode = mode;
      if (req.query)
	params.query = query_string(req.query);
      params.error = 'Bestätigungs-E-Mail konnte nicht gesendet werden.';
      return res.marko(views['login'], params);
    }
    if (req.query)
      params.query = query_string(req.query);
    return res.marko(views['confirmation-sent'], params);
  } else {
    var error = 'Die E-Mail-Adresse <em>' +
      html_escape(email) +
      '</em>';
    if (mode == 'signup') {
      error += ' ist bereits registriert.<br>Wenn das Ihre E-Mail-Adresse' +
               ' ist und Sie das Kennwort vergessen haben, können Sie' +
	       ' hier das <em>Kennwort zurücksetzen</em>.';
    } else {
      error += ' ist nicht registriert. Bitte setzen Sie mit <em>Neu ' +
	       ' registrieren</em> fort.';
    }

    params.mode = mode;
    if (req.query)
      params.query = query_string(req.query);
    params.error = error;
    return res.marko(views['login'], params);
  }
}

async function show_change_password(req, res, next) {
  var email = req.query.email;
  var params = {email: email};
  var result = await req.conn.queryAsync(`
    SELECT secret
    FROM users
    WHERE email = ?`, [email]);
  if (result.length == 0) {
    params.mode = 'login';
    params.error =
      'Die E-Mail-Adresse <em>' +
      html_escape(email) +
      '</em> konnte nicht überprüft werden. Bitte versuchen Sie es erneut.';
    if (req.query)
      params.query = query_string(req.query);
    res.marko(views['login'], params);
  } else if (result.length == 1 && result[0].secret != req.query.secret) {
    params.mode = 'login';
    params.error =
      'Der Bestätigungscode für die E-Mail-Adresse <em>' +
      html_escape(email) +
      '</em> ist nicht mehr gültig. Bitte versuchen Sie es erneut.';
    if (req.query)
      params.query = query_string(req.query);
    res.marko(views['login'], params);
  } else {
    var query = {
      email: email,
      secret: req.query.secret
    };
    if (req.query.redirect)
      query.redirect = req.query.redirect;
    params.query = query_string(query);
    res.marko(views['change-password'], params);
  }
}

async function change_password(req, res, next) {
  var secret = req.query.secret;
  var email = req.query.email;
  var new_password = req.body.password;

  var errors = [];
  if (new_password.length < 6)
    errors.push('Das Kennwort muss mindestens 6 Zeichen lang sein.');
  if (email && email.indexOf(new_password) != -1)
    errors.push('Das Kennwort darf nicht in der E-Mail-Adresse enthalten sein.');
  if (errors.length) {
    var query = {
      email: email,
      secret: secret
    };
    if (req.query.redirect)
      query.redirect = req.query.redirect;
    var params = {
      query: query_string(query),
      email: email,
      error: errors.join(' ')
    };
    return res.marko(views['change-password'], params);
  }

  await req.conn.queryAsync('BEGIN');
  var rows = await req.conn.queryAsync(`
    SELECT password, user_tag
    FROM users
    WHERE email = ? AND secret = ? AND secret_expires > NOW()`,
    [email, secret]);
  if (rows.length != 1) {
    var params = {
      mode: 'reset',
      email: email,
      error: 'Ändern des Kennworts ist fehlgeschlagen. Bitte versuchen Sie es erneut.'
    }
    if (req.query.redirect)
      params.query = query_string({redirect: req.query.redirect});
    return res.marko(views['login'], params);
  }

  await req.conn.queryAsync(`
    UPDATE users
    SET password = ?, secret = NULL, secret_expires = NULL
    WHERE email = ?`,
    [apache_md5(new_password), email]);

  if (rows[0].password == null) {
    await req.conn.queryAsync(`
      UPDATE riders
      SET user_tag = ?
      WHERE email = ? AND user_tag IS NULL
    `,
    [rows[0].user_tag, email]);
  }
  await req.conn.queryAsync('COMMIT');

  var user = {
    email: email,
    password: new_password
  };
  req.logIn(user, function(err) {
    if (err)
      return next(err);
    var params = {redirect: req.query.redirect || '/'};
    res.marko(views['password-changed'], params);
  });
}

function html_diff(old_rider, new_rider) {
  var ignore = {
    version: true,
    group: true,
    tie_break: true,
    non_competing: true,
    failure: true,
    additional_marks: true,
    user_tag: true,
    verified: true
  };

  var result = [];
  for (let key of Object.keys(new_rider)) {
    if (key in ignore)
      continue;
    let old_value = old_rider[key];
    let new_value = new_rider[key];
    if (Array.isArray(old_value) || Array.isArray(new_value))
      continue;
    old_value = (old_value == null) ? '' : old_value.toString();
    new_value = (new_value == null) ? '' : new_value.toString();
    let d = diff.diffWordsWithSpace(
      old_value, new_value, {newlineIsToken: true});
    if (d.length)
      result.push({key: key, diff: d});
  }
  for (let key of Object.keys(old_rider)) {
    if (key in ignore)
      continue;
    let old_value = old_rider[key];
    if (key in new_rider || Array.isArray(old_value))
      continue;
    old_value = (old_value == null) ? '' : old_value.toString();
    let d = diff.diffWordsWithSpace(
      old_value, '', {newlineIsToken: true});
    if (d.length)
      result.push({key: key, diff: d});
  }
  if (result.length) {
    function html_encode(str) {
      return str.replace(/[&<>'"]/g, function(c) {
	return "&#" + c.charCodeAt(0) + ";"
      });
    }

    var rows = result.reduce((str, change) => {
      var data = change.diff.reduce((str, op) => {
	let enc = html_encode(op.value);
	return str + (op.added ?
	  '<ins>' + enc + '</ins>' :
	  (op.removed ?
	    '<del>' + enc + '</del>' : enc));
      }, '');
      if (data.length)
	return str + '<tr><th>' + html_encode(change.key) + '</th><td>' + data + '</td></tr>\n';
      else
	return str;
    }, '');

    if (rows)
      return '<table>\n' + rows + '</table>';
  }
}

function atob(str) {
  return new Buffer(str).toString('base64');
}

function rider_email(rider) {
  if (rider.email) {
    var name = [];

    if (rider.first_name != null)
      name.push(rider.first_name);
    if (rider.last_name != null)
      name.push(rider.last_name);

    if (name.length)
      return '=?utf-8?B?' + atob(name.join(' ')) + '?= <' + rider.email + '>';
    else
      return rider.email;
  }
}

async function notify_registration(id, number, old_rider, new_rider, event) {
  var to = event.registration_email;
  if (!config.from || !to)
    return;

  if (new_rider && new_rider.number)
    number = new_rider.number;

  function flatten(rider) {
    rider = Object.assign({}, rider);
    if (rider.future_starts) {
      for (let future_event of event.future_events) {
	if (future_event.date) {
	  rider['start_' + future_event.date] =
	    rider.future_starts[future_event.fid] || false;
	}
      }
      delete rider.future_starts;
    }
    return rider;
  }

  var params = {
    old_rider: flatten(old_rider),
    new_rider: flatten(new_rider),
  };
  params.diff = html_diff(params.old_rider, params.new_rider);

  if (new_rider)
    params.url = config.url + 'admin/event/' + id + '/riders?number=' + number;
  var message = emails['notify-registration'].renderToString(params).trim();

  var transporter = nodemailer.createTransport(config.nodemailer);

  var headers = {
    'Auto-Submitted': 'auto-generated'
  };

  if (new_rider && new_rider.email)
    headers['Reply-to'] = rider_email(new_rider);
  else if (old_rider && old_rider.email)
    headers['Reply-to'] = rider_email(old_rider);

  await transporter.sendMail({
    date: moment().locale('en').format('ddd, DD MMM YYYY HH:mm:ss ZZ'),
    from: config.from,
    to: to,
    subject: 'TrialInfo - Registrierung' + (new_rider && new_rider.verified ? ' (verifizert)' : ''),
    html: message,
    headers: headers
  });
  console.log('Notification email sent to ' + JSON.stringify(to));
}

async function register_save_rider(connection, id, number, rider, user, query) {
  await cache.begin(connection);
  try {
    var event = await get_event(connection, id);
    if (event.registration_ends == null ||
        common.parse_timestamp(event.registration_ends).getTime() < Date.now())
      throw new HTTPError(403, 'Forbidden');
    if (event.version != query.event_version)
      throw new HTTPError(409, 'Conflict');

    var old_rider;
    if (number != null) {
      old_rider = await get_rider(connection, id, number);
      if (old_rider.user_tag != user.user_tag &&
	  old_rider.email != user.email)
	throw new HTTPError(403, 'Forbidden');
    } else {
      var result = await connection.queryAsync(`
        SELECT COALESCE(MIN(number), 0) - 1 AS number
	FROM riders
	WHERE id = ?`, [id]);
      number = result[0].number;
    }

    let version = query.version;
    if (rider && version == null)
      version = rider.version;
    if (old_rider) {
      if (old_rider.version != version)
	throw new HTTPError(409, 'Conflict');
    }

    if (rider) {
      Object.keys(rider).forEach((key) => {
	if (!register_rider_fields[key])
	  delete rider[key];
      });
      rider.number = +number;

      delete rider.rankings;
      if (old_rider) {
	if (old_rider.number > 0)
	  delete rider['class'];
	if (old_rider.registered) {
	  delete rider.start;
	  for (let future_event of event.future_events) {
	    if (future_event.active) {
	      let fid = future_event.fid;
	      rider.future_starts[fid] =
		old_rider.future_starts[fid];
	    }
	  }
	}
      } else {
	if (event.ranking1_enabled)
	  rider.rankings = [{"rank":null, "score":null}];
      }

      delete rider.non_competing;
      delete rider.registered;
      delete rider.verified;
      if (!user.verified) {
	rider.verified = false;
	if (!event.features.verified) {
	  event = cache.modify_event(id);
	  event.features = Object.assign({}, event.features);
	  event.features.verified = true;
	}
      }

      rider.rider_tag = old_rider ?
        old_rider.rider_tag : random_tag();
      rider.user_tag = user.user_tag;

      rider = Object.assign(cache.modify_rider(id, number), rider);
    } else {
      if (old_rider &&
	  ((old_rider.registered && event.features.registered) ||
	  old_rider.number > 0))
	throw new HTTPError(403, 'Forbidden');
      await delete_rider(connection, id, number);
    }

    /*
     * Registration is still open, so we don't need to recompute any rankings
     * here.
     */

    event = cache.modify_event(id);
    event.mtime = moment().format('YYYY-MM-DD HH:mm:ss');

    await cache.commit(connection);
    if (!old_rider) {
      /* Reload from database to get any default values defined there.  */
      rider = await read_rider(connection, id, number, () => {});
    }
    notify_registration(id, number, old_rider, rider, event);
  } catch (err) {
    await cache.rollback(connection);
    throw err;
  }
  if (rider)
    return register_filter_rider(rider);
}

async function check_number(connection, id, query) {
  var check_result = {};
  var number;
  var result;

  /* Find out which (ranked) series the event is in: the serie must have a
     ranking defined and classes assigned.  */
  result = await connection.queryAsync(`
    SELECT DISTINCT id
    FROM events
    JOIN series_events USING (id)
    JOIN series_classes USING (serie)
    JOIN series USING (serie)
    WHERE enabled AND serie in (
	SELECT serie FROM series_events WHERE id = ?
      ) AND ranking IS NOT NULL

    UNION

    SELECT ? AS id`, [id, id]);
  var events = result.map((row) =>
    connection.escape(+row.id)).join(', ');

  if ('number' in query) {
    result = await connection.queryAsync(`
      SELECT number, class, last_name, first_name, date_of_birth
      FROM riders
      WHERE id = ? AND number = ?`, [id, query.number]);

    if (result.length == 0) {
      result = await connection.queryAsync(`
	SELECT id, title, number, class, last_name, first_name, date_of_birth
	FROM events
	JOIN riders USING (id)
	WHERE number = ? AND id IN (` + events + `)
	ORDER BY date DESC
	LIMIT 1`, [query.number]);
    }

    if (result.length == 1) {
      check_result = result[0];
      number = check_result.number;
    }
  } else if ('class' in query) {
    result = await connection.queryAsync(`
      SELECT MIN(number) AS number
      FROM riders
      WHERE id = ? AND class = ? AND number >= 0`,
      [id, query['class']]);
    number = result[0].number;
  }

  if (number != null) {
    /* Find the next unassigned number.  This is done using a left join of the
       list of defined riders onto itself.  */
    result = await connection.queryAsync(`
      SELECT DISTINCT a.next_number AS next_number
      FROM (
	SELECT DISTINCT number + 1 AS next_number
	FROM riders
	WHERE id IN (` + events + `)
      ) AS a LEFT JOIN (
	SELECT DISTINCT number AS next_number
	FROM riders
	WHERE id IN (` + events + `)
      ) AS b USING (next_number)
      WHERE a.next_number > ? AND b.next_number IS NULL
      ORDER BY next_number
      LIMIT 1`,
      [number]);
    if (result.length)
      Object.assign(check_result, result[0]);
  }

  return check_result;
}

async function admin_event_get_as_base(connection, tag, email) {
  var result = await connection.queryAsync(`
    SELECT title, id, tag
    FROM events
    JOIN events_all_admins USING (id)
    WHERE tag = ? AND email = ?`, [tag, email]);
  if (result.length == 1) {
    result = result[0];
    result.starters = {};
    var id = result.id;
    var event = await get_event(connection, id);
    var future_events = {};

    if (Object.keys(event.future_events).length) {
      var riders = await get_riders(connection, id);
      for (let future_event of event.future_events) {
	let fid = future_event.fid;
	future_events[fid] = future_event;
	result.starters[fid] = 0;
      }
      for (let rider of Object.values(riders)) {
	for (let fid in rider.future_starts) {
	  if (!(fid in result.starters))
	    continue;
	  if (future_events[fid].active &&
	      ((rider.verified || !event.features.verified) &&
	       (rider.registered || !event.features.registered)))
	    result.starters[fid]++;
	}
      }
    }
    return result;
  }
}

async function index(req, res, next) {
  try {
    var events = await req.conn.queryAsync(`
      SELECT id, date, title,
	     CASE WHEN registration_ends > NOW() THEN registration_ends END AS registration_ends
      FROM events
      WHERE enabled
      AND (registration_ends IS NOT NULL OR
	  id IN (SELECT DISTINCT id FROM marks) OR
	  id IN (SELECT DISTINCT id FROM riders WHERE start_time AND verified AND start))`);
    events = events.reduce((hash, event) => {
      var date = common.parse_timestamp(event.date);
      if (date)
	event.ts = date.getTime();
      event.series = {};
      hash[event.id] = event;
      return hash;
    }, {});

    var series = await req.conn.queryAsync(`
      SELECT serie, name, abbreviation
      FROM series`);
    series = series.reduce((hash, serie) => {
      serie.events = {};
      hash[serie.serie] = serie;
      return hash;
    }, {});

    (await req.conn.queryAsync(`
      SELECT DISTINCT serie, id
      FROM series_events
      JOIN series_classes USING (serie)
      JOIN classes USING (id, ranking_class)`))
    .forEach((se) => {
      let event = events[se.id];
      let serie = series[se.serie];
      if (event && serie) {
	event.series[se.serie] = serie;
	serie.events[se.id] = event;
      }
    });

    let params = {
      events: function(serie_id, register) {
	let e = (serie_id == null) ? events :
	  (series[serie_id] || {}).events;
	if (e && register) {
	  e = Object.values(e).reduce(function(events, event) {
	    if (event.registration_ends)
	      events[event.id] = event;
	    return events;
	  }, {});
	}
	return Object.values(e || {})
	  .sort((a, b) =>
	    (a.ts - b.ts) ||
	    (a.title || '').localeCompare(b.title || ''));
      },
      abbreviations: function(series, ignore) {
	var abbreviations =
	  Object.values(series)
	  .reduce((list, serie) => {
	    if (serie.abbreviation &&
	        (ignore || []).indexOf(serie.serie) == -1)
	      list.push(serie.abbreviation);
	    return list;
	  }, [])
	  .sort((a, b) => a.localeCompare(b));
	if (abbreviations.length)
	  return '(' + abbreviations.join(', ') + ')';
      },
      parse_timestamp: common.parse_timestamp,
      remaining_time: common.remaining_time
    };
    if (req.user)
      params.email = req.user.email;
    res.marko(views['index'], params);
  } catch (err) {
    next(err);
  }
}

async function export_event(connection, id, email) {
  let event = await get_event(connection, id);
  let riders = await get_riders(connection, id);

  let series = await connection.queryAsync(`
    SELECT serie
    FROM series
    JOIN series_events USING (serie)
    JOIN series_all_admins USING (serie)
    WHERE id = ? AND email = ?
  `, [id, email]);

  for (let index in series) {
    let serie_id = series[index].serie;
    let serie = await get_serie(connection, serie_id);
    delete serie.serie;
    delete serie.version;
    delete serie.events;
    var new_numbers = serie.new_numbers[id];
    delete serie.new_numbers;
    if (new_numbers)
      serie.new_numbers = new_numbers;
    series[index] = serie;
  }

  event = Object.assign({}, event);
  let base = event.base;
  delete event.base;
  event.bases = [];
  if (base) {
    let bases = (await connection.queryAsync(`
      SELECT tag, base
      FROM events
      JOIN events_all_admins USING (id)
      WHERE base IS NOT NULL AND email = ?`, [email])
    ).reduce((hash, event) => {
      hash[event.tag] = event.base;
      return hash;
    }, {});

    event.bases.push(base);
    while (bases[base]) {
      base = bases[base];
      event.bases.push(base);
    }
  }

  delete event.id;
  delete event.version;
  delete event.series;
  delete event.registration_ends;

  riders = Object.values(riders).reduce(
    (riders, rider) => {
      rider = Object.assign({}, rider);
      delete rider.version;
      riders[rider.number] = rider;
      return riders;
  }, {});

  return {
    format: 'TrialInfo 1',
    event: event,
    riders: riders,
    series: series
  };
}

function basename(event) {
  if (event.title)
    return event.title.replace(/[:\/\\]/g, '');
  else if (event.date)
    return 'Trial ' + event.date;
  else
    return 'Trial';
}

async function admin_export_event(connection, id, email) {
  let data = await export_event(connection, id, email);
  return {
    filename: basename(data.event) + '.ti',
    data: zlib.gzipSync(JSON.stringify(data), {level: 9})
  };
}

function csv_field(field) {
  if (field == null)
    field = ''
  else if (typeof field === 'boolean')
    field = field + 0 + ''
  else
    field = field + ''

  if (field.match(/[", \r\n]/))
    field = '"' + field.replace(/"/g, '""') + '"';
  return field;
}

function csv_table(table) {
  return table.reduce(function(result, row) {
    result += row.reduce(function(result, field) {
      result.push(csv_field(field));
      return result;
    }, []).join(',');
    return result + '\r\n';
  }, '');
}

async function admin_export_csv(connection, id) {
  let event = await get_event(connection, id);

  let rankings = [];
  for (let n = 1; n <= 4; n++) {
    if (event.features['ranking' + n])
      rankings.push(n);
  }

  let future_events = (await connection.queryAsync(`
    SELECT fid
    FROM future_events
    WHERE id = ? AND active
    ORDER BY date
  `, [id])).map((row, index) => row.fid);

  let columns = ['riders.*']
    .concat(rankings.map((n) => `COALESCE(ranking${n}, 0) AS ranking${n}`))
    .concat(future_events.map((fid, index) =>
	    `COALESCE(start${index + 2}, 0) AS start${index + 2}`));

  return await new Promise(function(fulfill, reject) {
    let query =
      `SELECT ` + columns.join(', ') + `
      FROM riders` +
      rankings.map((n) => `
      LEFT JOIN (
        SELECT id, number, 1 AS ranking${n}
	FROM rider_rankings
	WHERE ranking = ${n}
      ) AS ranking${n} USING (id, number)`).join('') +
      future_events.map((fid, index) => `
      LEFT JOIN (
        SELECT id, rider_tag, 1 AS start${index + 2}
	FROM future_starts
	WHERE fid = ${fid}
      ) AS start${index + 2} USING (id, rider_tag)`).join('') + `
      WHERE id = ${connection.escape(id)} AND
	(number > 0 OR registered OR start OR number IN (
	  SELECT number
	  FROM future_events JOIN future_starts USING (id, fid)
	  WHERE id = ${connection.escape(id)} AND active)) AND
	NOT COALESCE(`+'`group`'+`, 0)
      ORDER BY number`;
    // console.log(query);
    connection.query(query, [], function(error, rows, fields) {
      if (error)
	return reject(error);

      for (let row of rows) {
	if (row.number < 0)
          row.number = null;
      }

      fields = fields.reduce(function(fields, field) {
	  if (event.features[field.name])
	    fields.push(field.name);
	  return fields;
	}, []);
      var table = [fields];
      for (let row of rows) {
	table.push(fields.reduce(function(result, field) {
	  result.push(row[field]);
	  return result;
	}, []));
      }
      fulfill(csv_table(table));
    });
  });
}

/*
async function title_of_copy(connection, event) {
  let result = connection.queryAsync(`
    SELECT character_maximum_length AS length
    FROM information_schema.columns
    WHERE table_schema = Database() AND table_name = 'rankings' AND column_name = 'title'`);

  let title = event.title;
  var match = title.match(/(.*) \(Kopie(?: (\d+))?\)?$/);
  if (match)
    title = match[1] + '(Kopie ' + ((match[2] || 1) + 1) + ')';
  else
    title = title + ' (Kopie)';

  return title.substr(0, result[0].length);
}
*/

async function import_event(connection, existing_id, data, email) {
  if (data.format != 'TrialInfo 1')
    throw new HTTPError(415, 'Unsupported Media Type');

  await cache.begin(connection);
  try {
    let event = data.event;
    let result;
    let id;

    if (existing_id) {
      id = existing_id;
    } else {
      result = await connection.queryAsync(`
	SELECT id
	FROM events
	WHERE tag = ?`, [event.tag]);
      if (result.length) {
	event.tag = random_tag();
	event.title += ' (Kopie)';
	// event.title = await title_of_copy(connection, event);
      }

      result = await connection.queryAsync(`
	SELECT COALESCE(MAX(id), 0) + 1 AS id
	FROM events`);
      id = result[0].id;
    }

    if (event.bases) {
      let bases = event.bases;
      delete event.bases;
      event.base = bases.length ? bases[0] : null;

      if (!existing_id) {
	result = await connection.queryAsync(`
	  SELECT id, tag
	  FROM events`);
	let bases_hash = result.reduce((bases_hash, event) => {
	  bases_hash[event.tag] = event.id;
	  return bases_hash;
	}, {});

	for (let base of bases) {
	  let base_id = bases_hash[base];
	  if (base_id) {
	    await inherit_rights_from_event(connection, id, base_id);
	    break;
	  }
	}
      }
    }

    if (!existing_id) {
      await add_event_write_access(connection, id, email);
    }

    if (existing_id) {
      await get_event(connection, id);
      await get_riders(connection, id);

      for (let number in cache.cached_riders[id]) {
	if (!data.riders[number]) {
	  cache.modify_rider(id, number);
	  delete cache.cached_riders[id][number];
	}
      }
    }

    Object.assign(cache.modify_event(id), event);

    Object.values(data.riders).forEach((rider) => {
      Object.assign(cache.modify_rider(id, rider.number), rider);
    });

    if (!existing_id && data.series) {
      result = await connection.queryAsync(`
	SELECT series.serie, series.tag AS tag, read_only
	FROM series
	LEFT JOIN (
	  SELECT serie, COALESCE(read_only, 0) AS read_only
	  FROM series_all_admins
	  WHERE email = ?) AS _ USING (serie)`, [email]);
      let existing_series = result.reduce((existing_series, serie) => {
	existing_series[serie.tag] = {
	  serie: serie.serie,
	  writable: serie.read_only === 0
	};
	return existing_series;
      }, {});

      for (let serie of data.series) {
	let existing_serie = existing_series[serie.tag];
	if (existing_serie && existing_serie.writable) {
	  await connection.queryAsync(`
	    INSERT INTO series_events (serie, id)
	    VALUES (?, ?)`, [existing_serie.serie, id]);
	  for (let number in serie.new_numbers) {
	    await connection.queryAsync(`
	      INSERT INTO new_numbers (serie, id, number, new_number)
	      VALUES (?, ?, ?, ?)`,
	      [existing_serie.serie, id, number, serie.new_numbers[number]]);
	  }
	} else {
	  if (existing_series[serie.tag]) {
	    delete serie.tag;
	    serie.name += ' (Kopie)';
	  }
	  serie.events = [id];
	  let new_numbers = serie.new_numbers;
	  serie.new_numbers = {};
	  if (new_numbers)
	    serie.new_numbers[id] = new_numbers;
	  let serie_id = await save_serie(connection, null, serie, null, email);
	}
      }
    }

    await cache.commit(connection);
    return {id: id};
  } catch (err) {
    await cache.rollback(connection);
    throw err;
  }
}

async function admin_import_event(connection, existing_id, data, email) {
  data = JSON.parse(zlib.gunzipSync(Buffer.from(data, 'base64')));
  return await import_event(connection, existing_id, data, email);
}

async function admin_dump_event(connection, id, email) {
  let data = await export_event(connection, id, email);
  delete data.event.bases;
  delete data.series;
  return data;
}

async function admin_patch_event(connection, id, patch, email) {
  let event0 = await export_event(connection, id, email);
  let event1 = clone(event0, false);
  console.log('Patch: ' + JSON.stringify(patch));
  try {
    jsonpatch.apply(event1, patch);
  } catch (err) {
    console.error('Patch ' + JSON.stringify(patch) + ': ' + err);
    throw new HTTPError(409, 'Conflict');
  }
  await import_event(connection, id, event1, email);
}

function query_string(query) {
  if (!query)
    return '';
  return '?' + Object.keys(query).map(
    (key) => key + (query[key] != '' ?
		    ('=' + encodeURIComponent(query[key])) : '')
  ).join('&');
}

var client_config = {
  weasyprint: config.weasyprint,
  sync_target: config.sync_target,
  existing_regforms: (function() {
    try {
      return fs.readdirSync(regforms_dir).reduce(
	function(regforms, name) {
	  var match = name.match(/(.*)\.pdf$/);
	  if (match)
	    regforms[match[1]] = true;
	  return regforms;
	}, {});
    } catch(err) {
      return {};
    }
  })(),
};

var sendFileOptions = {
  root: __dirname + '/htdocs/'
};

var app = express();

app.set('etag', false);

app.set('case sensitive routing', true);
if (app.get('env') != 'production')
  app.set('json spaces', 2);

if (!config.session)
  config.session = {};
if (!config.session.secret)
  config.session.secret = require('crypto').randomBytes(64).toString('hex');

app.use(logger(app.get('env') == 'production' ? production_log_format : 'dev'));
if (app.get('env') == 'production')
  app.get('*.js', minified_redirect);
app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: false }));
app.use(cookieParser(/* config.session.secret */));
app.use(cookieSession({
  name: 'trialinfo.session',
  httpOnly: false,
  signed: false}));
app.use(passport.initialize());
app.use(passport.session());
app.use(compression());

/*
 * Accessible to anyone:
 */

app.use(cors({
    origin: function(origin, callback) {
      // Make sure the response doesn't contain a wildcard
      // "Access-Control-Allow-Origin: *" header; Firefox
      // rejects that.
      callback(null, true);
    },
    credentials: true
  }));

app.get('/', conn(pool), index);

app.get('/login/', function(req, res, next) {
  var params = {
    mode: 'login',
  };
  if (req.query)
    params.query = query_string(req.query);
  res.marko(views['login'], params);
});

app.post('/login', login, function(req, res, next) {
  var url = '/';
  if (req.query.redirect)
    url = decodeURIComponent(req.query.redirect);
  return res.redirect(303, url);
});

app.post('/signup', conn(pool), async function(req, res, next) {
  signup_or_reset(req, res, 'signup');
});

app.post('/reset', conn(pool), async function(req, res, next) {
  signup_or_reset(req, res, 'reset');
});

app.get('/change-password', conn(pool), show_change_password);

app.post('/change-password', conn(pool), change_password);

app.get('/logout', function(req, res, next) {
  req.logout();
  res.redirect(303, '/');
});

app.get('/admin/', conn(pool), async function(req, res, next) {
  try {
    var user = await validate_user(req.conn, req.user);
    if (user.admin)
      return next();
  } catch(err) {}
  res.redirect(303, '/login/?admin&redirect=' + encodeURIComponent(req.url));
});

app.get('/register/event/:id', conn(pool), async function(req, res, next) {
  try {
    var user = await validate_user(req.conn, req.user);
    return next();
  } catch(err) {}
  res.redirect(303, '/login/?redirect=' + encodeURIComponent(req.url));
});

app.get('/admin/config.js', function(req, res, next) {
  res.type('application/javascript');
  res.send('var config = ' + JSON.stringify(client_config, null, '  ') + ';');
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
    return res.redirect(303, '/login/?redirect=' + encodeURIComponent(req.url));
  }
  next();
});

app.get('/register/*', function(req, res, next) {
  if (!req.user) {
    /* Session cookie not defined, so obviously not logged in. */
    return res.redirect(303, '/login/?redirect=' + encodeURIComponent(req.url));
  }
  next();
});

app.use(express.static('htdocs', {etag: true}));

app.get('/admin/*', function(req, res, next) {
  res.sendFile('admin/index.html', sendFileOptions);
});

app.get('/register/*', function(req, res, next) {
  res.sendFile('register/index.html', sendFileOptions);
});

/*
 * Accessible to all registered users:
 */

app.use('/api', conn(pool));
app.all('/api/*', auth);

app.get('/api/event/:id/scores', function(req, res, next) {
  get_event_scores(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/register/event/:id', function(req, res, next) {
  register_get_event(req.conn, req.params.id, req.user)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/register/event/:id/riders', function(req, res, next) {
  register_get_riders(req.conn, req.params.id, req.user)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/register/event/:id/suggestions', function(req, res, next) {
  get_event_suggestions(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.post('/api/register/event/:id/rider', async function(req, res, next) {
  var rider = req.body;
  try {
    rider = await register_save_rider(req.conn, req.params.id,
				      null, rider,
				      req.user, req.query);
    res.status(201);
    res.json(rider);
  } catch (err) {
    next(err);
  }
});

app.put('/api/register/event/:id/rider/:number', async function(req, res, next) {
  var rider = req.body;
  try {
    rider = await register_save_rider(req.conn, req.params.id,
				      req.params.number, rider,
				      req.user, req.query);
    res.json(rider);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/register/event/:id/rider/:number', async function(req, res, next) {
  try {
    await register_save_rider(req.conn, req.params.id,
			      req.params.number, null,
			      req.user, req.query);
    res.json({});
  } catch (err) {
    next(err);
  }
});

app.post('/api/to-pdf', async function(req, res, next) {
  let keep_html_on_error = false;
  var baseurl = (req.body.url || '.').replace(/\/admin\/.*/, '/admin/');
  var html = req.body.html
    .replace(/<!--.*?-->\s?/g, '')
    .replace(/<script.*?>[\s\S]*?<\/script>\s*/g, '');
    /*.replace(/<[^>]*>/g, function(x) {
      return x.replace(/\s+ng-\S+="[^"]*"/g, '');
    })*/

  var tmp_html = tmp.fileSync();
  await fsp.write(tmp_html.fd, html);

  var tmp_pdf = tmp.fileSync();
  let args = ['-f', 'pdf', '--base-url', baseurl, tmp_html.name, tmp_pdf.name];
  console.log('weasyprint' + ' ' + args.join(' '));
  var child = child_process.spawn('weasyprint', args);

  child.stderr.on('data', (data) => {
    console.log(`${data}`);
  });

  child.on('close', (code) => {
    if (!(code && keep_html_on_error))
      tmp_html.removeCallback();

    if (code) {
      console.log('weasyprint failed with status ' + code +
	(keep_html_on_error ? ' (keeping ' + tmp_html.name + ')' : ''));
      tmp_pdf.removeCallback();
      return next(new HTTPError(500, 'Internal Error'));
    }

    var filename = req.body.filename || 'print.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(tmp_pdf.name, {}, () => {
      tmp_pdf.removeCallback();
    });
  });
});

/*
 * Accessible to admins only:
 */

app.all('/api/*', may_admin);

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
  admin_get_event(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:tag/export', will_read_event, function(req, res, next) {
  admin_export_event(req.conn, req.params.id, req.user.email)
  .then((result) => {
    res.type('application/octet-stream');
    res.setHeader('Content-Disposition',
		  "attachment; filename*=UTF-8''" +
		  encodeURIComponent(req.query.filename || result.filename));
    res.send(result.data);
  }).catch(next);
});

app.get('/api/event/:tag/csv', will_read_event, function(req, res, next) {
  admin_export_csv(req.conn, req.params.id)
  .then((result) => {
    res.type('text/comma-separated-values');
    res.setHeader('Content-Disposition',
		  "attachment; filename*=UTF-8''" +
		  encodeURIComponent(req.query.filename || 'Fahrerliste.csv'));
    res.send(result);
  }).catch(next);
});

app.post('/api/event/import', function(req, res, next) {
  admin_import_event(req.conn, null, req.body.data, req.user.email)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:tag/dump', will_read_event, function(req, res, next) {
  admin_dump_event(req.conn, req.params.id, req.user.email)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.post('/api/event/:tag/patch', will_write_event, function(req, res, next) {
  admin_patch_event(req.conn, req.params.id, req.body.patch, req.user.email)
  .then((result) => {
    res.json({});
  }).catch(next);
});

app.get('/api/event/:tag/as-base', function(req, res, next) {
  admin_event_get_as_base(req.conn, req.params.tag, req.user.email)
  .then((result) => {
    res.json(result || {});
  }).catch(next);
});

app.get('/api/event/:id/suggestions', will_read_event, function(req, res, next) {
  get_event_suggestions(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/rider/:number', will_read_event, function(req, res, next) {
  admin_get_rider(req.conn, req.params.id, req.params.number, req.query)
  .then((result) => {
    res.json(result);
  }).catch(next);
});
app.get('/api/event/:id/first-rider', will_read_event, function(req, res, next) {
  admin_get_rider(req.conn, req.params.id, null, req.query, 1)
  .then((result) => {
    res.json(result);
  }).catch(next);
});
app.get('/api/event/:id/previous-rider/:number', will_read_event, function(req, res, next) {
  admin_get_rider(req.conn, req.params.id, req.params.number, req.query, -1)
  .then((result) => {
    res.json(result);
  }).catch(next);
});
app.get('/api/event/:id/next-rider/:number', will_read_event, function(req, res, next) {
  admin_get_rider(req.conn, req.params.id, req.params.number, req.query, 1)
  .then((result) => {
    res.json(result);
  }).catch(next);
});
app.get('/api/event/:id/last-rider', will_read_event, function(req, res, next) {
  admin_get_rider(req.conn, req.params.id, null, req.query, -1)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/regform', will_read_event, async function(req, res, next) {
  try {
    await admin_regform(res, req.conn, req.params.id, req.query.number);
  } catch (err) {
    next(err);
  }
});

app.get('/api/event/:id/find-riders', will_read_event, function(req, res, next) {
  find_riders(req.conn, req.params.id, req.query)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.post('/api/event/:id/rider', will_write_event, async function(req, res, next) {
  var rider = req.body;
  try {
    rider = await admin_save_rider(req.conn, req.params.id,
				   null, rider,
				   req.user.user_tag, req.query);
    res.status(201);
    res.json(rider);
  } catch (err) {
    next(err);
  }
});

app.post('/api/event/:id/reset', will_write_event, async function(req, res, next) {
  admin_reset_event(req.conn, req.params.id, req.query, req.user.email)
  .then(() => {
    res.json({});
  }).catch(next);
});

app.put('/api/event/:id/rider/:number', will_write_event, async function(req, res, next) {
  var rider = req.body;
  try {
    rider = await admin_save_rider(req.conn, req.params.id,
				   req.params.number, rider,
				   req.user.user_tag, req.query);
    res.json(rider);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/event/:id/rider/:number', will_write_event, async function(req, res, next) {
  try {
    await admin_save_rider(req.conn, req.params.id,
			   req.params.number, null,
			   req.user.user_tag, req.query);
    res.json({});
  } catch (err) {
    next(err);
  }
});

app.post('/api/event', async function(req, res, next) {
  var event = req.body;
  try {
    event = await admin_save_event(req.conn, null, event, null, req.query.reset, req.user.email);
    res.status(201);
    res.json(event);
  } catch (err) {
    next(err);
  }
});

app.put('/api/event/:id', will_write_event, async function(req, res, next) {
  var event = req.body;
  try {
    event = await admin_save_event(req.conn, req.params.id, event);
    res.json(event);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/event/:id', will_write_event, async function(req, res, next) {
  try {
    await admin_save_event(req.conn, req.params.id, null, req.query.version);
    res.json({});
  } catch (err) {
    next(err);
  }
});

app.get('/api/event/:id/check-number', will_read_event, async function(req, res, next) {
  try {
    res.json(await check_number(req.conn, req.params.id, req.query));
  } catch (err) {
    next(err);
  }
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

app.post('/api/serie', async function(req, res, next) {
  var serie = req.body;
  try {
    serie = await admin_save_serie(req.conn, null, serie, null, req.user.email);
    res.status(201);
    res.json(serie);
  } catch (err) {
    next(err);
  }
});

app.put('/api/serie/:serie', will_write_serie, async function(req, res, next) {
  var serie = req.body;
  try {
    serie = await admin_save_serie(req.conn, req.params.serie, serie);
    res.json(serie);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/serie/:serie', will_write_serie, async function(req, res, next) {
  try {
    await admin_save_serie(req.conn, req.params.serie, null, req.query.version);
    res.json({});
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/:user_tag', async function(req, res, next) {
  try {
    let result = await req.conn.queryAsync(`
      SELECT email
      FROM users
      WHERE user_tag = ?
    `, [req.params.user_tag]);
    if (result.length == 1)
      res.json(result[0]);
    else
      res.json({});
  } catch (err) {
    next(err);
  }
});

app.use(clientErrorHandler);

try {
  var http = require('http');
  var server = http.createServer(app);

  require('systemd');
  server.listen('systemd');

  /* We don't get here unless started by systemd. */
  require('autoquit');
  server.autoQuit({timeout: 300 });
} catch (_) {
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
};

/* ex:set shiftwidth=2: */
