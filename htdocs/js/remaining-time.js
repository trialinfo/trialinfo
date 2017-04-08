function parse_timestamp(timestamp) {
  var match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
  if (match[4] !== undefined)
    return new Date(match[1], match[2] - 1, match[3], match[4], match[5], match[6]);
  else
    return new Date(match[1], match[2] - 1, match[3]);
}

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

if (typeof module !== 'undefined')
  module.exports = {
    parse_timestamp: parse_timestamp,
    remaining_time: remaining_time
  };
