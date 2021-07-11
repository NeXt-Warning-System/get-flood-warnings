/* global $ */

// Warn about using the kit in production
if (window.console && window.console.info) {
	window.console.info('GOV.UK Prototype Kit - do not use for production')
}

$(document).ready(function () {
	window.GOVUKFrontend.initAll()
})

window.addEventListener('pageshow', function (event) {
	var historyTraversal =
		event.persisted ||
		(typeof window.performance != 'undefined' &&
			window.performance.navigation.type === 2)
	if (historyTraversal) {
		// Handle page restore.
		window.location.reload()
	}
})

$('a').addClass('govuk-link--no-visited-state')
