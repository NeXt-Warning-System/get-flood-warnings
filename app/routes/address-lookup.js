const express = require('express')
const router = express.Router()

const axios = require('axios')
const proj4 = require('proj4')
const turf = require('@turf/turf')

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

			if (address.DEPENDENT_LOCALITY) {
				displayComponents.push(filters.titleCase(address.DEPENDENT_LOCALITY))
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

const normalisePlaceData = (results) => {
	/*
        Addresses from OS Places API are messy and don't standardise the '1st line' of the street address.
        To show this in a list we want to create a new property 'displayName' to describe the street adddress by adding some component parts of the address together.    
    */

	let outputArray = []

	for (const result of results) {
		const place = result.GAZETTEER_ENTRY

		// Check address is unique
		if (
			outputArray.filter((processedAddress) => processedAddress.ID == place.ID)
				.length == 0
		) {
			// Create blank array to capture any components that exist
			let displayComponents = []

			// Go through any '1st line' address components in specificity order, add to array if it exists

			if (place.NAME1) {
				displayComponents.push(filters.titleCase(place.NAME1))
			}

			if (place.NAME2) {
				displayComponents.push(filters.titleCase(place.NAME2))
			}

			if (place.POPULATED_PLACE) {
				displayComponents.push(filters.titleCase(place.POPULATED_PLACE))
			}

			if (place.REGION) {
				displayComponents.push(filters.titleCase(place.REGION))
			}

			// Join any components in the array with a comma
			let displayName = displayComponents.join(', ')

			// Return original result with new DISPLAY_NAME property
			outputArray.push({
				DISPLAY_NAME: displayName,
				...place,
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
				if (!Array.isArray(req.session.data.allFetchedAddresses)) {
					req.session.data.allFetchedAddresses = []
				}
				req.session.data.allFetchedAddresses =
					req.session.data.allFetchedAddresses.concat(addresses)
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

const longLatFor = (address) => {
	proj4.defs(
		'EPSG:27700',
		'+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs'
	)

	if (address) {
		var coords = proj4('EPSG:27700', 'EPSG:4326', [
			address.X_COORDINATE ?? 0,
			address.Y_COORDINATE ?? 0,
		])

		return coords
	} else {
		return null
	}
}

router.get('/keyword', (req, res) => {
	const query = req.query.query

	if (query) {
		axios
			.get(
				`https://api.os.uk/search/names/v1/find?key=${osApiKey}&maxresults=6&query=${encodeURIComponent(
					query
				)}`
			)
			.then((response) => {
				const data = response.data
				const results = normalisePlaceData(data.results)
				res.send(results)
			})
			.catch((error) => {
				console.log(error)
				res.send([])
			})
	} else {
		res.send([])
	}
})

router.post('/target-areas', (req, res) => {
	const errorURL = req.session.data['error-page']
	const successURL = req.session.data['next-page']

	const selectedAddressId = req.session.data['selected-address']
	const addressUPRN = req.session.data.savedAddresses[selectedAddressId]
	const matchedAddresses = req.session.data.allFetchedAddresses.filter(
		(address) => address.UPRN == addressUPRN
	)
	var address = matchedAddresses[0]

	if (address) {
		const placeAsPoint = turf.point(longLatFor(address))

		const radius = 0.25
		const floodAreaURL = `https://environment.data.gov.uk/flood-monitoring/id/floodAreas?lat=${
			longLatFor(address)[1]
		}&long=${longLatFor(address)[0]}&dist=${radius}`
		axios
			.get(floodAreaURL)
			.then((response) => {
				const data = response.data
				var areas = data.items
				const polygonRequests = areas.map((area) => {
					return axios.get(filters.secure(area.polygon))
				})
				axios
					.all(polygonRequests)
					.then(
						axios.spread((...responses) => {
							responses.forEach((polygonResponse, index) => {
								const polygonData = polygonResponse.data
								var placeIsWithBoundries = false
								var distanceFromPlace = 9999
								polygonData.features.forEach((feature) => {
									placeIsWithBoundries =
										turf.booleanPointInPolygon(
											placeAsPoint,
											feature.geometry
										) ?? placeIsWithBoundries
									if (!placeIsWithBoundries) {
										const featureCoordinatesArray = feature.geometry.coordinates
										if (Array.isArray(featureCoordinatesArray)) {
											featureCoordinatesArray.forEach((coordinatesArray) => {
												coordinatesArray.forEach((coordinates) => {
													var coordinatesToProcess = coordinates
													if (
														coordinates.length == 2 &&
														typeof coordinates[0] == 'number'
													) {
														coordinatesToProcess = coordinatesArray
													}
													if (Array.isArray(coordinatesToProcess)) {
														const coordinatesToTest = Array.isArray(
															coordinatesToProcess[0]
														)
															? coordinatesToProcess
															: [coordinatesToProcess, [0, 0]]
														if (Array.isArray(coordinatesToTest)) {
															const coordinatesAsPointCollection =
																turf.featureCollection(
																	coordinatesToTest.map((coords) =>
																		turf.point(coords)
																	)
																)
															const closestPoint = turf.nearestPoint(
																placeAsPoint,
																coordinatesAsPointCollection
															)
															const localDistanceFromPlace = turf.distance(
																placeAsPoint,
																closestPoint,
																{ units: 'miles' }
															)
															distanceFromPlace =
																localDistanceFromPlace < distanceFromPlace
																	? localDistanceFromPlace
																	: distanceFromPlace
														}
													}
												})
											})
										}
										if (distanceFromPlace < 0.1) {
											distanceFromPlace = 0
											placeIsWithBoundries = true
										}
									} else {
										distanceFromPlace = 0
									}
								})
								areas[index].hasDistance = distanceFromPlace != 9999
								areas[index].polygonData = polygonData
								areas[index].distance = distanceFromPlace
								areas[index].affectsPlaceDirectly =
									distanceFromPlace == 0 || placeIsWithBoundries
							})
							const filteredAreas = areas.filter((area) => {
								return !area.hasDistance || area.distance < radius
							})
							address.warningAreas = filteredAreas.filter((area) => {
								return area.notation.includes('FW')
							})
							address.alertAreas = filteredAreas.filter((area) => {
								return area.notation.includes('WA')
							})
							req.session.data.targetAreaResults = {
								hasWarnings: address.warningAreas.length > 0,
								hasAlertAreas: address.alertAreas.length > 0,
							}
							res.redirect(successURL)
						})
					)
					.catch((errors) => {
						console.log('Polygon fetch error', errors)
						res.redirect(errorURL)
					})
			})
			.catch((error) => {
				console.log('Error', error.message)
				res.redirect(errorURL)
			})
	} else {
		console.log('No address')
		res.redirect(errorURL)
	}
})

module.exports = router
