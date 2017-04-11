'use strict';

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
