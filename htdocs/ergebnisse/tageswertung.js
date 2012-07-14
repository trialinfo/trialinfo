function drawPie(paper, f) {
  var size = paper.width < paper.height ? paper.width : paper.height;
  var margin = 1;
  var radius = size / 2 - margin;
  var frame;
  paper.clear();
  if (f >= 1) {
    frame = paper.circle(radius, radius, radius);
  } else {
    var phi = 2 * Math.PI * (f - 0.25);
    var x = radius * (Math.cos(phi) + 1);
    var y = radius * (Math.sin(phi) + 1);
    var path = "Mr,r Lr,0 Ar,r 0 l,1 x,y Lr,r z"
	       .replace(/r/g, radius)
	       .replace(/x/g, x)
	       .replace(/y/, y)
	       .replace(/l/g, (f <= 0.5) ? 0 : 1);  // long arc?
    frame = paper.path(path);
  }
  frame.translate(paper.width / 2 - radius, paper.height / 2 - radius);
  frame.attr({
    fill : '#98bf21',
    stroke : 'none',
    opacity : 0.7
  });
}

function klasse_anzeigen(divs, div_idx, offset) {
  var div = divs.eq(div_idx);
  div.show();

  /*
   * Wenn eine Klasse nicht auf eine Seite passt, herausfinden, wieviele Seiten
   * benötigt werden, und die Einträge dann möglichst gleichmäßig auf die
   * Seiten verteilen.
   */
  var rows = $("#" + div.attr("id") + " > table.wertung > tbody > tr");
  rows.slice(0, offset).hide();
  rows.slice(offset).show();
  var last = rows.size();
  while ($(document).height() > $(window).height() && last > offset + 1) {
    rows.eq(last - 1).hide();
    last--;
  }
  var next_div_idx, next_offset;
  if (last != rows.size()) {
    /* Einträge möglichst gleichmäßig verteilen */
    var rows_on_page = last - offset;
    var pages = Math.ceil(rows.size() / rows_on_page);
    var rows_per_page = Math.ceil(rows.size() / pages);
    while (last > offset + 1 && rows_per_page < last - offset) {
      rows.eq(last - 1).hide();
      last--;
    }
    next_div_idx = div_idx;
    next_offset = last;
  } else {
    /* Nächste Klasse */
    next_div_idx = div_idx + 1;
    if (next_div_idx >= divs.size())
      next_div_idx = 0;
    next_offset = 0;
  }

  var timeout = 2000 + 250 * (last - offset);
  var t = 0, step = 40;

  (function progress() {
    drawPie(paper, t / timeout);
    if (t >= timeout) {
      div.hide();
      klasse_anzeigen(divs, next_div_idx, next_offset);
    } else {
      t += step;
      setTimeout(progress, step);
    }
  })();

  if (div_idx != next_div_idx) {
    /* Nächste Klasse aktualisieren */
    var jqxhr = $.get($(location).attr('href'));
    jqxhr.success(function(html) {
      var next_div = divs.eq(next_div_idx);
      var content = $(html).filter("#" + next_div.attr("id"));
      next_div.empty();
      next_div.append(content);
      $("#errors").empty();
    });
    jqxhr.error(function(html) {
      $("#errors").html("Aktualisierung der Daten fehlgeschlagen!");
    });
  }
}

$(document).ready(function () {
  var divs = $("div.klasse");
  divs.hide();
  $("#errors").empty();
  $("#footer").hide();
  paper = Raphael("progress", 50, 50);
  klasse_anzeigen(divs, 0, 0);
});
