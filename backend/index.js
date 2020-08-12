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
var spawn = require('child-process-promise').spawn;
var tmp = require('tmp');
var diff = require('diff');
var cors = require('cors');
var Mutex = require('async-mutex').Mutex;

var config = JSON.parse(fs.readFileSync('config.json'));

const cache_max_age = 5 * 60 * 1000;  /* 5 min */

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

var pdf_dir = 'pdf';

let pdf_forms = {};
(function() {
  var form_types = [];
  try {
    form_types = fs.readdirSync(pdf_dir);
  } catch (_) {}
  for (var form_type of form_types) {
    var event_types = [];
    try {
      event_types = fs.readdirSync(pdf_dir + '/' + form_type);
    } catch (_) {
    }

    for (var event_type of event_types) {
      var names = [];
      try {
	names = fs.readdirSync(pdf_dir + '/' + form_type + '/' + event_type);
      } catch (_) {
      }

      for (var name of names) {
	var match = name.match(/(.*)\.pdf$/);
	if (!match)
	  continue;
	let base_name = match[1].replace(/{.+?:.+?}/g, '');

	if (!(event_type in pdf_forms))
	  pdf_forms[event_type] = {};
	if (!(base_name in pdf_forms[event_type])) {
	  pdf_forms[event_type][base_name] = {
	    forms: [],
	    type: form_type
	  };
	}
	pdf_forms[event_type][base_name].forms.push(name);
      }
    }
  }
})();

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
  if (req.user)
    return req.user.email;
  if (req.scoring_device) {
    if (req.scoring_device.name != null)
      return encodeURIComponent(req.scoring_device.name);
    return req.scoring_device.device_tag;
  }
  return '-';
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
var acup = require('./lib/acup.js');
var compute_event = require('./lib/compute_event.js');
var compute_serie = require('./lib/compute_serie.js');
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
      CHANGE additional_marks penalty_marks FLOAT,
      ADD additional_marks FLOAT AFTER failure;
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

  if (!await column_exists(connection, 'series', 'mtime')) {
    console.log('Adding column `mtime` to table `series`');
    await connection.queryAsync(`
      ALTER TABLE series
      ADD mtime TIMESTAMP NULL DEFAULT NULL
    `);
  }

  if (await column_exists(connection, 'series', 'ranking')) {
    console.log('Moving column `ranking` from `series` to `series_classes` and `series_scores`');
    if (!await column_exists(connection, 'series_classes', 'ranking')) {
      await connection.queryAsync(`
	DELETE series_classes
	FROM series_classes
	JOIN series USING (serie)
	WHERE series.ranking IS NULL
      `);

      await connection.queryAsync(`
	ALTER TABLE series_classes
	ADD ranking INT NULL DEFAULT NULL AFTER serie
      `);
      await connection.queryAsync(`
	UPDATE series_classes
	JOIN series USING (serie)
	SET series_classes.ranking = series.ranking
      `);
      await connection.queryAsync(`
	ALTER TABLE series_classes
	DROP PRIMARY KEY,
	ADD PRIMARY KEY (serie, ranking, ranking_class)
      `);
    }

    if (!await column_exists(connection, 'series_scores', 'ranking')) {
      await connection.queryAsync(`
	ALTER TABLE series_scores
	ADD ranking INT NULL DEFAULT NULL AFTER serie
      `);
      await connection.queryAsync(`
	UPDATE series_scores
	JOIN series USING (serie)
	SET series_scores.ranking = series.ranking
      `);
      await connection.queryAsync(`
	ALTER TABLE series_scores
	DROP PRIMARY KEY,
	ADD PRIMARY KEY (serie, ranking, class, number)
      `);
    }

    await connection.queryAsync(`
      ALTER TABLE series
      DROP ranking
    `);
  }

  if (await column_exists(connection, 'series_classes', 'events')) {
    console.log('Renaming column `events` in `series_classes` to `max_events`');
    await connection.queryAsync(`
      ALTER TABLE series_classes
      CHANGE events max_events INT
    `);
  }

  if (!await column_exists(connection, 'series_classes', 'min_events')) {
    console.log('Adding column `min_events` to table `series_classes`');
    await connection.queryAsync(`
      ALTER TABLE series_classes
      ADD min_events INT NULL DEFAULT NULL AFTER max_events
    `);
  }

  if (!await column_exists(connection, 'series_scores', 'ranked')) {
    console.log('Adding column `ranked` to table `series_scores`');
    await connection.queryAsync(`
      ALTER TABLE series_scores
      ADD ranked BOOLEAN NOT NULL
    `);
  }

  if (await column_exists(connection, 'series_scores', 'class')) {
    console.log('Renaming column `class` in `series_scores` to `ranking_class`');
    await connection.queryAsync(`
      ALTER TABLE series_scores
      CHANGE class ranking_class INT
    `);
  }

  let ranking_features;
  (await connection.queryAsync(`
    SELECT COUNT(*) AS count
    FROM event_features
    WHERE feature LIKE 'ranking%'
  `)).forEach((row) => {
    ranking_features = row.count;
  });

  if (ranking_features) {
    console.log('Converting rankings');
    await connection.queryAsync(`
      DELETE rankings
      FROM rankings
      LEFT JOIN event_features ON rankings.id = event_features.id AND ranking = MID(feature, 8)
      WHERE event_features.id IS NULL
    `);

    await connection.queryAsync(`
      DELETE FROM event_features
      WHERE feature LIKE 'ranking%'
    `);
  }

  if (!await column_exists(connection, 'rankings', 'default')) {
    console.log('Converting `events`.`ranking1_enabled` to `rankings`.`default`');
    await connection.queryAsync(`
      ALTER TABLE rankings
      ADD ` + '`default`' + ` BOOLEAN NOT NULL DEFAULT 0
    `);

    await connection.queryAsync(`
      UPDATE rankings
      JOIN events USING (id)
      SET `+'`default`'+` = COALESCE(ranking1_enabled, 0)
      WHERE ranking = 1
    `);

    await connection.queryAsync(`
      ALTER TABLE events
      DROP ranking1_enabled
    `);
  }

  if (!await column_exists(connection, 'rankings', 'assign_scores')) {
    console.log('Converting `events`.`score_234` to `rankings`.`assign_scores`');
    await connection.queryAsync(`
      ALTER TABLE rankings
      ADD assign_scores BOOLEAN NOT NULL DEFAULT 0
    `);

    await connection.queryAsync(`
      UPDATE rankings
      JOIN events USING (id)
      SET assign_scores = 1
      WHERE ranking = 1 OR score_234
    `);

    await connection.queryAsync(`
      ALTER TABLE events
      DROP score_234
    `);
  }

  if (!await column_exists(connection, 'rankings', 'joint')) {
    console.log('Adding column `joint` to `rankings`');
    await connection.queryAsync(`
      ALTER TABLE rankings
      ADD joint BOOLEAN NOT NULL DEFAULT 0
    `);
  }

  if (!await column_exists(connection, 'rankings', 'split')) {
    console.log('Adding column `split` to `rankings`');
    await connection.queryAsync(`
      ALTER TABLE rankings
      ADD split BOOLEAN NOT NULL DEFAULT 0
    `);
  }

  if (!await column_exists(connection, 'rankings', 'ignore')) {
    console.log('Adding column `ignore` to `rankings`');
    await connection.queryAsync(`
      ALTER TABLE rankings
      ADD ${'`ignore`'} BOOLEAN NOT NULL DEFAULT 0
    `);
  }

  if (!await column_exists(connection, 'events', 'main_ranking')) {
    console.log('Adding column `main_ranking` to `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      ADD main_ranking INT
    `);

    await connection.queryAsync(`
      UPDATE events
      JOIN rankings USING (id)
      SET main_ranking = ranking
      WHERE ranking = 1
    `);
  }

  if (!await column_exists(connection, 'future_starts', 'number')) {
    console.log('Converting table `future_starts`');
    await connection.queryAsync(`
      ALTER TABLE future_starts
      ADD number INT
    `);

    await connection.queryAsync(`
      UPDATE future_starts
      JOIN riders USING (id, rider_tag)
      SET future_starts.number = riders.number
    `);

    await connection.queryAsync(`
      ALTER TABLE future_starts
      DROP PRIMARY KEY,
      DROP rider_tag,
      ADD PRIMARY KEY (id, fid, number);
    `);
  }

  if (!await column_exists(connection, 'events', 'location')) {
    console.log('Adding column `location` to `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      ADD location VARCHAR(40) AFTER subtitle
    `);
  }

  if (await column_exists(connection, 'future_events', 'title')) {
    console.log('Renaming column `title` to `location` in `future_events`');
    await connection.queryAsync(`
      ALTER TABLE future_events
      CHANGE title location VARCHAR(40)
    `);
  }

  if (!await column_exists(connection, 'riders', 'decisive_marks')) {
    console.log('Adding column `decisive_marks` to `riders`');
    await connection.queryAsync(`
      ALTER TABLE riders
      ADD decisive_marks INT
    `);
  }

  if (!await column_exists(connection, 'riders', 'decisive_round')) {
    console.log('Adding column `decisive_round` to `riders`');
    await connection.queryAsync(`
      ALTER TABLE riders
      ADD decisive_round INT
    `);
  }

  if (!await column_exists(connection, 'rider_rankings', 'decisive_marks')) {
    console.log('Adding column `decisive_marks` to `rider_rankings`');
    await connection.queryAsync(`
      ALTER TABLE rider_rankings
      ADD decisive_marks INT
    `);
  }

  if (!await column_exists(connection, 'rider_rankings', 'decisive_round')) {
    console.log('Adding column `decisive_round` to `rider_rankings`');
    await connection.queryAsync(`
      ALTER TABLE rider_rankings
      ADD decisive_round INT
    `);
  }

  if (await column_exists(connection, 'future_events', 'series')) {
    console.log('Dropping column `series` of `future_events`');
    await connection.queryAsync(`
      ALTER TABLE future_events
      DROP series
    `);
  }

  if (!await column_exists(connection, 'future_events', 'type')) {
    console.log('Adding column `type` to `future_events`');
    await connection.queryAsync(`
      ALTER TABLE future_events
      ADD type VARCHAR(20) AFTER location
    `);
  }

  var rows = await connection.queryAsync(`
    SELECT *
    FROM INFORMATION_SCHEMA.columns
    WHERE table_schema = ? AND table_name = 'events' AND column_name = 'registration_info'
    `, [config.database.database]);
  if (rows[0].CHARACTER_MAXIMUM_LENGTH != 2048) {
    console.log('Changing length of `events.registration_info` to 2048');
    await connection.queryAsync(`
      ALTER TABLE events
      CHANGE registration_info registration_info VARCHAR(2048)
    `);
  }

  if (!await column_exists(connection, 'events', 'combine')) {
    console.log('Adding column `combine` to `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      ADD combine BOOLEAN NOT NULL DEFAULT 0
    `);
  }

  if (!await column_exists(connection, 'future_events', 'combine')) {
    console.log('Adding column `combine` to `future_events`');
    await connection.queryAsync(`
      ALTER TABLE future_events
      ADD combine BOOLEAN NOT NULL DEFAULT 0
    `);
  }

  if (!await column_exists(connection, 'riders', 'unfinished_zones')) {
    console.log('Adding column `unfinished_zones` to `riders`');
    await connection.queryAsync(`
      ALTER TABLE riders
      ADD unfinished_zones INT
    `);
  }

  if (!await column_exists(connection, 'events', 'uci_x10')) {
    console.log('Adding column `uci_x10` to `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      ADD uci_x10 BOOLEAN AFTER enabled
    `);
  }

  if (!await column_exists(connection, 'riders', 's6')) {
    console.log('Adding column `s6` to `riders`');
    await connection.queryAsync(`
      ALTER TABLE riders
      ADD s6 INT AFTER s5
    `);
  }

  if (!await column_exists(connection, 'riders', 'achievements')) {
    console.log('Adding column `achievements` to `riders`');
    await connection.queryAsync(`
      ALTER TABLE riders
      ADD achievements VARCHAR(80) AFTER email
    `);
  }

  if (!await column_exists(connection, 'events', 'country')) {
    console.log('Adding column `country` to `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      ADD country VARCHAR(15)
    `);
  }

  if (!await column_exists(connection, 'events', 'hide_country')) {
    console.log('Adding column `hide_country` to `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      ADD hide_country BOOLEAN
    `);
  }

  if (await column_exists(connection, 'events', 'section_wise_entry')) {
    console.log('Removing column `section_wise_entry` from `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      DROP section_wise_entry
    `);
  } else if (await column_exists(connection, 'events', 'zone_wise_entry')) {
    console.log('Removing column `zone_wise_entry` from `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      DROP zone_wise_entry
    `);
  }

  if (await column_exists(connection, 'events', 'start_time')) {
    console.log('Removing columns `start_time`, `start_interval`, `start_spec` in `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      DROP start_time,
      DROP start_interval,
      DROP start_spec
    `);
  }

  if (!await column_exists(connection, 'classes', 'time_limit')) {
    console.log('Adding column `time_limit` to `classes`');
    await connection.queryAsync(`
      ALTER TABLE classes
      ADD time_limit TIME AFTER riding_time
    `);
  }

  if (!await column_exists(connection, 'riders', 'paid')) {
    console.log('Adding column `paid` to `riders`');
    await connection.queryAsync(`
      ALTER TABLE riders
      ADD paid BOOLEAN AFTER tie_break
    `);
  }

  if (!await column_exists(connection, 'events', 'access_token')) {
    console.log('Adding column `access_token` to `events`');
    await connection.queryAsync(`
      ALTER TABLE events
      ADD access_token CHAR(16) AFTER tag,
      ADD UNIQUE KEY access_token (access_token)
    `);
  }

  if (!await column_exists(connection, 'scoring_zones', 'id')) {
    console.log('Creating table `scoring_zones`');
    await connection.queryAsync(`
      CREATE TABLE scoring_zones (
	id INT,
	zone INT,
	PRIMARY KEY (id, zone)
      )
    `);
  }

  if (!await column_exists(connection, 'scoring_devices', 'device')) {
    console.log('Creating table `scoring_devices`');
    await connection.queryAsync(`
      CREATE TABLE scoring_devices (
	device INT,
	device_tag CHAR(16) NOT NULL,
	name VARCHAR(30),
	PRIMARY KEY (device),
	UNIQUE KEY device_tag (device_tag),
	UNIQUE KEY name (name)
      )
    `);
  }

  if (!await column_exists(connection, 'scoring_registered_zones', 'device')) {
    console.log('Creating table `scoring_registered_zones`');
    await connection.queryAsync(`
      CREATE TABLE scoring_registered_zones (
	id INT,
	zone INT,
	device INT NOT NULL,
	PRIMARY KEY (id, zone)
      )
    `);
  }

  if (!await column_exists(connection, 'scoring_marks', 'device')) {
    console.log('Creating table `scoring_marks`');
    await connection.queryAsync(`
      CREATE TABLE scoring_marks (
	id INT,
	device INT,
	seq INT,
	time TIMESTAMP NULL DEFAULT NULL,
	number INT NOT NULL,
	zone INT NOT NULL,
	marks INT NOT NULL,
	penalty_marks INT,
	canceled_device INT,
	canceled_seq INT,
	PRIMARY KEY (id, device, seq)
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
    throw 'Die E-Mail-Adresse ' + JSON.stringify(user.email) + ' ist nicht registriert.';
  }
  if (rows[0].password == null) {
    console.error('No password set for user ' + JSON.stringify(user.email));
    throw 'Für die E-Mail-Adresse ' + JSON.stringify(user.email) +
	  ' ist noch kein Kennwort gesetzt.<br>' +
          'Bitte fahren Sie mit der an diese Adresse geschickten ' +
	  'Bestätigungs-E-Mail fort, oder setzen Sie das Kennwort ' +
	  'erneut zurück, um eine weitere Bestätigungs-E-Mail zu ' +
	  'erhalten.';
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

function Transaction(connection, release) {
  this.connection = connection;
  this.release = release;
  return Object.freeze(this);
}

/*
 * Cache
 */
var cache = {
  mutex: new Mutex(),
  cached_event_timestamps: {},
  cached_events: {},
  saved_events: {},

  _access_event: function(id) {
    this.cached_event_timestamps[id] = Date.now();
  },

  get_event: function(id) {
    this._access_event(id);
    return this.cached_events[id];
  },
  set_event: function(id, event) {
    this._access_event(id);
    delete this.saved_events[id];
    this.cached_events[id] = event;
  },
  modify_event: function(id) {
    this._access_event(id);
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
    this._access_event(id);
    delete this.saved_events[id];
    delete this.cached_events[id];
  },

  /*
   * Riders include the groups of riders as well (rider.group trueish).
   */
  cached_riders: {},
  saved_riders: {},
  get_riders: function(id) {
    this._access_event(id);
    return this.cached_riders[id] || {};
  },
  set_riders: function(id, riders) {
    this._access_event(id);
    delete this.saved_riders[id];
    this.cached_riders[id] = riders;
  },
  get_rider: function(id, number) {
    this._access_event(id);
    return (this.cached_riders[id] || {})[number];
  },
  modify_rider: function(id, number) {
    this._access_event(id);
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
    this._access_event(id);
    for (let number in this.cached_riders[id])
      this.modify_rider(id, number);
    return this.cached_riders[id];
  },
  delete_riders: function(id) {
    this._access_event(id);
    delete this.saved_riders[id];
    delete this.cached_riders[id];
  },
  check_for_new_riders: function(id) {
    if (!this.saved_riders[id])
      this.saved_riders[id] = {};
    for (let number in this.cached_riders[id]) {
      if (!(number in this.saved_riders[id]))
	this.saved_riders[id][number] = undefined;
    }
  },
  delete_rider: function(id, number) {
    this._access_event(id);
    if (this.saved_riders[id])
      delete this.saved_riders[id][number];
    if (this.cached_riders[id])
      delete this.cached_riders[id][number];
  },
  set_rider: function(id, number, rider) {
    this._access_event(id);
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

  begin: async function(connection, id) {
    const release = await this.mutex.acquire();
    try {
      await connection.queryAsync(`BEGIN`);
      if (id)
	this._access_event(id);
      return new Transaction(connection, release);
    } catch (error) {
      release();
      throw error;
    }
  },
  commit: async function(transaction) {
    let connection = transaction.connection;
    try {
      await commit_world(connection);

      await connection.queryAsync(`COMMIT`);
      this._roll_forward();
    } catch (exception) {
      this._roll_back();
      await connection.queryAsync(`ROLLBACK`);
      throw exception;
    } finally {
      transaction.release();
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
  rollback: async function(transaction) {
    let connection = transaction.connection;
    try {
      this._roll_back();
      await connection.queryAsync(`ROLLBACK`);
    } finally {
      transaction.release();
    }
  },
  expire: function() {
    let expiry = Date.now() - cache_max_age;
    for (let id in this.cached_event_timestamps) {
      let accessed = this.cached_event_timestamps[id];
      if (accessed < expiry) {
	console.log('Expiring cache for event ' + id);
	delete this.cached_events[id];
	delete this.cached_riders[id];
	delete this.cached_event_timestamps[id];
      }
    }
  }
};

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
    SELECT *
    FROM series_classes
    WHERE serie = ?`, [serie_id]).map((row) => {
      delete row.serie;
      return row;
    });

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

function dates_to_string(dates) {
  if (dates.every((date) => date.getYear() == dates[0].getYear())) {
    if (dates.every((date) => date.getMonth() == dates[0].getMonth())) {
      dates = dates.map((date) => moment(date).locale('de').format('D.')).join(' und ') +
	      ' ' + moment(dates[0]).locale('de').format('MMMM YYYY');
    } else {
      dates = dates.map((date) => moment(date).locale('de').format('D. MMMM')).join(' und ') +
	      ' ' + moment(dates[0]).locale('de').format('YYYY');
    }
  } else {
    dates = dates.map((date) => moment(date).locale('de').format('D. MMMM YYYY')).join(' und ');
  }
  return dates;
}

async function rider_pdf_form_data(connection, id, number, event) {
  let rider = await get_rider(connection, id, number);
  if (!rider)
    throw new HTTPError(404, 'Not Found');

  rider = Object.assign({}, rider);

  if (rider.number < 0)
    rider.number = null;

  let name = [];
  if (rider.first_name)
    name.push(rider.first_name);
  if (rider.last_name)
    name.push(rider.last_name);
  rider.name = name.join(' ');
  rider.NAME = rider.name.toUpperCase();

  let name_country = [];
  if (rider.name)
    name_country.push(rider.name);
  if (rider.country &&
      (rider.country != event.country || !event.hide_country))
    name_country.push('(' + rider.country + ')');
  rider.name_country = name_country.join(' ');
  rider.NAME_COUNTRY = rider.name_country.toUpperCase();

  let country_province = [];
  if (rider.country)
    country_province.push(rider.country);
  if (rider.province)
    country_province.push('(' + rider.province + ')');
  rider.country_province = country_province.join(' ');

  if (rider.class != null) {
    rider['class_' + rider.class] = true;
    var cls = event.classes[rider.class - 1];
    if (cls) {
      rider.class_name = cls.name;

      if (cls.color && (match = cls.color.match(/^#([0-9a-fA-F]{6})$/)))
	rider.color = match[1];
      rider.ranking_class = cls.ranking_class;

      cls = event.classes[cls.ranking_class - 1];
      if (cls) {
	var match;
	if (cls.color && (match = cls.color.match(/^#([0-9a-fA-F]{6})$/))) {
	  rider.ranking_color = match[1];
	  rider['class_' + match[1].toLowerCase()] = true;
	}
      }
    }
  }

  if (!common.guardian_visible(rider, event))
    rider.guardian = null;

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

  let event_name = event.location || event.title;
  let dates = [];
  if (event.date)
    dates.push(common.parse_timestamp(event.date));
  for (let future_event of event.future_events) {
    if (future_event.active && future_event.date)
      dates.push(common.parse_timestamp(future_event.date));
  }
  if (dates)
    event_name += '\n' + dates_to_string(dates);
  rider.event_name = event_name;
  rider.event_location = event.location;
  rider.event_date = dates_to_string(dates);
  rider.event_year = moment(common.parse_timestamp(event.date))
    .locale('de').format('YYYY');

  return rider;
}

async function admin_pdf_form(res, connection, id, name, numbers, direct) {
  let event = await get_event(connection, id);
  if (event.type == null ||
      (pdf_forms[event.type] || {})[name] == null)
    throw new HTTPError(404, 'Not Found');

  let printer;
  if (direct) {
    let form_type = pdf_forms[event.type][name].type;
    printer = (config.printers || {})[form_type];
    if (!printer)
      throw new HTTPError(404, 'No printer defined for form type ' + encodeURIComponent(form_type));
  }

  function pdf_form_for_rider(rider) {
    let matching_filenames = [];
    for (let filename of pdf_forms[event.type][name].forms) {
      let expressions = filename.match(/({.+?:.+?})/g) || [];
      let matches = 0;
      for (let expression of expressions) {
	let match = expression.match(/{(.+?):(.+?)}/);
	if (rider[match[1]] != match[2])
	  break;
	matches++;
      }
      if (matches == expressions.length) {
	matching_filenames.push({
	  filename: filename,
	  matches: matches
	});
      }
    }
    if (matching_filenames.length) {
      return {
	filename: matching_filenames.sort((a, b) => b.matches - a.matches)[0].filename,
	type: pdf_forms[event.type][name].type
      };
    }
  }

  let tmpresult;

  if (Array.isArray(numbers)) {
    let riders = [];
    for (let number of numbers) {
      var rider = await rider_pdf_form_data(connection, id, number, event);
      let form = pdf_form_for_rider(rider);
      if (form == null)
	throw new HTTPError(404, 'Not Found');
      rider.form = form;
      riders.push(rider);
    }

    let tmpfiles = [];
    for (let rider of riders) {
      let form = rider.form;
      delete rider.form;

      var tmpfile = tmp.fileSync();
      tmpfiles.push(tmpfile);

      var filename = `${pdf_dir}/${form.type}/${event.type}/${form.filename}`;
      let promise = spawn('./pdf-fill-form.py', ['--fill', '--print', filename], {
	stdio: ['pipe', tmpfile.fd, process.stderr]
      });
      let child = promise.childProcess;
      child.stdin.write(JSON.stringify(rider));
      child.stdin.end();
      await promise;
    }

    tmpresult = tmp.fileSync();
    let args = tmpfiles.map((tmpfile) => tmpfile.name);
    args.push(tmpresult.name);
    let promise = spawn('pdfunite', args, {
      stdio: ['pipe', process.stdout, process.stderr]
    });
    let child = promise.childProcess;
    child.stdin.end();
    await promise;

    for (let tmpfile of tmpfiles)
      tmpfile.removeCallback();
  } else {
    let rider = await rider_pdf_form_data(connection, id, numbers, event);
    let form = pdf_form_for_rider(rider);
    if (form == null)
      throw new HTTPError(404, 'Not Found');

    tmpresult = tmp.fileSync();
    var filename = `${pdf_dir}/${form.type}/${event.type}/${form.filename}`;
    let promise = spawn('./pdf-fill-form.py', ['--fill', '--print', filename], {
      stdio: ['pipe', tmpresult.fd, process.stderr]
    });
    let child = promise.childProcess;
    child.stdin.write(JSON.stringify(rider));
    child.stdin.end();
    await promise;
  }

  if (direct) {
    let lp = spawn('lp', ['-d', printer], {
      stdio: ['pipe', process.stdout, process.stderr]
    });
    let reader = fs.createReadStream(tmpresult.name);
    reader.pipe(lp.childProcess.stdin);
    await lp;
    tmpresult.removeCallback();
    res.send('Printed to printer ' + encodeURIComponent(printer));
    console.log('Printed to printer ' + printer);
  } else {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}.pdf`);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.sendFile(tmpresult.name, {}, () => {
      tmpresult.removeCallback();
    });
  }
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
    SELECT DISTINCT id, tag, date, title, location, enabled
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
    ORDER BY date, location`, [id]);
  Object.values(event.future_events).forEach((future_event) => {
    delete future_event.id;
  });

  event.zones = [];
  (await connection.queryAsync(`
    SELECT class, zone
    FROM zones
    WHERE id = ?
    ORDER BY class, zone`, [id])
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

  event.scoring_zones = [];
  (await connection.queryAsync(`
    SELECT zone
    FROM scoring_zones
    WHERE id = ?`, [id])
  ).forEach((row) => {
    event.scoring_zones[row.zone - 1] = true;
  });

  event.series = (await connection.queryAsync(`
    SELECT DISTINCT abbreviation
    FROM series_events
    JOIN series USING (serie)
    JOIN classes USING (id)
    JOIN series_classes USING (serie, ranking_class)
    WHERE id = ?
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

async function get_event(connection, id) {
  var revalidate = make_revalidate_event(connection, id);
  return await read_event(connection, id, revalidate);
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
    for (let n = 0; 's'+n in row; n++) {
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
    SELECT *
    FROM rider_rankings
    WHERE ` + filters)
  ).forEach((row) => {
    var rider = riders[row.number];
    if (rider) {
      rider.rankings[row.ranking - 1] = row;
      delete row.id;
      delete row.number;
      delete row.ranking;
    }
  });

  (await connection.queryAsync(`
    SELECT fid, number
    FROM future_starts
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
      or.push('number IN (SELECT number FROM future_events ' +
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
  if (params.zone) {
    filters.push('number IN (SELECT number ' +
		   'FROM riders ' +
		   'JOIN classes USING (id, class) ' +
		   'JOIN (SELECT id, class AS ranking_class, zone ' +
		     'FROM zones ' +
		     'WHERE id = ' + connection.escape(id) +
		   ') AS _ USING (id, ranking_class) ' +
		   'WHERE id = ' + connection.escape(id) +
		   ' AND zone = ' + connection.escape(params.zone) + ')');
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

  for (let table of ['riders', 'riders_groups', 'rider_rankings', 'marks',
		     'rounds', 'new_numbers', 'future_starts']) {
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
		     'rounds', 'future_starts']) {
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

function compute_update_event(id, event) {
  let cached_riders = Object.values(cache.get_riders(id));
  let results = compute_event(cached_riders, event, true);

  for (let n = 0; n < cached_riders.length; n++) {
    let cached_rider = cached_riders[n];
    let result = results[n];

    if (Object.keys(result).some((key) => !deepEqual(result[key], cached_rider[key])))
      Object.assign(cache.modify_rider(id, cached_rider.number), result);
  }
}

async function admin_save_rider(connection, id, number, rider, tag, query) {
  rider = admin_rider_from_api(rider);

  let transaction = await cache.begin(connection, id);
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
	WHERE id = ? AND number < 0`, [id]);
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
      if (!old_rider && !rider.rankings)
	rider.rankings = event.rankings.map((ranking) =>
	  (ranking && ranking.default) ?
	    {"rank": null, "score": null} : null);
      rider = Object.assign(cache.modify_rider(id, number), rider);
    } else {
      await delete_rider(connection, id, number);
    }

    event = cache.modify_event(id);
    event.mtime = moment().format('YYYY-MM-DD HH:mm:ss');

    compute_update_event(id, event);

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

    await cache.commit(transaction);
    if (!old_rider) {
      /* Reload from database to get any default values defined there.  */
      rider = await read_rider(connection, id, number, () => {});
    }

    if (rider)
      return await admin_rider_to_api(connection, id, rider, event);
  } catch (err) {
    await cache.rollback(transaction);
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
  if (reset == 'master' || reset == 'register' || reset == 'start') {
    Object.values(riders).forEach((rider) => {
      rider.finish_time = null;
      rider.tie_break = 0;
      rider.rounds = null;
      rider.failure = 0;
      rider.penalty_marks = null;
      rider.marks = null;
      rider.marks_per_zone = [];
      rider.marks_per_round = [];
      rider.marks_distribution = [];
      rider.rank = null;
      rider.rankings = rider.rankings.map(
        (ranking) => ranking && {rank: null, score: null}
      );
    });
    event.skipped_zones = {};
  }

  if (reset == 'master' || reset == 'register') {
    Object.values(riders).forEach((rider) => {
      rider.paid = false;
      rider.registered = false;
      rider.start = false;
      rider.start_time = null;
      rider.entry_fee = null;
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
	  if (active) {
	    if (base_rider.registered)
	      rider.registered = true;
	    if (base_rider.paid)
	      rider.paid = true;
	  }
	}
      }
    });
  }

  if (reset == 'master') {
    event_reset_numbers(riders);
    Object.values(riders).forEach((rider) => {
      rider.future_starts = {};
      rider.license = null;
      rider.rider_comment = null;
    });
    event.base = null;
    event.base_fid = null;
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
  let transaction = await cache.begin(connection, id);
  try {
    var event = await get_event(connection, id);
    var riders = await get_riders(connection, id);

    if (query.version && event.version != query.version)
      throw new HTTPError(409, 'Conflict');

    event = cache.modify_event(id);
    riders = cache.modify_riders(id);

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
    await cache.commit(transaction);
  } catch (err) {
    await cache.rollback(transaction);
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
		     'future_events', 'future_starts', 'scoring_zones',
		     'scoring_registered_zones', 'scoring_marks']) {
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
  let transaction = await cache.begin(connection, id);
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

      if (event.scoring_zones.length) {
	if (event.access_token == null)
	  event.access_token = random_tag();
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
	cache.check_for_new_riders(id);
      }

      if (!future_event_ids_equal(old_event, event)) {
	if (old_event)
	  await get_riders(connection, id);
	let riders = cache.modify_riders(id);
	await reduce_future_starts(event, riders);
      }

      compute_update_event(id, event);
    } else {
      await delete_event(connection, id);
    }

    await cache.commit(transaction);
    if (!old_event) {
      /* Reload from database to get any default values defined there.  */
      event = await read_event(connection, id, () => {});
    }

    return event;
  } catch (err) {
    await cache.rollback(transaction);
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
    let hash = {};
    classes.forEach((cls) => {
      let ranking = hash[cls.ranking];
      if (!ranking)
	ranking = hash[cls.ranking] = {};
      ranking[cls.ranking_class] = cls;
    });
    return hash;
  }

  await zipHashAsync(
    hash_classes(old_serie.classes), hash_classes(new_serie.classes),
    async function(a, b, ranking) {
      await zipHashAsync(a, b,
	async function(a, b, ranking_class) {
	  await update(connection, 'series_classes',
	    {serie: serie_id, ranking: ranking, ranking_class: ranking_class},
	    undefined,
	    a, b)
	  && (changed = true);
	});
    });

  await zipHashAsync(old_serie.new_numbers, new_serie.new_numbers,
    async function(a, b, id) {
      await zipHashAsync(a, b, async function(a, b, number) {
	await update(connection, 'new_numbers',
	  {serie: serie_id, id: id, number: number},
	  undefined,
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
        undefined,
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
      new_serie.mtime = null;  /* enforce recomputing the results */

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
    Object.values(cache.get_riders(id)).forEach((rider) => {
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
    ['city', 'class', 'club', 'country', 'date_of_birth', 'email',
    'emergency_phone', 'entry_fee', 'failure', 'finish_time', 'first_name',
    'group', 'insurance', 'last_name', 'license', 'non_competing', 'number',
    'paid', 'phone', 'province', 'registered', 'riders', 'rounds', 'start',
    'start_time', 'street', 'vehicle', 'year_of_manufacture', 'zip',
    'guardian', 'comment', 'rider_comment', 'verified',
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

async function get_full_event(connection, id) {
  let revalidate_riders = make_revalidate_riders(connection, id);
  let revalidate_event = make_revalidate_event(connection, id);
  let revalidate = async function() {
    return await revalidate_riders() &&
	   await revalidate_event();
  }
  let event = await read_event(connection, id, revalidate);
  let riders = await read_riders(connection, id, revalidate);
  return {
    event: event,
    riders: riders
  };
}

function ranking_class(rider, event) {
  if (rider.verified && rider.start &&
      (rider.registered || !event.features.registered) &&
      rider.class != null) {
    let class_ = event.classes[rider.class - 1];
    if (class_)
      return class_.ranking_class;
  }
}

function result_marks_per_zone(rider, event, ranking_class) {
  let marks_per_zone = rider.marks_per_zone;
  let skipped_zones = (event.skipped_zones || {})[ranking_class];
  if (skipped_zones) {
    marks_per_zone = clone(marks_per_zone, false);
    for (let round of Object.keys(skipped_zones)) {
      for (let zone of Object.keys(skipped_zones[round])) {
	if ((marks_per_zone[round - 1] || [])[zone - 1] != null)
	  marks_per_zone[round - 1][zone - 1] = null;
      }
    }
  }
  return marks_per_zone;
}

var rider_public_fields = [
  'club', 'country', 'first_name', 'last_name', 'province', 'vehicle',
  'year_of_manufacture', 'start_time', 'finish_time', 'applicant', 'paid'
];

let rider_result_fields = [
  'additional_marks', 'penalty_marks', 'failure', 'marks',
  'marks_distribution', 'marks_per_round', 'non_competing',
  'tie_break', 'rankings'
];

async function get_event_results(connection, id) {
  let ids = [];
  let events = [], last_event;
  let cached_riders = [];

  for(;;) {
    ids.unshift(+id);
    let event_riders = await get_full_event(connection, id);
    let event = event_riders.event;
    if (!last_event)
      last_event = event;
    events.unshift(event);
    cached_riders.unshift(Object.values(event_riders.riders));
    if (!event.combine || event.base == null)
      break;
    let result = await connection.queryAsync(`
      SELECT id
      FROM events
      WHERE tag = ?
    `, [event.base]);
    if (result.length != 1)
      break;
    id = result[0].id;
  }

  function base_rider(rider) {
    let hash = {
      results: []
    };
    for (let field of ['number'])
      hash[field] = rider[field];
    hash.rankings = clone(rider.rankings, false);
    for (let field of rider_public_fields)
      hash[field] = rider[field];
    return hash;
  }

  function rider_result(rider, event, ranking_class) {
    let hash = {};
    for (let field of rider_result_fields)
      hash[field] = rider[field];
    if ((event.classes[rider.class - 1] || {}).non_competing)
      hash.non_competing = true;
    hash.marks_per_zone = result_marks_per_zone(rider, event, ranking_class);
    return hash;
  }

  let riders_by_ranking_class = {};
  if (ids.length == 1) {
    for (let cached_rider of cached_riders[0]) {
      let rc = ranking_class(cached_rider, last_event);
      if (!rc)
	continue;

      let rider = base_rider(cached_rider);
      for (let field of ['rank', 'marks', 'marks_distribution',
			 'decisive_marks', 'failure', 'non_competing'])
	rider[field] = cached_rider[field];
      if ((last_event.classes[cached_rider.class - 1] || {}).non_competing)
	rider.non_competing = true;
      let result = rider_result(cached_rider, events[0], ranking_class);
      for (let field of ['decisive_round'])
	result[field] = cached_rider[field];
      if (cached_rider.unfinished_zones && !cached_rider.failure)
        result.active_round = cached_rider.rounds + 1;
      rider.results.push(result);

      if (!riders_by_ranking_class[rc])
	riders_by_ranking_class[rc] = [];
      riders_by_ranking_class[rc].push(rider);
    }
  } else {
    for (let ev = events.length - 1; ev >= 0; ev--) {
      for (let cached_rider of cached_riders[ev]) {
	let rc = ranking_class(cached_rider, events[ev]);
	if (!rc)
	  continue;

	let riders = riders_by_ranking_class[rc];
	if (!riders)
	  riders = riders_by_ranking_class[rc] = {};
	let rider = riders[cached_rider.number];
	if (!rider) {
	  rider = riders[cached_rider.number] = base_rider(cached_rider);
	  rider.marks_distribution = [];
	  for (let field of ['class', 'group', 'date_of_birth'])
	    rider[field] = cached_rider[field];
	  rider.verified = true;
	  rider.start = true;
	  rider.registered = true;
	}
	let result = rider_result(cached_rider, events[ev], rc);
	result.unfinished_zones = cached_rider.unfinished_zones;
	rider.results[ev] = result;

	if (!(cached_rider.failure || cached_rider.non_competing)) {
	  for (let n in cached_rider.marks_distribution) {
	    if (cached_rider.marks_distribution[n] != null) {
	      rider.marks_distribution[n] =
		(rider.marks_distribution[n] || 0) +
		cached_rider.marks_distribution[n];
	    }
	  }

	  for (let field of ['marks', 'additional_marks', 'penalty_marks']) {
	    if (cached_rider[field] !== undefined)
	      rider[field] = (rider[field] || 0) + cached_rider[field];
	  }
	}
      }
    }
    for (let rc in riders_by_ranking_class) {
      riders_by_ranking_class[rc] =
        Object.values(riders_by_ranking_class[rc]);
    }

    for (let rc in riders_by_ranking_class) {
      for (let rider of riders_by_ranking_class[rc]) {
	rider.unfinished_zones = 0;
	for (let ev = 0; ev < events.length; ev++) {
	  let result = rider.results[ev];
	  if (!result || result.failure || result.non_competing ||
	      result.unfinished_zones != 0) {
	    if (result && !(result.failure || result.non_competing)) {
	      rider.unfinished_zones += result.unfinished_zones || 0;
	      ev++;
	    }
	    /*
	     * Instead of computing the actual number of zones in this class in
	     * each unfinished event, we simply add 1000, assuming that no event
	     * will ever have more than 1000 zones to ride.
	     */
	    rider.unfinished_zones += (events.length - ev) * 1000;
	    break;
	  }
	}
	for (let ev = 0; ev < events.length; ev++) {
	  let result = rider.results[ev];
	  if (result)
	    delete result.unfinished_zones;
	}
      }
    }

    let all_riders = [];
    for (let riders of Object.values(riders_by_ranking_class)) {
      for (let rider of riders)
	all_riders.push(rider);
    }

    let results = compute_event(all_riders, last_event, false);

    for (let n = 0; n < all_riders.length; n++) {
      let rider = all_riders[n];
      let result = results[n];
      delete result.score;
      Object.assign(rider, result);
    }

    for (let rider of all_riders) {
      for (let ranking_idx in rider.rankings) {
	let ranking = rider.rankings[ranking_idx];
	if (ranking) {
	  ranking.score = null;
	  for (let result of rider.results) {
	    if (result) {
	      let result_ranking = result.rankings[ranking_idx];
	      if (result_ranking && result_ranking.score != null)
		ranking.score += result_ranking.score;
	    }
	  }
	}
      }
    }
  }

  var hash = {
    event: {
      features: {}
    },
    events: [],
    rankings: []
  };

  function class_order(a, b) {
    if (last_event.classes[a - 1] &&
        last_event.classes[b - 1])
      return last_event.classes[a - 1].order -
	     last_event.classes[b - 1].order;
    return a - b;
  }

  function ranking_classes(ranking, overall) {
    function class_info(class_nr) {
      let ranking_class = class_nr;
      if (last_event.classes[class_nr - 1])
	ranking_class = last_event.classes[class_nr - 1].ranking_class;
      let hash = {
	ranking_class: class_nr,
	scores: ranking != null &&
		events.some((event) =>
		  (event.rankings[ranking - 1] || {}).assign_scores &&
		  (ranking != 1 ||
		   !(event.classes[class_nr - 1] || {}).no_ranking1)),
	events: [],
	riders: [],
      };
      for (let event of events) {
	hash.events.push({
	  zones: event.zones[ranking_class - 1],
	  skipped_zones: (event.skipped_zones || {})[ranking_class] || {},
	  rounds: event.classes[class_nr - 1].rounds
	});
      }
      if (last_event.classes[class_nr - 1]) {
	for (let key of ['color', 'name'])
	  hash[key] = last_event.classes[class_nr - 1][key];
      }
      return hash;
    }

    function convert_rider(rider) {
      rider = Object.assign({}, rider);
      if (ranking) {
	let rx = rider.rankings[ranking - 1];
	if (rx) {
	  rider.score = rx.score;
	  if (!overall)
	    rider.rank = rx.rank;
	} else {
	  delete rider.score;
	  if (!overall)
	    delete rider.rank;
	}
      }
      for (let result of rider.results) {
	if (result && result.rankings) {
	  let r = result.rankings[ranking - 1];
	  if (r) {
	    result.rank = r.rank;
	    result.score = r.score;
	  }
	  delete result.rankings;
	}
      }
      delete rider.rankings;
      delete rider.unfinished_zones;
      return rider;
    }

    return function(event, filter) {
      let ranking_classes = [];
      for (let rc in riders_by_ranking_class) {
	let riders = riders_by_ranking_class[rc].filter(filter);
	if (riders.length) {
	  let hash = class_info(rc);
	  hash.riders = riders.map(convert_rider);
	  ranking_classes.push(hash);
	}
      }

      if (event.type == 'otsv-acup' && ranking == 2) {
	function color_order(a, b) {
	  try {
	    let color_a = event.classes[a.ranking_class - 1].color;
	    let color_b = event.classes[b.ranking_class - 1].color;
	    if (color_a != color_b)
	      return acup.color_order[color_a] - acup.color_order[color_b];
	  } catch (err) {
	    throw new Error(`Failed to compare ranking classes ${a.ranking_class} and ${b.ranking_class}`);
	  }
	}

	let last_ranking_class;
	ranking_classes = ranking_classes
	  .sort(color_order)
	  .reduce((ranking_classes, ranking_class) => {
	    if (last_ranking_class && !color_order(last_ranking_class, ranking_class)) {
	      let merged = ranking_classes[ranking_classes.length - 1];
	      if (merged === last_ranking_class) {
		merged = ranking_classes[ranking_classes.length - 1] =
		  Object.assign({}, merged);
	        merged.ranking_class = [last_ranking_class.ranking_class];
	      }

	      merged.ranking_class.push(ranking_class.ranking_class);
	      for (let key of ['zones', 'skipped_zones', 'rounds', 'color']) {
		if (!deepEqual(last_ranking_class[key], ranking_class[key]))
		  delete merged[key];
	      }
	      merged.name += ' + ' + ranking_class.name;
	      merged.scores |= ranking_class.scores;
	      merged.riders = merged.riders.concat(ranking_class.riders);
	    } else {
	      ranking_classes.push(ranking_class);
	    }
	    last_ranking_class = ranking_class;
	    return ranking_classes;
	  }, []);
      } else {
        ranking_classes.sort(
	  (a, b) => class_order(a.ranking_class, b.ranking_class));
      }
      return ranking_classes;
    };
  }

  hash.event.riders = 0;
  hash.event.failures = {};
  for (let riders of Object.values(riders_by_ranking_class)) {
    for (let rider of riders) {
      if (rider.rank != null ||
	  rider.rankings.some((ranking) => (ranking || {}).rank != null)) {
	hash.event.riders++;
	if (events.length == 1) {
	  let result = rider.results[0];
	  if (result.non_competing) {
	    hash.event.non_competing =
	      (hash.event.non_competing || 0) + 1;
	  }
	  if ((result.failure || 0) != 0) {
	    hash.event.failures[result.failure] =
	      (hash.event.failures[result.failure] || 0) + 1;
	  }
	}
      }
    }
  }

  function sort_by_rank(ranking_class) {
    ranking_class.riders.sort((a, b) =>
      a.rank - b.rank ||
      a.number - b.number);
    return ranking_class;
  }

  function delete_ranks(ranking_class) {
    for (let rider of ranking_class.riders) {
      for (let n = 0; n < events.length; n++) {
	if (!rider.results[n] ||
	    rider.results[n].failure ||
	    rider.results[n].non_competing) {
	  delete rider.rank;
	  break;
	}
      }
    }
    return ranking_class;
  }

  let result = ranking_classes(last_event.main_ranking, true)(
    last_event,
    (rider) => rider.rank != null
  ).map(sort_by_rank)
  .map(delete_ranks);

  if (result.length) {
    let ranking = {
      ranking: null,
      name: null,
      classes: result
    };
    if (last_event.main_ranking != null) {
      ranking.main_ranking = last_event.main_ranking;
      ranking.main_ranking_name =
        (last_event.rankings[last_event.main_ranking - 1] || {}).name;
    }
    hash.rankings.push(ranking);
  }

  for (let ranking_index in last_event.rankings) {
    ranking_index = +ranking_index;
    if (last_event.rankings[ranking_index].ignore)
      continue;
    if (ranking_index + 1 == last_event.main_ranking)
      continue;

    let result = ranking_classes(ranking_index + 1, false)(
        last_event,
	(rider) => (rider.rankings[ranking_index] || {}).rank != null
      ).map(sort_by_rank)
      .map(delete_ranks);

    if (result.length) {
      hash.rankings.push({
	ranking: +ranking_index + 1,
	name: last_event.rankings[ranking_index].name,
	classes: result
      });
    }
  }

  if (events.length == 1) {
    ['title', 'subtitle', 'date'].forEach(
      (field) => { hash.event[field] = last_event[field]; }
    );
  } else {
    if (last_event.location &&
        events.every((event) => event.location == last_event.location)) {
      let dates = [];
      for (let event of events) {
	if (event.date)
	  dates.push(common.parse_timestamp(event.date));
      }
      hash.event.title = last_event.location;
      if (dates)
	hash.event.title +=  ' am ' + dates_to_string(dates);
    } else {
      hash.event.title = events.map((event) => event.title).join(' und ');
    }
  }

  ['four_marks', 'uci_x10', 'split_score', 'type', 'result_columns', 'country', 'hide_country'].forEach(
    (field) => { hash.event[field] = last_event[field]; }
  );
  rider_public_fields.concat([
    'number', 'additional_marks', 'individual_marks', 'column_5', 'explain_rank'
  ]).forEach((feature) => {
    hash.event.features[feature] = last_event.features[feature];
  });

  for (let ranking of hash.rankings) {
    for (let ranking_class of ranking.classes) {
      for (let ev in ranking_class.events) {
	let ranking_event = ranking_class.events[ev];
	ranking_event.additional_marks =
	  ranking_class.riders.some((rider) =>
	    (rider.results[ev] || {}).additional_marks);
	ranking_event.penalty_marks =
	  ranking_class.riders.some((rider) =>
	    (rider.results[ev] || {}).penalty_marks);
	ranking_event.tie_break =
	  ranking_class.riders.some((rider) =>
	    (rider.results[ev] || {}).tie_break);
      }
      ranking_class.explain_rank =
	ranking_class.riders.some((rider) =>
	  rider.decisive_marks != null);
    }
  }

  for (let event of events) {
    let event_hash = {};
    ['date', 'location'].forEach((field) => {
      event_hash[field] = event[field];
    });
    hash.events.push(event_hash);
  }

  hash.event.mtime = events.reduce(
    (mtime, event) => (mtime || '') > event.mtime ? mtime : event.mtime,
    null);

  if (!hash.rankings.length) {
    let future_events = [];
    last_event.future_events.forEach((future_event) => {
      if (future_event.active) {
	let fe = Object.assign({}, future_event);
	delete fe.active;
	future_events.push(fe);
      }
    });
    future_events.sort((a, b) => {
      a = a.date;
      b = b.date;
      if (a == null || b == null)
	return (a == null) - (b == null);
      return a < b ? -1 : (b < a) ? 1 : 0;
    });
    let registered_riders = cached_riders.slice(-1)[0].filter(
      (rider) => {
	if (rider.verified) {
	  if (rider.start)
	    return true;
	  for (let future_event of future_events) {
	    if (rider.future_starts[future_event.fid])
	      return true;
	  }
      }});
    if (registered_riders.length) {
      let registered = {
	classes: []
      };
      let riders_per_class = [];
      for (let rider of registered_riders) {
	if (!riders_per_class[rider.class - 1])
	  riders_per_class[rider.class - 1] = [];
	riders_per_class[rider.class - 1].push(rider);
      }
      for (let class_idx in riders_per_class) {
	let registered_class = {
	  class: +class_idx + 1,
	};
	if (last_event.classes[class_idx]) {
	  for (let field of ['name', 'color'])
	    registered_class[field] = last_event.classes[class_idx][field];
	}
	registered_class.riders =
	  riders_per_class[class_idx].reduce((riders, rider) => {
	    let hash = {};
	    rider_public_fields.concat([
	      'number', 'start'
	    ]).forEach((field) => {
	      hash[field] = rider[field];
	    });
	    hash.future_starts = [];
	    future_events.forEach((future_event) => {
	      let fid = future_event.fid;
	      if (rider.future_starts[fid])
		hash.future_starts.push(fid);
	    });
	    riders.push(hash);
	    return riders;
	  }, []);
	registered_class.riders.sort((a, b) => {
	  let cmp;
	  cmp = (a.last_name || '').localeCompare(b.last_name || '');
	  if (cmp)
	    return cmp;
	  cmp = (a.first_name || '').localeCompare(b.first_name || '');
	  if (cmp)
	    return cmp;
	  return a.number - b.number;
	});
	registered.classes.push(registered_class);
      }
      registered.classes.sort((a, b) => class_order(a.class, b.class));
      registered.future_events = future_events.reduce(
	(future_events, future_event) => {
	  future_events[future_event.fid] = future_event;
	  delete future_event.fid;
	  return future_events;
	}, {});
      hash.event.riders = registered_riders.length;
      hash.registered = registered;
    }
  }

  return hash;
}

async function get_section_lists(connection, id) {
  let event_riders = await get_full_event(connection, id);
  let event = event_riders.event;
  let riders = event_riders.riders;

  function base_rider(rider, event, rc) {
    let hash = {
    };
    for (let field of ['number', 'class', 'last_name', 'first_name'])
      hash[field] = rider[field];
    hash.marks_per_zone = result_marks_per_zone(rider, event, rc);
    return hash;
  }

  let classes = {};
  let riders_by_ranking_class = {};
  for (let rider of Object.values(riders)) {
    if (!rider.start || (event.features.registered && !rider.registered))
      continue;
    let rc = ranking_class(rider, event);
    if (!rc)
      continue;

    classes[rider.class] = true;
    if (!riders_by_ranking_class[rc])
      riders_by_ranking_class[rc] = [];
    riders_by_ranking_class[rc].push(base_rider(rider, event, rc));
  }

  let riders_by_zone = {};
  for (let rc in riders_by_ranking_class) {
    for (let zone of event.zones[rc - 1]) {
      if (!riders_by_zone[zone])
	riders_by_zone[zone] = [];
      for (let rider of riders_by_ranking_class[rc])
	riders_by_zone[zone].push(rider.number);
    }
  }

  let ranking_classes_by_zone = {};
  for (let rc in riders_by_ranking_class) {
    for (let zone of event.zones[rc - 1]) {
      if (!ranking_classes_by_zone[zone])
	ranking_classes_by_zone[zone] = [];
      ranking_classes_by_zone[zone].push(rc);
    }
  }

  let rounds_by_zone = {};
  for (let zone in ranking_classes_by_zone) {
    rounds_by_zone[zone] = Math.max.apply(this,
      ranking_classes_by_zone[zone].map(
        (rc) => event.classes[rc - 1].rounds));
  }

  var hash = {
    event: {
    },
    riders: {},
    zones: []
  };

  ['title', 'subtitle', 'mtime', 'skipped_zones'].forEach(
    (field) => { hash.event[field] = event[field]; }
  );

  hash.event.classes = [];
  for (let c in classes) {
    var class_ = {};
    for (let field of ['rounds', 'name', 'color', 'ranking_class', 'order'])
      class_[field] = event.classes[c - 1][field];
    hash.event.classes[c - 1] = class_;
  }

  for (let rc in riders_by_ranking_class) {
    for (let rider of riders_by_ranking_class[rc]) {
      hash.riders[rider.number] = rider;
    }
  }

  for (let zone in riders_by_zone) {
    let riders = riders_by_zone[zone];
    riders.sort((a, b) => {
	if (a >= 0) {
	  if (b >= 0)
	    return a - b;
	  return 1;
	} else if (b >= 0) {
	  return -1;
	} else {
	  let cmp;
	  a = hash.riders[a];
	  b = hash.riders[b];
	  cmp = (a.last_name || '').localeCompare(b.last_name || '');
	  if (cmp)
	    return cmp;
	  cmp = (a.first_name || '').localeCompare(b.first_name || '');
	  if (cmp)
	    return cmp;
	}
      });
    hash.zones[zone - 1] = {
      rounds: rounds_by_zone[zone],
      riders: riders
    };
  }

  return hash;
}

async function get_serie_scores(connection, serie_id) {
  let scores = {};

  (await connection.queryAsync(`
    SELECT *
    FROM series_scores
    WHERE serie = ?
  `, [serie_id])).forEach((row) => {
    delete row.serie;

    let ranking = scores[row.ranking];
    if (!ranking)
      ranking = scores[row.ranking] = {};
    delete row.ranking;

    let ranking_class = ranking[row.ranking_class];
    if (!ranking_class)
      ranking_class = ranking[row.ranking_class] = {};
    delete row.ranking_class;

    let rider = ranking_class[row.number];
    if (!rider)
      rider = ranking_class[row.number] = {};
    delete row.number;

    Object.assign(rider, row);
  });

  return scores;
}

async function compute_and_update_serie(connection, serie_id, serie_mtime, last_event) {
  await connection.queryAsync(`BEGIN`);

  let old_rankings = await get_serie_scores(connection, serie_id);
  let rankings = await compute_serie(connection, serie_id, last_event);
  if (!deepEqual(old_rankings, rankings)) {
    await zipHashAsync(old_rankings, rankings,
      async function(a, b, ranking_nr) {
	await zipHashAsync(a, b,
	  async function(a, b, ranking_class_nr) {
	    await zipHashAsync(a, b,
	      async function(a, b, number) {
		await update(connection, 'series_scores',
		  {serie: serie_id, ranking: ranking_nr, ranking_class: ranking_class_nr, number: number},
		  undefined,
		  a, b);
	      });
	  });
      });
  }

  let query = 'UPDATE series ' +
    'SET mtime = ' + connection.escape(serie_mtime) + ' ' +
    'WHERE serie = ' + connection.escape(serie_id);
  log_sql(query);
  await connection.queryAsync(query);

  await connection.queryAsync(`COMMIT`);
}

async function get_serie_results(connection, serie_id) {
  let serie = await get_serie(connection, serie_id);

  let classes_in_serie = [];
  for (let class_ of serie.classes) {
    let ranking_in_serie = classes_in_serie[class_.ranking - 1];
    if (!ranking_in_serie)
      ranking_in_serie = classes_in_serie[class_.ranking - 1] = [];
    ranking_in_serie[class_.ranking_class - 1] = class_;
  }

  function event_active_classes(event) {
    let classes = event.classes;

    let active_classes = [];
    if (event.enabled) {
      let rankings = event.rankings;
      for (let ranking_idx = 0; ranking_idx < rankings.length; ranking_idx++) {
	let active_in_ranking = {};

	if (!rankings[ranking_idx] || rankings[ranking_idx].name == null)
	  continue;
	for (let idx = 0; idx < classes.length; idx++) {
	  if (!classes[idx])
	    continue;
	  let ridx = classes[idx].ranking_class - 1;
	  if (!classes_in_serie[ranking_idx] ||
	      !classes_in_serie[ranking_idx][ridx] ||
	      !classes[ridx])
	    continue;
	  if ((ranking_idx != 0 || !classes[idx].no_ranking1) &&
	      !classes[idx].non_competing &&
	      classes[ridx].rounds > 0 &&
	      event.zones[ridx])
	    active_in_ranking[ridx + 1] = true;
	  }

	  active_in_ranking = Object.keys(active_in_ranking);
	  if (active_in_ranking.length)
	    active_classes[ranking_idx] = active_in_ranking;
	}
      }
      return active_classes;
  }

  let event_has_results = {};
  (await connection.queryAsync(`
    SELECT DISTINCT id
    FROM series_events
    JOIN rider_rankings USING (id)
    WHERE serie = ? AND score IS NOT NULL
  `, [serie_id])).forEach((row) => {
    event_has_results[row.id] = true;
  });

  let events_by_id = {};
  let active_events = [];
  let events_in_class = [];
  for (let id of serie.events) {
    let event = await get_event(connection, id);
    if (!event.enabled)
      continue;

    events_by_id[event.id] = event;
    let active_classes = event_active_classes(event);
    if (active_classes.length && event_has_results[event.id]) {
      active_events.push(event);
      for (let ranking_idx in active_classes) {
	for (let class_ of active_classes[ranking_idx]) {
	  let ranking = events_in_class[ranking_idx];
	  if (!ranking)
	    ranking = events_in_class[ranking_idx] = [];
	  if (!ranking[class_ - 1])
	    ranking[class_ - 1] = [];
	  ranking[class_ - 1].push(event.id);
	}
      }
    }
  }

  let last_event;
  if (active_events.length)
    last_event = active_events[active_events.length - 1];

  let serie_mtime;
  (await connection.queryAsync(`
    SELECT mtime
    FROM series
    WHERE serie = ?
  `, [serie_id])).forEach((row) => {
    serie_mtime = row.mtime;
  });
  if (serie_mtime === undefined)
    throw new HTTPError(404, 'Not Found');

  let needs_recompute =
    serie_mtime == null ||
    Object.values(events_by_id).some((event) => event.mtime > serie_mtime);

  if (needs_recompute) {
    serie_mtime = '0000-00-00 00:00:00';
    Object.values(events_by_id).forEach((event) => {
      if (event.mtime > serie_mtime)
	serie_mtime = event.mtime;
    });
    await compute_and_update_serie(connection, serie_id, serie_mtime, last_event);
  }

  let result = {
    serie: {
      name: serie.name,
      features: []
    },
    events: [],
    rankings: []
  };

  if (last_event) {
    for (let key of ['type', 'split_score', 'result_columns', 'country', 'hide_country'])
      result.serie[key] = last_event[key];

    let features = {};
    rider_public_fields.concat([
      'number'
    ]).forEach((feature) => {
      features[feature] = last_event.features[feature];
    });
    result.serie.features = features;

    let max_ts = 0;
    for (let event of active_events) {
      if (event.mtime) {
	let ts = common.parse_timestamp(event.mtime).getTime();
	if (ts > max_ts)
	  max_ts = ts;
      }
    }
    if (max_ts != 0)
      result.serie.mtime =
	moment(max_ts).format('YYYY-MM-DD HH:mm:ss');

    for (let event of active_events) {
      result.events.push({
	id: event.id,
	title: event.title,
	subtitle: event.subtitle,
	location: event.location,
	date: event.date,
      });
    }

    let event_scores = {};
    (await connection.queryAsync(`
      SELECT ranking, id, ranking_class,
	     COALESCE(new_number, number) AS number, score
      FROM series_events
      JOIN rider_rankings USING (id)
      JOIN riders USING (id, number)
      JOIN classes USING (id, class)
      LEFT JOIN new_numbers USING (serie, id, number)
      WHERE serie = ? AND score IS NOT NULL
    `, [serie_id])).forEach((row) => {
      let ranking_scores = event_scores[row.ranking];
      if (!ranking_scores)
	ranking_scores = event_scores[row.ranking] = {};

      let ranking_class_scores = ranking_scores[row.ranking_class];
      if (!ranking_class_scores)
	ranking_class_scores = ranking_scores[row.ranking_class] = {};

      let rider_scores = ranking_class_scores[row.number];
      if (!rider_scores)
	rider_scores = ranking_class_scores[row.number] = {};

      rider_scores[row.id] = row.score;
    });

    let classes_in_rankings = [];
    (await connection.queryAsync(`
      SELECT ranking, ranking_class
      FROM series_classes
      JOIN (
        SELECT class AS ranking_class, ` + '`order`' + `
	FROM classes
	WHERE id = ?
      ) AS _class USING (ranking_class)
      WHERE serie = ?
      ORDER BY ranking, ` + '`order`' + `
    `, [last_event.id, serie_id])).forEach((row) => {
      let classes_in_ranking = classes_in_rankings[row.ranking - 1];
      if (!classes_in_ranking)
	classes_in_ranking = classes_in_rankings[row.ranking - 1] = [];

      classes_in_ranking.push(row.ranking_class);
    });

    let rider_public = {};
    (await connection.queryAsync(`
      SELECT new_number AS number,
             ${rider_public_fields
	       .map((field) => connection.escapeId(field))
	       .join(', ')}
      FROM riders
      JOIN (
	SELECT last_id AS id,
	       COALESCE(new_numbers.number, series_scores.number) AS number,
	       series_scores.number AS new_number
	FROM series_scores
	LEFT JOIN new_numbers
	  ON series_scores.last_id = new_numbers.id AND
	     series_scores.number = new_numbers.new_number AND
	     series_scores.serie = new_numbers.serie
	WHERE series_scores.serie = ${connection.escape(serie_id)}
      ) AS _series_scores USING (id, number)
    `)).forEach((row) => {
      rider_public[row.number] = row;
    });

    let rankings = [];
    (await connection.queryAsync(`
      SELECT series_scores.*
      FROM series_scores
      JOIN (
        SELECT class AS ranking_class, ` + '`order`' + `
	FROM classes
	WHERE id = ${connection.escape(last_event.id)}
      ) AS _classes USING (ranking_class)
      WHERE serie = ${connection.escape(serie_id)}
      ORDER BY _classes.order, rank, number
    `)).forEach((row) => {
      let ranking_classes = rankings[row.ranking - 1];
      if (!ranking_classes)
	ranking_classes = rankings[row.ranking - 1] = [];

      let scores_in_class = ranking_classes[row.ranking_class - 1];
      if (!scores_in_class) {
	let class_ = {
	  class: row.ranking_class
	};
	for (let key of ['name', 'color'])
	  class_[key] = last_event.classes[row.ranking_class - 1][key];
	for (let key of ['max_events', 'min_events', 'drop_events'])
	  class_[key] = classes_in_serie[row.ranking - 1][row.ranking_class - 1][key];

	scores_in_class = ranking_classes[row.ranking_class - 1] = {
	  class: class_,
	  events: events_in_class[row.ranking - 1][row.ranking_class - 1],
	  riders: []
	};
      }

      row.scores = [];
      let rider_scores = event_scores[row.ranking][row.ranking_class][row.number] || {};
      for (let id of scores_in_class.events)
	row.scores.push(rider_scores[id]);

      for (let key of ['serie', 'ranking', 'ranking_class'])
        delete row[key];
      Object.assign(row, rider_public[row.number]);
      scores_in_class.riders.push(row);
    });

    for (let ranking_idx in classes_in_rankings) {
      let classes_in_ranking = classes_in_rankings[ranking_idx];
      let classes = [];
      for (let class_ of classes_in_ranking) {
	if (!rankings[ranking_idx])
	  continue;
	let class_ranking = rankings[ranking_idx][class_ - 1];
	if (class_ranking)
	  classes.push(class_ranking);
      }

      if ((last_event.rankings[ranking_idx] || {}).joint) {
	if (classes.length > 1) {
	  let joint = {
	    class: {
	      name: classes.map((class_) => class_.class.name).join (' + ')
	    },
	    riders: classes[0].riders
	  };

	  for (let key of ['color', 'max_events', 'min_events', 'drop_events']) {
	    if (classes.slice(1).every((class_) => classes[0].class[key] == class_.class[key]))
	      joint.class[key] = classes[0].class[key];
	  }

	  joint.events = (function() {
	    let events = {};
	    for (let class_ of classes) {
	      for (let id of class_.events)
		events[id] = true;
	    }

	    return active_events.reduce((list, event) => {
	      if (event.id in events)
		list.push(event.id);
	      return list;
	    }, []);
	  })();

	  let class_scores = {}
	  for (let class_ of classes) {
	    let events = [];
	    class_.events.forEach((id) => {
	      events.push(id);
	    });

	    for (let rider of class_.riders) {
	      let rider_scores = class_scores[rider.number];
	      if (!rider_scores)
		rider_scores = class_scores[rider.number] = {};
	      rider.scores.forEach((score, index) => {
		if (score != null) {
		  let id = class_.events[index];
		  rider_scores[id] = (rider_scores[id] || 0) + score;
		}
	      });
	    }
	  }

	  for (let rider of joint.riders) {
	    let rider_scores = class_scores[rider.number];
	    rider.scores = joint.events.map((id) => rider_scores[id] || null);
	  }

	  classes = [joint];
	}
      }

      if (classes.length) {
	result.rankings.push({
	  name: last_event.rankings[ranking_idx].name,
	  classes: classes
	});
      }
    }
  }
  return result;
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

  if (!nonkeys && new_values)
    nonkeys = Object.keys(new_values).filter((key) => !(key in keys));

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
    for (let n = 0; n < rider.marks_distribution.length; n++) {
      if (rider.marks_distribution[n] !== undefined)
        rider['s'+n] = rider.marks_distribution[n];
    }
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
	undefined,
	a, b);
    });

  await zipAsync(old_rider.marks_per_zone, new_rider.marks_per_zone,
    async function(a, b, round_index) {
      await zipAsync(a, b, async function(a, b, zone_index) {
	await update(connection, 'marks',
	  {id: id, number: number, round: round_index + 1, zone: zone_index + 1},
	  undefined,
	  a, b,
	  (x) => (x != null ? {marks: x} : null))
	&& (changed = true);
      });
    });

  await zipAsync(old_rider.marks_per_round, new_rider.marks_per_round,
    async function(a, b, index) {
      await update(connection, 'rounds',
	{id: id, number: number, round: index + 1},
	undefined,
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

  await zipHashAsync(old_rider.future_starts, new_rider.future_starts,
    async function(a, b, fid) {
      await update(connection, 'future_starts',
	{id: id, number: number, fid: fid},
	[],
	a != null && {}, b != null && {})
      && (changed = true);
    });

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
	undefined,
	a, b)
      && (changed = true);
    });

  await zipAsync(old_event.rankings, new_event.rankings,
    async function(a, b, index) {
      await update(connection, 'rankings',
	{id: id, ranking: index + 1},
	undefined,
	a, b)
      && (changed = true);
    });

  await zipAsync(old_event.card_colors, new_event.card_colors,
    async function(a, b, index) {
      await update(connection, 'card_colors',
	{id: id, round: index + 1},
	undefined,
	a, b,
	(color) => (color != null && {color: color}))
      && (changed = true);
    });

  await zipAsync(old_event.scores, new_event.scores,
    async function(a, b, index) {
      await update(connection, 'scores',
	{id: id, rank: index + 1},
	undefined,
	a, b,
	(score) => (score != null && {score: score}))
      && (changed = true);
    });

  await zipAsync(old_event.result_columns, new_event.result_columns,
    async function(a, b, index) {
      await update(connection, 'result_columns',
	{id: id, n: index + 1},
	undefined,
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
		   undefined,
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
		{id: id,
		 'class': class_,
		 round: round,
		 zone: zone},
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

  await zipAsync(old_event.scoring_zones, new_event.scoring_zones,
    async function(a, b, zone_index) {
      await update(connection, 'scoring_zones',
        {id: id, zone: zone_index + 1},
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
    series: true,
    scoring_zones: true
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
  type: true,
  country: true,
  version: true
};

async function register_get_event(connection, id, user) {
  var event = await get_event(connection, id);
  var result = {
    id: id,
    title: event.title,
    location: event.location,
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
      error += ' ist bereits registriert.';
    } else {
      error += ' ist nicht registriert.';
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
    SELECT password, secret
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
  } else if (result.length == 1) {
    params.reset_password = (result[0].password != null);
    if (result[0].secret != req.query.secret) {
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
    penalty_marks: true,
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
  let transaction = await cache.begin(connection, id);
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
	WHERE id = ? AND number < 0`, [id]);
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
	rider.rankings = event.rankings.map((ranking) =>
	  (ranking && ranking.default) ?
	    {"rank": null, "score": null} : null);
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

    await cache.commit(transaction);
    if (!old_rider) {
      /* Reload from database to get any default values defined there.  */
      rider = await read_rider(connection, id, number, () => {});
    }
    notify_registration(id, number, old_rider, rider, event);
  } catch (err) {
    await cache.rollback(transaction);
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
    )

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
    SELECT title, location, date, id, tag
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

function serie_index(view) {
  return async function(req, res, next) {
    try {
      var events = await req.conn.queryAsync(`
	SELECT id, date, title, location,
	       CASE WHEN registration_ends > NOW() THEN registration_ends END AS registration_ends,
	       combine, base_id
	FROM events
	LEFT JOIN (
	  SELECT id AS base_id, tag AS base
	  FROM events
	) AS _ USING (base)
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

      let combined = {};
      for (let event of Object.values(events)) {
	if (event.combine && events[event.base_id])
	  combined[event.base_id] = true;
      }

      if (Object.keys(combined).length) {
	for (let event of Object.values(events)) {
	  if (event.id in combined)
	    continue;

	    let combine = [event];
	    while (event.combine && events[event.base_id]) {
	      event = events[event.base_id];
	      combine.unshift(event);
	    }
	    if (combine.length > 1) {
	      function all_identical(array) {
		for (let value of array) {
		  if (value != array[0])
		    return false;
		}
		return true;
	      }

	      function f(event, format) {
		if (event.ts)
		  return moment(new Date(event.ts)).locale('de').format(format);
	      }

	      let last_event = combine[combine.length - 1];
	      let title;

	      if (all_identical(combine.map((event) => event.location))) {
		title = last_event.location + ' am ';
		if (all_identical(combine.map((event) => f(event, 'YYYY')))) {
		  if (all_identical(combine.map((event) =>  f(event, 'MMMM')))) {
		    title += combine.map((event) => f(event, 'D.')).join(' und ') +
			     ' ' + f(last_event, 'MMMM YYYY');
		  } else {
		    title += combine.map((event) => f(event, 'D. MMMM')).join(' und ') +
			     ' ' + f(last_event, 'YYYY');
		  }
		} else {
		  title += combine.map((event) => f(event, 'D. MMMM YYYY')).join(' und ');
		}
	      } else {
		title = combine.map((event) => event.location + ' am ' + f(event, 'D. MMMM YYYY')).join(' und ');
	      }

	      last_event.title = title;
	    }
	}

	for (let id in combined)
	  delete events[id];
      }

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
      res.marko(view, params);
    } catch (err) {
      next(err);
    }
  };
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
    if (event.rankings[n - 1])
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
	JOIN rankings USING (id, ranking)
	WHERE ranking = ${n}
      ) AS ranking${n} USING (id, number)`).join('') +
      future_events.map((fid, index) => `
      LEFT JOIN (
        SELECT id, number, 1 AS start${index + 2}
	FROM future_starts
	WHERE fid = ${fid}
      ) AS start${index + 2} USING (id, number)`).join('') + `
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
	  if (field.name.match(/^(start|ranking)\d+$/) ||
	      event.features[field.name])
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

  let transaction = await cache.begin(connection, existing_id);
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

    await cache.commit(transaction);
    return {id: id};
  } catch (err) {
    await cache.rollback(transaction);
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

async function scoring_get_registered_zones(connection, id) {
  return (await connection.queryAsync(`
    SELECT zone, device_tag
    FROM scoring_zones
    LEFT JOIN scoring_registered_zones USING (id, zone)
    LEFT JOIN scoring_devices USING (device)
    WHERE id = ?`, [id]))
    .reduce((zones, row) => {
      zones[row.zone] = row.device_tag;
      return zones;
    }, {});
}

async function scoring_get_seq(connection, id) {
  return (await connection.queryAsync(`
    SELECT device_tag, MAX(seq) AS seq
    FROM scoring_marks
    JOIN scoring_devices USING (device)
    WHERE id = ?
    GROUP BY device_tag`, [id]))
    .reduce((seqs, row) => {
      seqs[row.device_tag]  = row.seq;
      return seqs;
    }, {});
}

async function scoring_get_info(connection, id) {
  let event = await get_event(connection, id);
  var riders = await get_riders(connection, id);

  let hash = {
    event: {
      features: {},
      classes: [],
      zones: [],
      skipped_zones: {}
    },
    riders: {},
    seq: {}
  };
  for (let field of ['date', 'location', 'four_marks', 'uci_x10']) {
    hash.event[field] = event[field];
  }
  for (let feature of ['number', 'first_name', 'last_name']) {
    if (event.features[feature])
      hash.event.features[feature] = true;
  }

  let scoring_zones = {};
  for (let index in event.scoring_zones) {
    if (event.scoring_zones[index])
      scoring_zones[+index + 1] = true;
  }
  let scoring_classes = {};
  for (let index in event.classes) {
    for (let zone of event.zones[index] || []) {
      if (scoring_zones[zone]) {
	scoring_classes[+index + 1] = true;
	break;
      }
    }
  }

  let classes = {};
  for (let number in riders) {
    let rider = riders[number];
    let rc = ranking_class(rider, event);
    if (rc && scoring_classes[rc]) {
      classes[rc] = true;
      classes[rider.class] = true;
      let rider_copy = {};
      for (let field of ['class', 'first_name', 'last_name', 'non_competing']) {
	if (event.features[field])
	  rider_copy[field] = rider[field];
      }
      rider_copy.failed = !!rider.failure;
      hash.riders[rider.number] = rider_copy;
    }
  }
  for (let c in classes) {
    let class_ = {};
    for (let field of ['rounds', 'name', 'color', 'ranking_class', 'time_limit'])
      class_[field] = event.classes[c - 1][field];
    hash.event.classes[c - 1] = class_;
    let rc = class_.ranking_class;
    hash.event.zones[rc - 1] = event.zones[rc - 1];
    if (event.skipped_zones[rc]) {
      hash.event.skipped_zones[rc] =
        event.skipped_zones[rc];
    }
  }

  hash.registered_zones = await scoring_get_registered_zones(connection, id);

  hash.devices = (await connection.queryAsync(`
    SELECT device_tag, name
    FROM scoring_devices
    WHERE name IS NOT NULL`)).reduce((devices, row) => {
      devices[row.device_tag] = row.name;
      return devices;
    }, {});

  return hash;
}

async function scoring_get_protocol(connection, id, zones, seq) {
  let protocol = {};
  if (zones.length) {
    let is_older = Object.keys(seq)
      .map((device_tag) => `(device_tag = ${connection.escape(device_tag)} AND seq <= ${connection.escape(seq[device_tag])})`)
      .join(` OR `);
    let is_newer = is_older == `` ? `` : ` AND NOT (${is_older})`;

    (await connection.queryAsync(`
      SELECT scoring_marks.*, device_tag, canceled_device_tag
      FROM scoring_marks
      JOIN scoring_devices AS _1 USING (device)
      LEFT JOIN (
        SELECT device AS canceled_device, device_tag AS canceled_device_tag
	FROM scoring_devices) AS _2 USING (canceled_device)
      WHERE id = ${connection.escape(id)} AND device IN (
        SELECT DISTINCT device
	FROM scoring_marks
	WHERE id = ${connection.escape(id)} AND
	  zone IN (${zones.map((zone) => connection.escape(zone)).join(', ')}))
        ${is_newer}
      ORDER BY device, seq
      `)).forEach((row) => {
	delete row.id;
	delete row.device;
	let device_tag = row.device_tag;
	delete row.device_tag;
	if (row.time != null)
	  row.time = moment.utc(row.time).toDate();
	if (is_cancel_item(row)) {
	  row.canceled_device = row.canceled_device_tag;
	} else {
	  delete row.canceled_device;
	  delete row.canceled_seq;
	}
	delete row.canceled_device_tag;

	if (protocol[device_tag] == null)
	  protocol[device_tag] = [];
	protocol[device_tag].push(row);
      });
  }
  return protocol;
}

async function scoring_register(connection, scoring_device, id, query, data) {
  await connection.queryAsync(`BEGIN`);
  try {
    let old_zones = (await connection.queryAsync(`
      SELECT zone
      FROM scoring_registered_zones
      WHERE id = ?
      AND device = ?`,
      [id, scoring_device.device]))
      .map((row) => row.zone);

    function hash_zones(zones) {
      let hash = {};
      for (let zone of zones)
	hash[zone] = true;
      return hash;
    }

    await zipHashAsync(
      hash_zones(old_zones), hash_zones(data.zones),
      async function(a, b, zone) {
	await update(connection, 'scoring_registered_zones',
	  {id: id, device: scoring_device.device, zone: zone},
	  [],
	  a != null && {}, b != null && {});
      });
    await connection.queryAsync(`COMMIT`);
  } catch (error) {
      await connection.queryAsync(`ROLLBACK`);
  }

  return {
    registered_zones: await scoring_get_registered_zones(connection, id),
    protocol: await scoring_get_protocol(connection, id, data.zones, data.seq)
  };
}

function is_cancel_item(item) {
  return item.canceled_device != null && item.canceled_seq != null;
}

async function scoring_update(connection, scoring_device, id, query, data) {
  await connection.queryAsync(`BEGIN`);
  try {
    let registered_zones = await scoring_get_registered_zones(connection, id);
    for (let device_tag in data.protocol) {
      for (let item of data.protocol[device_tag]) {
	item = Object.assign({}, item, {
	  id: id,
	  device: scoring_device.device
	});
	let table;
	if (is_cancel_item(item)) {
	  let rows = await connection.queryAsync(`
	    SELECT device
	    FROM scoring_marks
	    JOIN scoring_devices USING (device)
	    WHERE id = ${connection.escape(id)} AND
	      device_tag = ${connection.escape(item.canceled_device)} AND
	      seq = ${connection.escape(item.canceled_seq)} AND
	      zone IN (
	        SELECT zone
		FROM scoring_registered_zones
		WHERE device = ${connection.escape(scoring_device.device)}
	      )
	    `);
	  if (!rows.length) {
	    console.log(`No marks to cancel for device ${item.canceled_device}, seq ${item.seq}`);
	    continue;
	  }
	  item.canceled_device = rows[0].device;
	} else {
	  if (device_tag != scoring_device.device_tag) {
	    console.log(`Ignoring updates for device ${device_tag} from device ${scoring_device.device_tag}`);
	    continue;
	  }
	  if (registered_zones[item.zone] != device_tag) {
	    console.log(`Ignoring updates for unregistered zone ${item.zone} from device ${scoring_device.device_tag}`);
	    continue;
	  }
	}
	let sql = `INSERT IGNORE INTO scoring_marks SET ` + Object.keys(item)
	    .map((name) => `${connection.escapeId(name)} = ${connection.escape(item[name])}`)
	    .join(', ')
	log_sql(sql);
	await connection.queryAsync(sql);
      }
    }
    await connection.queryAsync(`COMMIT`);
    return {
      seq: await scoring_get_seq(connection, id)
    };
  } catch (error) {
    console.log(error);
    await connection.queryAsync(`ROLLBACK`);
    return new HTTPError(500, 'Internal Error');
  }
}

function query_string(query) {
  if (!query)
    return '';
  return '?' + Object.keys(query).map(
    (key) => key + (query[key] != '' ?
		    ('=' + encodeURIComponent(query[key])) : '')
  ).join('&');
}

var admin_config = {
  admin: true,
  weasyprint: config.weasyprint,
  sync_target: config.sync_target,
  show_all_future_events: config.show_all_future_events,
  pdf_forms: Object.keys(pdf_forms).reduce(
    function(names, event_type) {
      names[event_type] = Object.keys(pdf_forms[event_type]).reduce(
        (names, name) => {
	  var form_type = pdf_forms[event_type][name].type;
	  var hash = {
	    name: name
	  };
	  if (form_type in (config.printers || {}))
	    hash.direct = true;
	  names.push(hash);
	  return names;
	}, []);
      names[event_type].sort((a,b) => a.name.localeCompare(b.name));
      return names;
    }, {})
};

var event_config = {
  weasyprint: false
}, serie_config = event_config;

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
  config.session.secret = crypto.randomBytes(64).toString('hex');

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

app.get('/', conn(pool), serie_index(views['index']));

app.get('/login/', function(req, res, next) {
  var params = {
    mode: 'login',
    email: ''
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
  res.send('var config = ' + JSON.stringify(admin_config, null, '  ') + ';');
});

/*
 * Let Angular handle page-internal routing.  (Static files in /admin/ such as
 * /admin/misc.js are handled by express.static.)
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

app.get('/event/config.js', function(req, res, next) {
  res.type('application/javascript');
  res.send('var config = ' + JSON.stringify(event_config, null, '  ') + ';');
});

app.get('/serie/config.js', function(req, res, next) {
  res.type('application/javascript');
  res.send('var config = ' + JSON.stringify(serie_config, null, '  ') + ';');
});

app.use(express.static('htdocs', {etag: true}));

app.get('/admin/*', function(req, res, next) {
  res.sendFile('admin/index.html', sendFileOptions);
});

app.get('/register/*', function(req, res, next) {
  res.sendFile('register/index.html', sendFileOptions);
});

app.get('/event/*', function(req, res, next) {
  res.sendFile('event/index.html', sendFileOptions);
});

app.get('/serie/*', function(req, res, next) {
  res.sendFile('serie/index.html', sendFileOptions);
});

app.get('/api/event/:id/results', conn(pool), function(req, res, next) {
  get_event_results(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/sections', conn(pool), function(req, res, next) {
  get_section_lists(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.get('/api/serie/:serie/results', conn(pool), async function(req, res, next) {
  get_serie_results(req.conn, req.params.serie)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

/*
 * Accessible for score taking:
 */

async function uses_access_token(req, res, next) {
  let result = await req.conn.queryAsync(`
    SELECT id
    FROM events
    WHERE access_token = ?`,
    [req.params.access_token]);
  if (result.length != 1)
    return next(new HTTPError(404, 'Not Found'));
  req.params.id = result[0].id;
  next();
}

async function will_take_scores(req, res, next) {
  try {
    let scoring_device = {
      device_tag: req.headers['x-device-tag']
    };
    if (scoring_device.device_tag == null)
      return next(new HTTPError(403, 'Forbidden'));

    let result = await req.conn.queryAsync(`
      SELECT device, name
      FROM scoring_devices
      WHERE device_tag = ? `,
      [scoring_device.device_tag]);
    if (result.length == 1) {
      scoring_device.device = result[0].device;
      scoring_device.name = result[0].name;
    } else {
      await req.conn.queryAsync(`BEGIN`);
      result = await req.conn.queryAsync(`
	SELECT COALESCE(MAX(device), 0) + 1 AS device
	FROM scoring_devices`);
      scoring_device.device = result[0].device;
      await req.conn.queryAsync(`
	INSERT INTO scoring_devices
	SET device = ?, device_tag = ?`,
	[scoring_device.device, scoring_device.device_tag]);
      await req.conn.queryAsync(`COMMIT`);
    }
    req.scoring_device = scoring_device;

    next();
  } catch (error) {
    next(error);
  }
}

app.get('/api/scoring/:access_token', conn(pool), uses_access_token, async function(req, res, next) {
  scoring_get_info(req.conn, req.params.id)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.put('/api/scoring/:access_token/register', conn(pool), uses_access_token, will_take_scores, async function(req, res, next) {
  scoring_register(req.conn, req.scoring_device, req.params.id, req.query, req.body)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

app.post('/api/scoring/:access_token', conn(pool), uses_access_token, will_take_scores, async function(req, res, next) {
  scoring_update(req.conn, req.scoring_device, req.params.id, req.query, req.body)
  .then((result) => {
    res.json(result);
  }).catch(next);
});

/*
 * Accessible to all registered users:
 */

app.use('/api', conn(pool));
app.all('/api/*', auth);

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

/*
 * Accessible to admins only:
 */

app.all('/api/*', may_admin);

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
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.sendFile(tmp_pdf.name, {}, () => {
      tmp_pdf.removeCallback();
    });
  });
});

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

app.get('/api/event/:tag/export', will_read_event, function(req, res, next) {
  admin_export_event(req.conn, req.params.id, req.user.email)
  .then((result) => {
    let filename = req.query.filename || result.filename;
    res.type('application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(result.data);
  }).catch(next);
});

app.get('/api/event/:tag/csv', will_read_event, function(req, res, next) {
  admin_export_csv(req.conn, req.params.id)
  .then((result) => {
    let filename = req.query.filename || 'Fahrerliste.csv';
    res.type('text/comma-separated-values');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
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

app.get('/api/event/:id/pdf-form', will_read_event, async function(req, res, next) {
  try {
    await admin_pdf_form(res, req.conn, req.params.id, req.query.name, req.query.number, false);
  } catch (err) {
    next(err);
  }
});

app.post('/api/event/:id/pdf-form', will_read_event, async function(req, res, next) {
  try {
    await admin_pdf_form(res, req.conn, req.params.id, req.query.name, req.query.number, true);
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

require('systemd');

if (!config.http && !config.https) {
  var http = require('http');
  try {
    http.createServer(app).listen('systemd');
  } catch (_) {
    config.http = {};
  };
}

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

(function() {
  const timer = setInterval(() => { cache.expire() }, cache_max_age / 10);
  timer.unref();
})();

/* ex:set shiftwidth=2: */
