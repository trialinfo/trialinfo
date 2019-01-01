function parse(string) {
  let pos = 0;

  let result = parse1();
  skip_ws();
  if (pos != string.length)
    return null;
  return result;

  // "1|1"
  function parse1() {
    let element;
    if ((element = parse2()) == null)
      return null;
    let result = [element];
    for(;;) {
      if (!parse_char('|'))
	break;
      if ((element = parse2()) == null)
	return null;
      result.push(element);
    }
    return {op:'|', args:result};
  }

  // "1 1"
  function parse2() {
    let element;
    if ((element = parse3()) == null)
      return null;
    let result = [element];
    while ((element = parse3()) != null)
      result.push(element);
    return {op:' ', args:result};
  }

  // "(1)" || "1"
  function parse3() {
    let result;
    if (parse_char('(')) {
      result = parse1();
      if (!parse_char(')'))
	return null;
    } else {
      result = parse4();
    }
    return result;
  }

  // "1+1"
  function parse4() {
    let element;
    if ((element = parse_number()) == null)
      return null;
    let result = [element];
    for(;;) {
      if (!parse_char('+'))
	break;
      if ((element = parse_number()) == null)
	return null;
      result.push(element);
    }
    return {op:'+', args:result};
  }

  // "1"
  function parse_number() {
    skip_ws();
    let number = null;
    while (string[pos] >= '0' && string[pos] <= '9') {
      number = number * 10 + (string[pos] - '0');
      pos++;
    }
    return number;
  }

  function parse_char(c) {
    skip_ws();
    if (string[pos] == c) {
      pos++;
      return true;
    }
  }

  function skip_ws() {
    while (pos < string.length && string[pos].match(/^\s/))
      pos++;
  }
}

module.exports = {
  parse: parse
};
