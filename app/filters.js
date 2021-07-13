const { area } = require('@turf/turf')

const { v4: uuidv4 } = require('uuid')

const isValidDate = (d) => {
	return d instanceof Date && !isNaN(d)
}

const isNotThere = (input) => {
	return !input || input.trim() == '' || input.trim() == 'undefined'
}

module.exports = function (env) {
	/**
	 * Instantiate object used to store the methods registered as a
	 * 'filter' (of the same name) within nunjucks. You can override
	 * gov.uk core filters by creating filter methods of the same name.
	 * @type {Object}
	 */
	var filters = {}

	const numberToMonthString = (input) => {
		const months = [
			'January',
			'February',
			'March',
			'April',
			'May',
			'June',
			'July',
			'August',
			'September',
			'October',
			'November',
			'December',
		]
		return months[Number(input)]
	}

	filters.month = (number) => numberToMonthString(number - 1)

	filters.dateFromInputs = (_, day, month, year) => {
		const outputDate = Date.parse(
			`${day} ${filters.month(month)} ${year} 00:00:00 GMT`
		)
		return outputDate
	}

	filters.friendlyDate = (str) => {
		if (!str) {
			return '-'
		}
		const date = new Date(str)
		return (
			date.getDate() +
			' ' +
			numberToMonthString(date.getMonth()) +
			' ' +
			date.getFullYear()
		)
	}

	filters.addressWithNewLines = (str) => {
		return str.replace(/, /g, '<br>')
	}

	filters.autoClaimDate = (_, caringDate, awardDate, decisionDate) => {
		const today = new Date()
		const threeMonthsBeforeToday = today.setMonth(today.getMonth() - 3)
		const decisionIsWithin3Months =
			new Date(decisionDate) > threeMonthsBeforeToday
		const qbDate = decisionIsWithin3Months
			? new Date(awardDate)
			: new Date(awardDate) > threeMonthsBeforeToday
			? new Date(awardDate)
			: threeMonthsBeforeToday
		const dates = [new Date(caringDate), new Date(qbDate)]
		let hasInvalidDate = false
		let latestDate = new Date()
		for (const date of dates) {
			if (!(date instanceof Date)) {
				hasInvalidDate = true
			}
		}
		if (!hasInvalidDate) {
			latestDate = new Date(
				Math.max.apply(
					null,
					dates.map((date) => {
						return date.getTime()
					})
				)
			)
		}
		if (latestDate.getDay() != 1) {
			return latestDate.setDate(
				latestDate.getDate() + ((1 + 7 - latestDate.getDay()) % 7)
			)
		}
		return latestDate
	}

	filters.getDay = (dateString) => {
		const date = new Date(dateString)
		return date.getDate()
	}

	filters.getMonth = (dateString) => {
		const date = new Date(dateString)
		return date.getMonth() + 1
	}

	filters.getYear = (dateString) => {
		const date = new Date(dateString)
		return date.getFullYear()
	}

	filters.getClaimDate = (data) => {
		const dayInput = data['claim-date--claim-date-day'] || 23
		const monthInput = data['claim-date--claim-date-month'] || 10
		const yearInput = data['claim-date--claim-date-year'] || 2020
		return `${dayInput} ${filters.month(monthInput)} ${yearInput}`
	}

	filters.formattedAddress = (address) => {
		return address.DISPLAY_NAME + ', ' + address.POSTCODE
	}

	filters.addressOptions = (addressOptionArray, currentSelection) => {
		currentSelection = currentSelection ? currentSelection : ''
		if (Array.isArray(addressOptionArray)) {
			var processedAddressOptionArray = addressOptionArray.map(
				(addressOption) => {
					return {
						text: filters.titleCase(addressOption.DISPLAY_NAME),
						value: filters.formattedAddress(addressOption),
						checked:
							filters.formattedAddress(addressOption) == currentSelection
								? true
								: false,
					}
				}
			)
			return processedAddressOptionArray
		} else {
			return []
		}
	}

	filters.placeOptions = (placeOptionArray, currentSelection) => {
		currentSelection = currentSelection ? currentSelection : ''
		if (Array.isArray(placeOptionArray)) {
			const processedAddressOptionArray = placeOptionArray.map(
				(addressOption) => {
					var outputObject = {
						text: addressOption.name,
						value: addressOption.id,
						selected: addressOption.id == currentSelection ? true : false,
						hint: addressOption.locale
							? { text: 'in ' + addressOption.locale }
							: null,
					}
					return outputObject
				}
			)
			processedAddressOptionArray.push({
				text: 'Search again',
				value: 'other',
			})
			return processedAddressOptionArray
		} else {
			return []
		}
	}

	filters.addressFromID = (data, id) => {
		const addressUPRN = data.savedAddresses[id]
		var addressToReturn = null
		if (Array.isArray(data.allFetchedAddresses)) {
			for (const address of data.allFetchedAddresses) {
				if (address.UPRN == addressUPRN) {
					addressToReturn = address
				}
			}
		}
		return addressToReturn
	}

	filters.includes = (arrayOfStrings, testString) => {
		if (Array.isArray(arrayOfStrings)) {
			if (arrayOfStrings.indexOf(testString) != -1) {
				return true
			}
		}
		return false
	}

	filters.secure = (url) => url.replace(/^http:\/\//i, 'https://')

	filters.debug = (obj) => {
		return JSON.stringify(obj)
	}

	filters.lowerCase = (str) => (str ? str.toLowerCase() : '')

	filters.upperCase = (str) => (str ? str.toUpperCase() : '')

	filters.titleCase = (str) => {
		if (str) {
			return str.replace(/\w\S*/g, (txt) => {
				return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
			})
		} else {
			return ''
		}
	}

	filters.frequencySuffix = (response) => {
		switch (response) {
			case 'Once a week':
				return 'a week'

			case 'Every 2 weeks':
				return 'every 2 weeks'

			case 'Every 4 weeks':
				return 'every 4 weeks'

			default:
				return 'a month'
		}
	}

	filters.sentenceCase = (str) => {
		if (str) {
			return str.charAt(0).toUpperCase() + str.substr(1).toLowerCase()
		} else {
			return ''
		}
	}

	filters.default = (dataItem, fallbackString) => {
		if (isNotThere(dataItem)) {
			return fallbackString
		}
		return dataItem
	}

	filters.dateAsNumeric = (dayInput, monthInput, yearInput) => {
		let queryDate = Date.parse(
			`${dayInput} ${filters.month(monthInput)} ${yearInput} 12:00:00 GMT`
		)
		queryDate = new Date(queryDate)
		if (isValidDate(queryDate)) {
			return queryDate.getTime()
		} else {
			return false
		}
	}

	filters.isWithinThreeMonths = (nowInput, dayInput, monthInput, yearInput) => {
		let nowDate = new Date(nowInput)
		let threeMonthsAgo = nowDate.setMonth(nowDate.getMonth() - 3)
		let queryDate = Date.parse(
			`${dayInput} ${filters.month(monthInput)} ${yearInput} 12:00:00 GMT`
		)
		queryDate = new Date(queryDate)
		if (isValidDate(nowDate) && isValidDate(queryDate)) {
			return queryDate > threeMonthsAgo
		} else {
			return false
		}
	}

	filters.redirect = (location) => {
		return `<script>window.location.href = '${location}';</script>`
	}

	filters.oneDecimalPlace = (number) => Math.round(number * 10) / 10

	filters.areasAsGovOptions = (areaArray, location, selectedIds) => {
		if (Array.isArray(areaArray)) {
			return areaArray.map((area) => {
				var labelText = area.label
				if (area.distance == 0) {
					labelText += ` - directly affects ${location}`
				} else {
					if (area.hasDistance) {
						let distanceInMiles = filters.oneDecimalPlace(area.distance)
						labelText += ` - ${
							distanceInMiles == '1.0' ? '1 mile' : `${distanceInMiles} miles`
						} away`
					} else {
						labelText += ` - less than 2.0 miles away`
					}
				}
				var isChecked = false
				if (Array.isArray(selectedIds)) {
					isChecked = selectedIds.includes(area.notation)
				}
				return {
					text: labelText,
					hint: { text: area.description },
					value: area.notation,
					checked: isChecked,
				}
			})
		} else {
			return []
		}
	}

	filters.removingArea = (areaIds, idToRemove) => {
		if (Array.isArray(areaIds)) {
			return areaIds.filter((areaId) => {
				return areaId != idToRemove
			})
		}
	}

	filters.asArray = (str) => {
		const outputArray = JSON.parse(str)
		if (Array.isArray(outputArray)) {
			return outputArray
		} else {
			return []
		}
	}

	filters.warningAreas = (areas) => {
		if (Array.isArray(areas)) {
			return areas.filter((area) => {
				return area.notation.includes('FW')
			})
		}
	}

	filters.alertAreas = (areas) => {
		if (Array.isArray(areas)) {
			return areas.filter((area) => {
				return area.notation.includes('WA')
			})
		}
	}

	filters.warningAreaIds = (areaIds) => {
		if (Array.isArray(areaIds)) {
			return areaIds.filter((areaId) => {
				return areaId.includes('FW')
			})
		}
	}

	filters.alertAreaIds = (areaIds) => {
		if (Array.isArray(areaIds)) {
			return areaIds.filter((areaId) => {
				return areaId.includes('WA')
			})
		}
	}

	filters.isWarningArea = (area) => {
		return area.notation.includes('FW')
	}

	filters.uuid = (input) => {
		var input = input ?? ''
		if (input.trim().length == 0) {
			return uuidv4()
		}
		return input
	}

	/* ------------------------------------------------------------------
    add your methods to the filters obj below this comment block:
    @example:

    filters.sayHi = function(name) {
        return 'Hi ' + name + '!'
    }

    Which in your templates would be used as:

    {{ 'Paul' | sayHi }} => 'Hi Paul'

    Notice the first argument of your filters method is whatever
    gets 'piped' via '|' to the filter.

    Filters can take additional arguments, for example:

    filters.sayHi = function(name,tone) {
      return (tone == 'formal' ? 'Greetings' : 'Hi') + ' ' + name + '!'
    }

    Which would be used like this:

    {{ 'Joel' | sayHi('formal') }} => 'Greetings Joel!'
    {{ 'Gemma' | sayHi }} => 'Hi Gemma!'

    For more on filters and how to write them see the Nunjucks
    documentation.

  ------------------------------------------------------------------ */

	/* ------------------------------------------------------------------
    keep the following line to return your filters to the app
  ------------------------------------------------------------------ */
	return filters
}
