(function($) {
    $.fn.vertical_label = function() {
	this.each(function() {
	    var element=$(this);
	    element.css({
		'width': element.height(),
		'height': element.width(),
		'transform-origin':'left top',
		'transform':'matrix(0, -1, 1, 0, 0, ' + element.width() + ')'
	    });
	});
	return this;
    };
})(jQuery);
