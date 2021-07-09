const express = require('express')
const router = express.Router()

const axios = require('axios')

const filters = require('../filters')(process.env)

const osApiKey = process.env.OS_API_KEY
const osSecret = process.env.OS_SECRET

const normaliseAddressData = (results) => {
	/*
        Addresses from OS Places API are messy and don't standardise the '1st line' of the street address.
        To show this in a list we want to create a new property 'displayName' to describe the street adddress by adding some component parts of the address together.    
    */

	let outputArray = []

	for (const result of results) {
		const address = result.DPA

		// Check address is unique
		if (
			outputArray.filter(
				(processedAddress) => processedAddress.UPRN == address.UPRN
			).length == 0
		) {
			// Create blank array to capture any components that exist
			let displayComponents = []

			// Go through any '1st line' address components in specificity order, add to array if it exists

			if (address.ORGANISATION_NAME) {
				displayComponents.push(filters.titleCase(address.ORGANISATION_NAME))
			}

			if (address.DEPARTMENT_NAME) {
				displayComponents.push(filters.titleCase(address.DEPARTMENT_NAME))
			}

			if (address.SUB_BUILDING_NAME) {
				displayComponents.push(filters.titleCase(address.SUB_BUILDING_NAME))
			}

			if (address.BUILDING_NAME) {
				displayComponents.push(filters.titleCase(address.BUILDING_NAME))
			}

			if (address.DEPENDENT_THOROUGHFARE_NAME) {
				displayComponents.push(
					(
						(address.BUILDING_NUMBER ?? '') +
						' ' +
						filters.titleCase(address.DEPENDENT_THOROUGHFARE_NAME)
					).trim()
				)
			} else if (address.THOROUGHFARE_NAME) {
				displayComponents.push(
					(
						(address.BUILDING_NUMBER ?? '') +
						' ' +
						filters.titleCase(address.THOROUGHFARE_NAME)
					).trim()
				)
			}

			if (address.POST_TOWN) {
				displayComponents.push(address.POST_TOWN)
			}

			// Join any components in the array with a comma
			let displayName = displayComponents.join(', ')

			// Return original result with new DISPLAY_NAME property
			outputArray.push({
				DISPLAY_NAME: displayName,
				...address,
			})
		}
	}

	return outputArray
}

const matchedAddresses = (query, results) => {
	const normalisedQuery = query.trim().toUpperCase()

	return results.filter((result) => {
		const fieldsToTest = [
			result.BUILDING_NAME,
			result.BUILDING_NUMBER,
			result.SUB_BUILDING_NAME,
			result.ORGANISATION_NAME,
		]

		for (var value of fieldsToTest) {
			if (normalisedQuery == value) {
				return true
			}
		}

		return false
	})
}

router.post('/search', (req, res) => {
	// Gather user inputs
	const inputPostcode = req.session.data['addressLookupPostcode'] ?? ''
	const queryBuildingNameOrNumber =
		req.session.data['address-lookup-name-number'] ?? ''

	// Gather URLs for error and success pages
	const errorURL = req.session.data['error-page']
	const successURL = req.session.data['next-page']

	// Government postcode ruleset
	const postcodeRegex = new RegExp(
		'([Gg][Ii][Rr] 0[Aa]{2})|((([A-Za-z][0-9]{1,2})|(([A-Za-z][A-Ha-hJ-Yj-y][0-9]{1,2})|(([A-Za-z][0-9][A-Za-z])|([A-Za-z][A-Ha-hJ-Yj-y][0-9][A-Za-z]?))))s?[0-9][A-Za-z]{2})'
	)

	// Get rid of spaces from postcode so we can check against rules
	const queryPostcode = inputPostcode.trim().replace(' ', '')

	// Perform check to see if postcode is real
	const isValidPostcode = postcodeRegex.test(queryPostcode)

	// Return user to error page if the postcode is not real
	if (!isValidPostcode) {
		req.session.data.lookupError = 'invalid'
		res.redirect(errorURL)
		return
	}

	// Perform search using Ordanance Survey Places API
	axios
		.get(
			`https://api.os.uk/search/places/v1/postcode?key=${osApiKey}&postcode=${queryPostcode}`
		)
		.catch(function (error) {
			// Error with API, is the API key correctly set? Is the URL correct? Check console for more info.
			console.log(error)
			if (error.response.status == 400) {
				req.session.data.lookupError = 'invalid'
				res.redirect(errorURL)
				return
			}
			req.session.data.lookupError = 'unknown'
			res.redirect(errorURL)
			return
		})
		.then((response) => {
			// Get data from network response
			var data = response.data
			// Check there are address results in the data
			if (data.results) {
				// Some addresses found
				var addresses = normaliseAddressData(data.results)
				// Check if the user has provided a building name or number
				if (queryBuildingNameOrNumber.length) {
					// Check if there are any perfect matches
					const perfectMatches = matchedAddresses(
						queryBuildingNameOrNumber,
						addresses
					)
					if (perfectMatches.length) {
						// Replace the address results with the perfect matches
						addresses = perfectMatches
					}
				}
				// Return all addresses
				req.session.data.addressResults = addresses
				res.redirect(successURL)
				return
			}
			// No addresses fouund at that postcode
			req.session.data.lookupError = 'not-found'
			res.redirect(errorURL)
			return
		})
})

module.exports = router
