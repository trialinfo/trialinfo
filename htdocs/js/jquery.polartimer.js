(function($) {

  $.fn.polartimer = function(method) {
    // Method calling logic
    if (methods[method]) {
      return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
    }
    else if (typeof method === 'object' || ! method) {
      return methods.init.apply(this, arguments);
    }
    else {
      $.error('Method ' + method + ' does not exist on jQuery.polartimer');
    }
  };

  var methods = {
    init : function(options) {
      var state = $.extend({
	callback : function() { },
	wait : 10000,
	fill : '#CCC',
	stroke : 'none',
	opacity : 1.0
      }, options);

      return this.each(function() {
	var $this = $(this);
	var data = $this.data('polartimer');
	if (! data) {
	  $this.addClass('polartimer');
	  $this.height($this.width());
	  state.timer = null;
	  state.timerCurrent = 0;
	  state.paper = Raphael($this.context, $this.width(), $this.height());
	  $this.data('polartimer', state);
	}
      });
    },

    stopWatch : function() {
      return this.each(function() {
	var data = $(this).data('polartimer');
	if (data) {
	  var timeLeft = data.timerFinish - new Date().getTime();
	  if(timeLeft <= 0) {
	    clearInterval(data.timer);
	    $(this).polartimer('drawTimer', 1.0);
	    data.callback();
	  }
	  else {
	    var f = 1 - timeLeft / data.wait;
	    $(this).polartimer('drawTimer', f);
	  }
	}
      });
    },

    drawTimer : function(f) {
      return this.each(function() {
	$this = $(this);
	var data = $this.data('polartimer');
	if (data) {
	  var size = Math.min(data.paper.width, data.paper.height);
	  var margin = 1;
	  var radius = size / 2 - margin;

	  data.paper.clear();

	  var frame;
	  if (f >= 1.0) {
	    frame = data.paper.circle(radius, radius, radius);
	  }
	  else {
	    var theta = 2 * Math.PI * (f - 0.25);
	    var x1 = radius * (Math.cos(theta) + 1.0);
	    var y1 = radius * (Math.sin(theta) + 1.0);

	    var longArcFlag = (f <= 0.5) ? 0 : 1;

	    var path = "M" + radius + "," + radius + " L" + radius + ",0 " +
		       "A" + radius + "," + radius + " 0 " + longArcFlag + ",1 " +
			     x1 + "," + y1 + " " +
		       "L" + radius + "," + radius + "z";

	    frame = data.paper.path(path);
	  }
	  frame.translate(margin, margin);
	  frame.attr({
	    fill : data.fill,
	    stroke : data.stroke,
	    opacity : data.opacity
	  });
	}
      });
    },

    start : function(wait, callback) {
      return this.each(function() {
	var data = $(this).data('polartimer');
	if (data) {
	  if (typeof(wait) != 'undefined') {
	    data.wait = wait;
	  }
	  if (typeof(callback) !== 'undefined') {
	    data.callback = callback;
	  }
	  clearInterval(data.timer);
	  data.resume = null; // clears paused state
	  data.timerFinish = new Date().getTime() + data.wait;
	  $(this).polartimer('drawTimer', 0.0);
	  var id = $this.attr('id');
	  data.timer = (! id || id === "") ?
	    setInterval("$this.polartimer('stopWatch')", 40) :
	    setInterval("$('#"+id+"').polartimer('stopWatch')", 40);
	  /* FIXME: Why not $(this).setInterval()? */
	}
      });
    },

    pause : function() {
      return this.each(function() {
	var data = $(this).data('polartimer');
	if (data && ! data.resume) {
	  data.resume = data.timerFinish - new Date().getTime();
	  clearInterval(data.timer);
	}
      });
    },

    resume : function() {
      return this.each(function() {
	var data = $(this).data('polartimer');
	if (data && data.resume) {
	  clearInterval(data.timer);
	  data.timerFinish = new Date().getTime() + data.resume;
	  data.resume = null;
	  $(this).polartimer('drawTimer', 0.0);
	  var id = $this.attr('id');
	  data.timer = (! id || id === "") ?
	    setInterval("$this.polartimer('stopWatch')", 40) :
	    setInterval("$('#"+id+"').polartimer('stopWatch')", 40);
	  /* FIXME: Why not $(this).setInterval()? */
	}
      });
    },

    reset : function() {
      return this.each(function() {
	var data = $(this).data('polartimer');
	if (data) {
	  clearInterval(data.timer);
	  data.resume = null; // clears paused state
	  $(this).polartimer('drawTimer', 0.0);
	}
      });
    },

    destroy : function() {
      return this.each(function() {
	var $this = $(this);
	var data = $this.data('polartimer');
	if (data) {
	  clearInterval(data.timer);
	  data.paper.remove();
	  $this.removeData('polartimer');
	}
      });
    }

  };
})(jQuery);
