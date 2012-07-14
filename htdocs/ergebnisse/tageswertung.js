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
  setTimeout(function(){
      div.hide();
      klasse_anzeigen(divs, next_div_idx, next_offset);
    }, timeout);
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
      $("#errors").html("Aktualisierung fehlgeschlagen!");
    });
  }
}

$(document).ready(function () {
  var divs = $("div.klasse");
  divs.hide();
  $("#errors").empty();
  $("#footer").hide();
  klasse_anzeigen(divs, 0, 0);
});
