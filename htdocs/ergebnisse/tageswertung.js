function klasse_anzeigen(divs, div_idx, offset) {
  div = divs.eq(div_idx);
  div.show();

  div_id = "#" + div.attr("id");
  rows = $(div_id + " > table.wertung > tbody > tr");

  /*
   * Wenn eine Klasse nicht auf eine Seite passt, herausfinden, wieviele Seiten
   * benötigt werden, und die Einträge dann möglichst gleichmäßig auf die
   * Seiten verteilen.
   */
  rows.slice(0, offset).hide();
  rows.slice(offset).show();
  for (last = rows.size();
       $(document).height() > $(window).height() && last > offset + 1;
       last--) {
    rows.eq(last - 1).hide();
  }
  if (last != rows.size()) {
    /* Einträge möglichst gleichmäßig verteilen */
    rows_on_page = last - offset;
    pages = Math.ceil(rows.size() / rows_on_page);
    rows_per_page = Math.ceil(rows.size() / pages);
    for (;
         last > offset + 1 && rows_per_page < last - offset;
	 last--) {
      rows.eq(last - 1).hide();
    }
    next_offset = last;
  } else {
    /* Nächste Klasse */
    next_div_idx = div_idx + 1;
    if (next_div_idx >= divs.size())
      next_div_idx = 0;
    next_offset = 0;
  }

  timeout = 2000 + 250 * (last - offset);
  setTimeout(function(){
      div.hide();
      klasse_anzeigen(divs, next_div_idx, next_offset);
    }, timeout);
  if (div_idx != next_div_idx) {
    /* Nächste Klasse aktualisieren */
    next_div = divs.eq(next_div_idx);
    next_div_id = "#" + next_div.attr("id");

    var jqxhr = $.get($(location).attr('href'));
    jqxhr.success(function(html) {
      content = $(html).filter(next_div_id);
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
  divs = $("div.klasse");
  divs.hide();
  $("#errors").empty();
  $("#footer").hide();
  klasse_anzeigen(divs, 0, 0);
});
