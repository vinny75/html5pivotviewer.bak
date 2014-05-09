Handlebars.registerHelper('Clean', function(v) {
	return v.replace(/[^\w]/gi, '_');
});