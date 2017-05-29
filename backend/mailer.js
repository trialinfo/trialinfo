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

require('any-promise/register/bluebird');

var config = require('./config.js');
var Promise = require('bluebird');
var mysql = require('mysql');
// var common = require('./htdocs/js/common');
var moment = require('moment');
var simpleParser = require('mailparser').simpleParser;
var nodemailer = require('nodemailer');

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

async function main() {
  var mail = await simpleParser(process.stdin);

  var transporter = nodemailer.createTransport(Object.assign({}, config.nodemailer));

  async function status_reply(message, subject) {
    if (!config.from) {
      console.error(message);
      return;
    }

    var message_id = mail.headers.get('message-id');
    var return_path =
      (mail.headers.get('return-path') ||
       mail.headers.get('sender') ||
       mail.headers.get('from')).text;

    var headers = {};
    if (message_id) {
      headers['References'] = message_id;
      headers['In-Reply-To'] = message_id;
    }
    await transporter.sendMail({
      date: moment().locale('en').format('ddd, DD MMM YYYY HH:mm:ss ZZ'),
      from: config.from,
      to: return_path,
      subject: subject,
      text: message,
      headers: headers
    });
  }

  async function error_reply(message) {
    await status_reply(message, 'Zustellung fehlgeschlagen');
  }

  if (mail.attachments.length != 0)
    return await error_reply("Nachrichten mit Attachments werden nicht unterstützt.");

  var match = mail.to.text.match(/\+(.{16})@/);
  if (!match)
    return await error_reply("Kein Veranstaltungs-Tag in Adresse '" + mail.to.text + "' gefunden.");
  var tag = match[1];

  var connection = await pool.getConnectionAsync();
  try {
    var rows;
    rows = await connection.queryAsync(`
      SELECT id
      FROM events
      WHERE tag = ?`, [tag]);
    if (!rows.length)
      return await error_reply("Veranstaltungs-Tag '" + tag + "' nicht gefunden.");
    var id = rows[0].id;
    rows = await connection.queryAsync(`
      SELECT DISTINCT riders.email, users.user_tag
      FROM riders
      LEFT JOIN users USING (email)
      WHERE id = ? AND riders.email IS NOT NULL AND (users.email IS NULL OR users.notify)
      ORDER BY riders.email
    `, [id]);
  } finally {
    connection.release();
  }

  // rows = rows.filter(row => row.email == 'andreas.gruenbacher@gmail.com');

  let date = moment().locale('en').format('ddd, DD MMM YYYY HH:mm:ss ZZ');

  var jobs = [];
  for (let row of rows) {
    let unsubscribe = 'https://otsv.trialinfo.at/action/clear-notify?' +
      'email=' + encodeURIComponent(row.email);
    if (row.user_tag)
      unsubscribe += '&user_tag=' + row.user_tag;

    let message = mail.text + `
--
Ankündigungen über ÖTSV-Veranstaltungen können über folgenden Link abbestellt werden:
  ${unsubscribe}
`;

    var promise;
    if (config.from) {
      var headers = {
	'Auto-Submitted': 'auto-generated',
      };

      promise = transporter.sendMail({
	date: date,
	from: config.from,
	to: row.email,
	subject: mail.subject,
	text: message,
	headers: headers
      });
    } else {
      console.log('Date: ' + date);
      console.log('To: ' + row.email);
      console.log('Subject: ' + mail.subject);
      console.log('');
      console.log(message);
      console.log('');

      promise = Promise.resolve();
    }
    jobs.push({
      email: row.email,
      promise: promise
    });
  }

  var success = [];
  var failure = [];

  for (let job of jobs) {
    try {
      await job.promise;
      success.push(job.email);
    } catch (err) {
      failure.push(job.email);
    };
  }

  var message = '';

  if (success)
    message = message + 'Gesendet an:\n' + success.join('\n') + '\n';

  if (failure)
    message = message + 'Zustellung fehlgeschlagen an:\n' + failure.join('\n') + '\n';

  await status_reply(message, 'Zustellungsbericht');
}

main();

/* ex:set shiftwidth=2: */
