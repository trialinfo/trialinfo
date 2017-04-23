'use strict';

function parse_timestamp(timestamp) {
  var match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
  if (match[4] !== undefined)
    return new Date(match[1], match[2] - 1, match[3], match[4], match[5], match[6]);
  else
    return new Date(match[1], match[2] - 1, match[3]);
}

/*
 * Return the date of the event and, if the date of the event is not set, the
 * current date.
 */
function date_of_event(event) {
  var match;

  return (event.date &&
	  (match = event.date.match(/^(\d{4})-(\d{2})-(\d{2})$/))) ?
    new Date(match[1], match[2] - 1, match[3]) : new Date();
}

function guardian_visible(rider, event) {
  var match;

  if (!rider ||
      rider.date_of_birth == null ||
      !(match = rider.date_of_birth.match(/^(\d{4})-(\d{2})-(\d{2})$/)))
    return false;

  var date_of_birth = new Date(match[1], match[2] - 1, match[3]);
  var now = date_of_event(event);

  var age = new Date();
  age.setTime(now - date_of_birth);
  age = age.getFullYear() - 1970;
  return age < 18;
}

var countries = [
  {name: 'Deutschland', codes: ['D', 'DE', 'DEU', 'GER', 'Germany', 'Allemagne']},
  {name: 'England', codes: ['GB', 'GBR', 'UK', 'Großbritannien']},
  {name: 'Frankreich', codes: ['F', 'FR', 'FRA', 'France']},
  {name: 'Italien', codes: ['I', 'IT', 'ITA', 'Italia']},
  {name: 'Kroation', codes: ['HR', 'HRV', 'Hrvatska']},
  {name: 'Niederlande', codes: ['NL', 'NLD', 'Nederland']},
  {name: 'Österreich', codes: ['A', 'AT', 'AUT', 'Ö', 'Austria', 'Autriche']},
  {name: 'Polen', codes: ['PL', 'POL', 'Poland', 'Polska']},
  {name: 'Schweiz', codes: ['CH', 'CHE', 'Switzerland', 'Suisse']},
  {name: 'Slowakei', codes: ['SK', 'SVK', 'Slovakia', 'Slovensko']},
  {name: 'Slowenien', codes: ['SI', 'SVN', 'Slovenia', 'Slovenija']},
  {name: 'Spanien', codes: ['E', 'ES', 'ESP', 'Spain', 'España']},
  {name: 'Tschechien', codes: ['CZ', 'CZE', 'Česko']},
  {name: 'Ungarn', codes: ['H', 'HU', 'HUN', 'Magyarország']},
];

var provinces = {
  'A': [
    {name: 'Burgenland', codes: ['B']},
    {name: 'Kärnten', codes: ['K']},
    {name: 'Niederösterreich', codes: ['NÖ']},
    {name: 'Oberösterreich', codes: ['OÖ']},
    {name: 'Salzburg', codes: ['S']},
    {name: 'Steiermark', codes: ['ST']},
    {name: 'Tirol', codes: ['T']},
    {name: 'Vorarlberg', codes: ['V']},
    {name: 'Wien', codes: ['W']}
  ]
};

function remaining_time(timestamp) {
  var s = parse_timestamp(timestamp).getTime() - Date.now() + 1000;
  var seconds = Math.trunc(s / 1000),
      minutes = Math.trunc(seconds /  60),
      hours = Math.trunc(minutes / 60),
      days = Math.trunc(hours / 24);

  if (seconds == 0)
	  return;

  function plural(n, singular, plural) {
    if (Math.abs(n) == 1)
      return n + ' ' + singular;
     return n + ' ' + plural;
  }

  var result = [];
  if (days != 0)
    result.push(plural(days, 'Tag', 'Tage'));
  if (Math.abs(days) < 3) {
    if (hours != 0)
      result.push(plural(hours % 24, 'Stunde', 'Stunden'));
    if (Math.abs(hours) < 3) {
      if (minutes != 0)
        result.push(plural(minutes % 60, 'Minute', 'Minuten'));
      if (Math.abs(minutes) < 3)
        result.push(plural(seconds % 60, 'Sekunde', 'Sekunden'));
    }
  }
  return result.join(', ');
}

// Decode 'A'..'Z', 'AA'..'AZ', ... string into number
function alpha2num(str) {
  let num = 0;

  for (let n = 0; n < str.length; n++) {
    let ord = str.charCodeAt(n);

    if (ord >= 'a'.charCodeAt(0) && ord <= 'z'.charCodeAt(0))
      ord -= 'a'.charCodeAt(0);
    else if (ord >= 'A'.charCodeAt(0) && ord <= 'Z'.charCodeAt(0))
      ord -= 'A'.charCodeAt(0);
    else
      return 0;
    num = num * 26 + ord + 1;
  }
  return num;
}

// Encode number into 'A'..'Z', 'AA'..'AZ', ... string
function num2alpha(num) {
  let alpha = '';

  do {
    num--;
    alpha = String.fromCharCode('A'.charCodeAt(0) + num % 26) + alpha;
    num = Math.floor(num / 26);
  } while (num > 0);
  return alpha;
}

if (typeof module !== 'undefined') {
  module.exports = {
    parse_timestamp: parse_timestamp,
    date_of_event: date_of_event,
    guardian_visible: guardian_visible,
    countries: countries,
    remaining_time: remaining_time,
    alpha2num: alpha2num,
    num2alpha: num2alpha
  };
} else {
  // IE doesn't have Math.trunc
  Math.trunc = Math.trunc || function(x) {
    return ~~x;
  }
}
