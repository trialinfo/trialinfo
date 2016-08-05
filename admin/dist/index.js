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

let validate_user = (() => {
  var _ref = _asyncToGenerator(function* (connection, user) {
    if (!user || !user.name || !user.password) throw 'Wrong username or password';

    var rows = yield connection.queryAsync(`
    SELECT password FROM users WHERE username = ?`, user.name);

    try {
      var hash = rows[0].password;
      if (apache_md5(user.password, hash) == hash) return user;
      console.error('Wrong password for user ' + JSON.stringify(user.name));
    } catch (e) {
      console.error('User ' + JSON.stringify(user.name) + ' does not exist');
    }
    throw 'Wrong username or password';
  });

  return function validate_user(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

/*
 * Cache
 */


let get_list = (() => {
  var _ref2 = _asyncToGenerator(function* (connection, table, index, key, key_value, column) {
    return connection.queryAsync(`
    SELECT *
    FROM ` + table + `
    WHERE ` + key + ` = ?`, key_value).then(function (row) {
      var list = [];
      row.forEach(function (_) {
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
  });

  return function get_list(_x3, _x4, _x5, _x6, _x7, _x8) {
    return _ref2.apply(this, arguments);
  };
})();

let get_series = (() => {
  var _ref3 = _asyncToGenerator(function* (connection, username) {
    return connection.queryAsync(`
    SELECT serie, name, abbreviation, closed
    FROM series
    JOIN series_all_users USING (serie)
    WHERE username = ?
    ORDER BY serie`, username);
  });

  return function get_series(_x9, _x10) {
    return _ref3.apply(this, arguments);
  };
})();

let get_serie = (() => {
  var _ref4 = _asyncToGenerator(function* (connection, serie_id) {
    var series = yield connection.queryAsync(`
    SELECT *
    FROM series
    WHERE serie = ?`, serie_id);

    if (series.length != 1) throw 'No serie with number ' + JSON.stringify(serie_id) + ' exists';

    var serie = series[0];

    series.events = (yield connection.queryAsync(`
    SELECT id
    FROM series_events
    JOIN events USING (id)
    WHERE serie = ?
    ORDER BY date, id`, serie_id)).map(function (row) {
      return row.id;
    });

    serie.classes = yield connection.queryAsync(`
    SELECT ranking_class AS class, events, drop_events
    FROM series_classes
    WHERE serie = ?`, serie_id);

    serie.new_numbers = {};
    (yield connection.queryAsync(`
    SELECT id, number, new_number
    FROM new_numbers
    WHERE serie = ?`, serie_id)).forEach(function (row) {
      var event = serie.new_numbers[row.id];
      if (!event) event = serie.new_numbers[row.id] = {};
      event[row.number] = row.new_number;
    });

    return serie;
  });

  return function get_serie(_x11, _x12) {
    return _ref4.apply(this, arguments);
  };
})();

let get_events = (() => {
  var _ref5 = _asyncToGenerator(function* (connection, username) {
    var ids = yield connection.queryAsync(`
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
    ids.forEach(function (row) {
      enabled[row.id] = true;
    });

    var events_hash = {};

    var events = yield connection.queryAsync(`
    SELECT DISTINCT id, tag, date, title, enabled
    FROM events
    JOIN events_all_users USING (id)
    LEFT JOIN rankings USING (id)
    WHERE username = ? AND ranking = 1
    ORDER BY date, title, id`, username);

    events.forEach(function (row) {
      events_hash[row.id] = row;
      row.series = [];
      row.closed = !enabled[row.id];
    });

    (yield connection.queryAsync(`
    SELECT id, serie, abbreviation
    FROM series_events
    JOIN series USING (serie)
    WHERE abbreviation != '' AND abbreviation IS NOT NULL
    ORDER BY serie`)).forEach(function (row) {
      var event = events_hash[row.id];
      if (event) {
        delete row.id;
        event.series.push(row);
      }
    });

    return events;
  });

  return function get_events(_x13, _x14) {
    return _ref5.apply(this, arguments);
  };
})();

let read_event = (() => {
  var _ref7 = _asyncToGenerator(function* (connection, id, revalidate) {
    var event = cache.get_event(id);
    if (event && (!revalidate || (yield revalidate()))) return event;

    var events = yield connection.queryAsync(`
    SELECT *
    FROM events
    WHERE id = ?`, id);

    if (events.length != 1) throw 'No event with number ' + JSON.stringify(id) + ' exists';

    event = events[0];

    event.classes = yield get_list(connection, 'classes', 'class', 'id', id);
    event.rankings = yield get_list(connection, 'rankings', 'ranking', 'id', id);

    event.card_colors = yield get_list(connection, 'card_colors', 'round', 'id', id, 'color');
    event.scores = yield get_list(connection, 'scores', 'rank', 'id', id, 'score');

    event.zones = [];
    (yield connection.queryAsync(`
    SELECT class, zone
    FROM zones
    WHERE id = ?`, id)).forEach(function (row) {
      var class_ = event.zones[row['class'] - 1];
      if (!class_) class_ = event.zones[row['class'] - 1] = [];
      class_.push(row.zone);
    });

    event.features = {};
    (yield connection.queryAsync(`
    SELECT feature
    FROM event_features
    WHERE id = ?`, id)).forEach(function (row) {
      event.features[row.feature] = true;
    });

    if (event.features.skipped_zones) {
      event.skipped_zones = {};
      (yield connection.queryAsync(`
      SELECT class, round, zone
      FROM skipped_zones
      WHERE id = ?`, id)).forEach(function (row) {
        var classes = event.skipped_zones;
        var rounds = classes[row['class']];
        if (!rounds) rounds = classes[row['class']] = {};
        var zones = rounds[row.round];
        if (!zones) zones = rounds[row.round] = {};
        zones[row.zone] = true;
      });
    }

    cache.set_event(id, event);
    return event;
  });

  return function read_event(_x15, _x16, _x17) {
    return _ref7.apply(this, arguments);
  };
})();

let get_event = (() => {
  var _ref8 = _asyncToGenerator(function* (connection, id) {
    var revalidate = make_revalidate_event(connection, id);
    var event = yield read_event(connection, id, revalidate);
    var copy = clone(event, false, 1);

    copy.features = Object.keys(event.features);

    /* FIXME: The current representation isn't very compact, and only useful for data entry. */
    copy.skipped_zones = [];
    Object.keys(event.skipped_zones).forEach(function (_) {
      copy.skipped_zones[_ - 1] = function (event_class) {
        var rounds = [];
        Object.keys(event_class).forEach(function (_) {
          rounds[_ - 1] = function (event_round) {
            var sections = [];
            Object.keys(event_round).sort(function (a, b) {
              return a - b;
            }).forEach(function (_) {
              sections.push(+_);
            });
            return sections;
          }(event_class[_]);
        });
        return rounds;
      }(event.skipped_zones[_]);
    });

    copy.base = { tag: event.base };
    if (event.base != null) {
      var bases = yield connection.queryAsync(`
      SELECT tag, id, title
      FROM events
      JOIN rankings USING(id)
      WHERE tag = ? AND ranking = 1`, event.base);

      if (bases.length == 1) {
        Object.assign(copy.base, bases[0]);

        var _ = yield connection.queryAsync(`
        SELECT COUNT(*) AS start_tomorrow
	FROM riders
	JOIN event_features USING (id)
	WHERE id = ? AND start_tomorrow AND feature = 'start_tomorrow'`, copy.base.id);
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
  });

  return function get_event(_x18, _x19) {
    return _ref8.apply(this, arguments);
  };
})();

let read_riders = (() => {
  var _ref10 = _asyncToGenerator(function* (connection, id, revalidate) {
    let riders = cache.get_riders(id);
    if (riders && (!revalidate || (yield revalidate()))) return riders;

    riders = {};

    (yield connection.queryAsync(`
    SELECT *
    FROM riders
    WHERE id = ?`, id)).forEach(function (row) {
      riders[row.number] = row;

      delete row.id;
      row.marks_distribution = [];
      for (let n = 0; n <= 5; n++) {
        if (row['s' + n] != null) row.marks_distribution[n] = row['s' + n];
        delete row['s' + n];
      }
      row.marks_per_zone = [];
      row.marks_per_round = [];
    });

    (yield connection.queryAsync(`
    SELECT number, round, zone, marks
    FROM marks
    WHERE id = ?`, id)).forEach(function (row) {
      if (riders[row.number]) {
        var marks_per_zone = riders[row.number].marks_per_zone;
        var round = marks_per_zone[row.round - 1];
        if (!round) round = marks_per_zone[row.round - 1] = [];
        round[row.zone - 1] = row.marks;
      }
    });

    (yield connection.queryAsync(`
    SELECT number, round, marks
    FROM rounds
    WHERE id = ?`, id)).forEach(function (row) {
      if (riders[row.number]) riders[row.number].marks_per_round[row.round - 1] = row.marks;
    });

    cache.set_riders(id, riders);
    return riders;
  });

  return function read_riders(_x20, _x21, _x22) {
    return _ref10.apply(this, arguments);
  };
})();

let get_event_suggestions = (() => {
  var _ref11 = _asyncToGenerator(function* (connection, id) {
    var riders = yield read_riders(connection, id);

    var suggestions = {};
    ['district', 'country', 'vehicle', 'club'].forEach(function (field) {
      var hist = {};
      Object.values(riders).forEach(function (rider) {
        var value = rider[field];
        if (value != null && value != '') {
          if (value in hist) hist[value]++;else hist[value] = 1;
        }
      });
      var values = Object.keys(hist).sort(function (a, b) {
        return hist[b] - hist[a];
      });
      suggestions[field] = values.slice(0, 100);
    });
    return suggestions;
  });

  return function get_event_suggestions(_x23, _x24) {
    return _ref11.apply(this, arguments);
  };
})();

let read_rankings = (() => {
  var _ref12 = _asyncToGenerator(function* (connection, id, revalidate) {
    var rankings = cache.get_rankings(id);
    if (rankings && (!revalidate || (yield revalidate()))) return rankings;

    rankings = [];

    (yield connection.queryAsync(`
    SELECT ranking, number, subrank, score
    FROM rider_rankings
    WHERE id = ?`, id)).forEach(function (row) {
      var riders = rankings[row.ranking - 1];
      if (!riders) riders = rankings[row.ranking - 1] = {};
      riders[row.number] = { rank: row.subrank, score: row.score };
    });

    cache.set_rankings(id, rankings);
    return rankings;
  });

  return function read_rankings(_x25, _x26, _x27) {
    return _ref12.apply(this, arguments);
  };
})();

let get_rider = (() => {
  var _ref13 = _asyncToGenerator(function* (connection, id, number) {
    let revalidate = make_revalidate_rider(connection, id, number);
    var riders = yield read_riders(connection, id, revalidate);
    var rankings = yield read_rankings(connection, id, revalidate);

    if (!riders[number]) return {};

    var rider = clone(riders[number], false, 1);

    /*
     * FIXME: A (sorted) list of enabled rankings would be a better representation.
     */
    var rider_rankings = [];
    rankings.forEach(function (ranking, index) {
      if (ranking[number]) rider_rankings[index] = true;
    });
    rider.rankings = rider_rankings;

    return rider;
  });

  return function get_rider(_x28, _x29, _x30) {
    return _ref13.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { return step("next", value); }, function (err) { return step("throw", err); }); } } return step("next"); }); }; }

var Promise = require('bluebird');
var compression = require('compression');
var express = require('express');
var mysql = require('mysql');
var clone = require('clone');

/*
 * Authentication
 */
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var config = require('./config.js');

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
  filter: name => name === 'query',
  multiArgs: true });
Promise.promisifyAll(require('mysql/lib/Connection').prototype);

/*
 * mysql: type cast TINYINT(1) to bool
 */
function myTypeCast(field, next) {
  if (field.type == 'TINY' && field.length == 1) {
    return field.string() == '1'; // 1 = true, 0 = false
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
  dateStrings: true
});

var cache = {
  cached_events: {},
  get_event: function (id) {
    return this.cached_events[id];
  },
  set_event: function (id, event) {
    this.cached_events[id] = event;
  },

  cached_riders: {},
  get_riders: function (id) {
    return this.cached_riders[id];
  },
  set_riders: function (id, riders) {
    this.cached_riders[id] = riders;
  },

  cached_rankings: {},
  get_rankings: function (id) {
    return this.cached_rankings[id];
  },
  set_rankings: function (id, rankings) {
    this.cached_rankings[id] = rankings;
  }
};

function make_revalidate_event(connection, id) {
  var valid;

  return _asyncToGenerator(function* () {
    if (valid != null) return valid;

    let event = cache.get_event(id);
    let version;
    (yield connection.queryAsync(`
      SELECT version
      FROM events
      WHERE id = ?`, id)).forEach(function (row) {
      version = row.version;
    });

    let cached_version = (event || {}).version;
    valid = cached_version == version;
    if (!valid) console.log('/event/' + id + ': version ' + cached_version + ' != ' + version);
    return valid;
  });
}

function make_revalidate_rider(connection, id, number) {
  var valid;

  return _asyncToGenerator(function* () {
    if (valid != null) return valid;

    let riders = cache.get_riders(id);
    let version;
    (yield connection.queryAsync(`
      SELECT version
      FROM riders
      WHERE id = ? AND number = ?`, [id, number])).forEach(function (row) {
      version = row.version;
    });

    let cached_version = (riders[number] || {}).version;
    valid = cached_version == version;
    if (!valid) console.log('/event/' + id + '/rider/' + number + ': version ' + cached_version + ' != ' + version);
    return valid;
  });
}

passport.use('local', new LocalStrategy((name, password, done) => {
  // console.log('LocalStrategy("' + name + '", "' + password + '")');
  pool.getConnectionAsync().then(connection => {
    validate_user(connection, { name: name, password: password }).then(user => {
      return done(null, user);
    }).catch(String, msg => {
      return done(null, false, { message: msg });
    }).catch(err => {
      return done(err);
    }).finally(() => {
      connection.release();
    });
  });
}));

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

var app = express();

function clientErrorHandler(err, req, res, next) {
  if (!res.headersSent) {
    if (typeof err === 'string' || err instanceof String) {
      res.send({ error: err });
      // return next();
    }
    res.status(500);
    res.send({ error: err.message || err });
  }
  next(err);
}

function conn(pool) {
  return function (req, res, next) {
    if (req.conn) return next();

    conn = pool.getConnectionAsync().then(connection => {
      req.conn = connection;
      var end = res.end;
      res.end = function () {
        connection.release();
        delete req.conn;
        res.end = end;
        res.end.apply(res, arguments);
      };

      next();
    }).catch(next);
  };
}

function auth(req, res, next) {
  return validate_user(req.conn, req.user).then(() => {
    next();
  }).catch(String, function () {
    res.status(403);
    res.json({ message: 'Not Authorized' });
  }).catch(function (err) {
    next(err);
  });
}

function will_read_event(req, res, next) {
  req.conn.queryAsync(`
    SELECT 1
    FROM events_all_users
    WHERE id = ? AND username = ?`, [req.params.id, req.user.name]).then(allowed => {
    return next();

    if (allowed.length == 0) return Promise.reject('No read access to event ' + JSON.stringify(req.params.id) + ' for user ' + JSON.stringify(req.user.name));
    next();
  }).catch(next);
}

function will_write_event(req, res, next) {
  req.conn.queryAsync(`
    SELECT 1
    FROM events_all_users
    WHERE id = ? AND username = ? AND NOT read_only`, [req.params.id, req.user.name]).then(allowed => {
    return next();

    if (allowed.length == 0) return Promise.reject('No write access to event ' + JSON.stringify(req.params.id) + ' for user ' + JSON.stringify(req.user.name));
    next();
  }).catch(next);
}

function will_read_serie(req, res, next) {
  req.conn.queryAsync(`
    SELECT 1
    FROM series_all_users
    WHERE serie = ? AND username = ?`, [req.params.serie, req.user.name]).then(allowed => {
    if (allowed.length == 0) return Promise.reject('No read access to serie ' + JSON.stringify(req.params.serie) + ' for user ' + JSON.stringify(req.user.name));
    next();
  }).catch(next);
}

function will_write_serie(req, res, next) {
  req.conn.queryAsync(`
    SELECT 1
    FROM series_all_users
    WHERE serie = ? AND username = ? AND NOT read_only`, [req.params.serie, req.user.name]).then(allowed => {
    if (allowed.length == 0) return Promise.reject('No write access to serie ' + JSON.stringify(req.params.serie) + ' for user ' + JSON.stringify(req.user.name));
    next();
  }).catch(next);
}

app.set('case sensitive routing', true);

app.configure(function () {
  app.use(express.logger());
  app.use(express.static('htdocs'));
  app.use(express.bodyParser());
  app.use(express.cookieParser((config.session || {}).secret || 'secret'));
  app.use(express.cookieSession());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/api', conn(pool));
  app.use('/api', auth);
  app.use(compression());
  app.use(app.router);
  app.use(clientErrorHandler);
});

app.post('/login', passport.authenticate('local', {
  successRedirect: '/admin',
  failureRedirect: '/'
}));

app.get('/logout', function (req, res, next) {
  req.logout();
  res.redirect('/');
});

app.get('/api/events', function (req, res, next) {
  get_events(req.conn, req.user.name).then(result => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id', will_read_event, function (req, res, next) {
  get_event(req.conn, req.params.id).then(result => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/suggestions', will_read_event, function (req, res, next) {
  get_event_suggestions(req.conn, req.params.id).then(result => {
    res.json(result);
  }).catch(next);
});

app.get('/api/event/:id/rider/:number', will_read_event, function (req, res, next) {
  get_rider(req.conn, req.params.id, req.params.number).then(result => {
    res.json(result);
  }).catch(next);
});

app.get('/api/series', function (req, res, next) {
  get_series(req.conn, req.user.name).then(result => {
    res.json(result);
  }).catch(next);
});

app.get('/api/serie/:serie', will_read_serie, function (req, res, next) {
  get_serie(req.conn, req.params.serie).then(result => {
    res.json(result);
  }).catch(next);
});

/*
 * Let Angular handle page-internal routing.
 */
app.get('/admin/*', function (req, res, next) {
  res.sendfile('htdocs/admin/index.html');
});

if (!config.http && !config.https) config.http = {};

if (config.http) {
  var http = require('http');
  var port = config.http.port || 3080;
  http.createServer(app).listen(port);
}

if (config.https) {
  var fs = require('fs');
  var https = require('https');
  var options = {
    key: fs.readFileSync(config.https.key),
    cert: fs.readFileSync(config.https.cert)
  };
  var port = config.https.port || 3443;
  https.createServer(options, app).listen(port);
}

/* ex:set shiftwidth=2: */