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

/* The first entry in the codes arrays is the IOC (International Olympic
 * Committee) country code; this is what's used in the database. */
/* https://en.wikipedia.org/wiki/List_of_IOC_country_codes */
/* https://en.wikipedia.org/wiki/ISO_3166-1 */

var countries = [
  {name: 'Belgien', codes: ['BEL', 'BE', 'Belgium']},
  {name: 'Dänemark', codes: ['DEN', 'DK', 'DNK', 'Denmark']},
  {name: 'Deutschland', codes: ['GER', 'DEU', 'D', 'DE', 'Germany', 'Allemagne']},
  {name: 'England', codes: ['GBR', 'GB', 'UK', 'Großbritannien']},
  {name: 'Frankreich', codes: ['FRA', 'F', 'FR', 'France']},
  {name: 'Italien', codes: ['ITA', 'I', 'IT', 'Italia']},
  {name: 'Kroation', codes: ['CRO', 'HRV', 'HR', 'Hrvatska']},
  {name: 'Lettland', codes: ['LAT', 'LV', 'LVA', 'Latvia']},
  {name: 'Niederlande', codes: ['NED', 'NLD', 'NL', 'Nederland']},
  {name: 'Norwegen', codes: ['NOR', 'NO', 'Norway']},
  {name: 'Österreich', codes: ['AUT', 'A', 'AT', 'Ö', 'Austria', 'Autriche']},
  {name: 'Polen', codes: ['POL', 'PL', 'Poland', 'Polska']},
  {name: 'Rumänien', codes: ['ROU', 'RO', 'ROM', 'Romania']},
  {name: 'Schweden', codes: ['SWE', 'SE', 'Sweden']},
  {name: 'Schweiz', codes: ['SUI', 'CH', 'CHE', 'Switzerland', 'Suisse']},
  {name: 'Slowakei', codes: ['SVK', 'SK', 'Slovakia', 'Slovensko']},
  {name: 'Slowenien', codes: ['SLO', 'SI', 'SVN', 'Slovenia', 'Slovenija']},
  {name: 'Spanien', codes: ['ESP', 'E', 'ES', 'Spain', 'España']},
  {name: 'Tschechien', codes: ['CZE', 'CZ', 'Česko']},
  {name: 'Ungarn', codes: ['HUN', 'H', 'HU', 'Magyarország']},
];

var provinces = {
  'AUT': [
    {name: 'Burgenland', codes: ['B']},
    {name: 'Kärnten', codes: ['K']},
    {name: 'Niederösterreich', codes: ['NÖ']},
    {name: 'Oberösterreich', codes: ['OÖ']},
    {name: 'Salzburg', codes: ['S']},
    {name: 'Steiermark', codes: ['ST']},
    {name: 'Tirol', codes: ['T']},
    {name: 'Vorarlberg', codes: ['V']},
    {name: 'Wien', codes: ['W']}
  ],
  'GER': [
    {name: 'Baden-Württemberg', codes: ['BW']},
    {name: 'Bayern', codes: ['BY']},
    {name: 'Berlin', codes: ['BE']},
    {name: 'Brandenburg', codes: ['BB']},
    {name: 'Bremen', codes: ['HB']},
    {name: 'Hamburg', codes: ['HH']},
    {name: 'Hessen', codes: ['HE']},
    {name: 'Mecklenburg-Vorpommern', codes: ['MV']},
    {name: 'Niedersachsen', codes: ['NI']},
    {name: 'Nordrhein-Westfalen', codes: ['NW']},
    {name: 'Rheinland-Pfalz', codes: ['RP']},
    {name: 'Saarland', codes: ['SL']},
    {name: 'Sachsen', codes: ['SN']},
    {name: 'Sachsen-Anhalt', codes: ['ST']},
    {name: 'Schleswig-Holstein', codes: ['SH']},
    {name: 'Thüringen', codes: ['TH']},
  ]
};

var regional_indicator_symbol_codes = {
  'AUT': 'AT',
  'BEL': 'BE',
  'CRO': 'HR',
  'CZE': 'CZ',
  'DEN': 'DK',
  'ESP': 'ES',
  'FRA': 'FR',
  'GBR': 'GB',
  'GER': 'DE',
  'HUN': 'HU',
  'ITA': 'IT',
  'LAT': 'LV',
  'NED': 'NL',
  'NOR': 'NO',
  'POL': 'PL',
  'ROU': 'RO',
  'SLO': 'SI',
  'SUI': 'CH',
  'SVK': 'SK',
  'SWE': 'SE'
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
