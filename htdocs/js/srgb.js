/*
 * sRGB to luminance conversion according to:
 * https://en.wikipedia.org/wiki/SRGB
 *
 * The r, g, and b arguments must be between 0 and 1.
 * Returns a value between 0 and 1.
 */
function luminance(r, g, b) {
  function gamma_inv(u) {
    if (u <= 0.04045)
      return u / 12.92;
    return ((u + 0.055) / 1.055) ** 2.4;
  }

  return 0.2126 * gamma_inv(r) +
         0.7152 * gamma_inv(g) +
         0.0722 * gamma_inv(b);
}

/*
 * rgb2hsl and hls2rgb based on:
 * https://gist.github.com/mjackson/5311256
 */

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the range [0, 1] and
 * returns h, s, and l in the range [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSL representation
 */
function rgb2hsl(r, g, b) {
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, l = (max + min) / 2;

  if (max == min) {
    h = s = 0; // achromatic
  } else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }

    h /= 6;
  }

  return [ h, s, l ];
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the range [0, 1] and
 * returns r, g, and b in the range [0, 1].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation
 */
function hsl2rgb(h, s, l) {
  var r, g, b;

  if (s == 0) {
    r = g = b = l; // achromatic
  } else {
    function hue2rgb(p, q, t) {
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }

    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;

    r = hue2rgb(p, q, (h + 1/3) % 1);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, (h + 2/3) % 1);
  }

  return [ r, g, b ];
}
