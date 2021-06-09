const express = require('express')
const router = express.Router()

const axios = require('axios')
const proj4 = require('proj4')

const osApiKey = process.env.OS_API_KEY
const osSecret = process.env.OS_SECRET

const filters = require('../filters')(process.env)

const turf = require('@turf/turf')
const session = require('express-session')

// Radii

const cuttoffDistanceFromPostcode = 2 // in miles : No results will show if past this point

const postcodeFloodAreaSearchRadius = 1 // Search radius from centre of postcode in kilometers (seems to be larger than km but can't work it out right now!)
const townFloodAreaSearchRadius = 6 // Search radius from centre of town in kilometers

const postcodeIsInFloodAreaTolerance = 0.05 // Areas that are less that X miles away from centre of postcode will be counted as zero miles away
const townIsInFloodAreaTolerance = 3 // Areas that are less that X miles away from centre of town will be counted as zero miles away

const standardisedLocationFrom = entry => {
    proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs')
    const location = entry['GAZETTEER_ENTRY']
    if (location) {
        const validPlace = (location['TYPE'] == 'populatedPlace') || (location['LOCAL_TYPE'] == 'Postcode')
        if (validPlace) {
            var coords = proj4('EPSG:27700', 'EPSG:4326', [ location.GEOMETRY_X ?? 0, location.GEOMETRY_Y ?? 0 ]);
            var localeArray = []
            if (location['POPULATED_PLACE']) {
                localeArray.push(location['POPULATED_PLACE'])
            }
            if (location['DISTRICT_BOROUGH']) {
                localeArray.push(location['DISTRICT_BOROUGH'])
            }
            if (location['REGION']) {
                localeArray.push(location['REGION'])
            }
            const localeString = localeArray.join(', ')
            return {
                id: location["ID"],
                name: location["NAME1"],
                locale: localeString,
                isPostcode: location['LOCAL_TYPE'] == 'Postcode',
                location: coords
            }
        } else {
            return null
        }

    } else {
        return null
    }
}

const forComparison = str => str.replace(/\s+/g, '').toLowerCase()

router.post('/search', (req, res) => {
    const searchQuery = req.session.data['place-query']
    const nextPage = req.session.data['next-page']
    const errorPage = req.session.data['error-page']
    const standarsisedQuery = forComparison(searchQuery)
    if (searchQuery) {
        axios.get('https://api.os.uk/search/names/v1/find?query=' + searchQuery + '&key=' + osApiKey)
        .then(response => {
            var data = response.data
            if (data.results.length) {
                let standardisedResults = data.results.map(result => standardisedLocationFrom(result)).filter(result => result != null)
                req.session.data.allPlaceResults = {}
                standardisedResults.forEach(result => {
                    req.session.data.allPlaceResults[result.id] = result
                })
                const topResult = standardisedResults[0]
                req.session.data.location = topResult
                if (req.session.data.location == null) {
                    throw new Error("No results")
                }
                req.session.data.placeSearchResponse = data
                if (forComparison(topResult.name) == standarsisedQuery) {
                    res.redirect(`/location/select?selected-id=${ topResult.id }`) 
                } else {
                    res.redirect(errorPage)
                }
            } else {
                res.redirect(errorPage)
            }
        }).catch(error => {
            console.log('Error', error.message)
            req.session.data.placeSearchResponse = error
            res.redirect(errorPage)
        })
    }
})

router.get('/select', (req, res) => {
    const selectedPlaceId = req.session.data['selected-id']
    const nextPage = req.session.data['next-page']
    const errorPage = req.session.data['error-page']
    const place = req.session.data.allPlaceResults[selectedPlaceId]
    const placeAsPoint = turf.point(place.location)
    const derivedRadius = req.session.data.searchRadius ? Number(req.session.data.searchRadius) : 1
    const radius = derivedRadius == 1 ? derivedRadius : derivedRadius / 2
    const floodAreaURL = `https://environment.data.gov.uk/flood-monitoring/id/floodAreas?lat=${place.location[1]}&long=${place.location[0]}&dist=${radius}`
    axios.get(floodAreaURL)
        .then(response => {
            const data = response.data
            var areas = data.items
            if (!req.session.data.allFetchedAreas) {
                req.session.data.allFetchedAreas = {}
            }
            areas.forEach(area => {
                req.session.data.allFetchedAreas[area.notation] = area
            })
            const polygonRequests = areas.map( area => {
                return axios.get(filters.secure(area.polygon))
            })
            axios.all(polygonRequests).then(axios.spread((...responses) => {
                responses.forEach((polygonResponse, index) => {
                    const polygonData = polygonResponse.data
                    var placeIsWithBoundries = false
                    var distanceFromPlace = 9999
                    polygonData.features.forEach(feature => {
                        placeIsWithBoundries = turf.booleanPointInPolygon(placeAsPoint, feature.geometry) ?? placeIsWithBoundries
                        if (!placeIsWithBoundries) {
                            const featureCoordinatesArray = feature.geometry.coordinates
                            if (Array.isArray(featureCoordinatesArray)) {
                                featureCoordinatesArray.forEach(coordinatesArray => {
                                    coordinatesArray.forEach(coordinates => {
                                        var coordinatesToProcess = coordinates
                                        if (coordinates.length == 2 && typeof coordinates[0] == 'number') {
                                            coordinatesToProcess = coordinatesArray
                                        }
                                        if (Array.isArray(coordinatesToProcess)) {
                                            const coordinatesToTest = Array.isArray(coordinatesToProcess[0]) ? coordinatesToProcess : [coordinatesToProcess, [0,0]]
                                            if (Array.isArray(coordinatesToTest)) {
                                                const coordinatesAsPointCollection = turf.featureCollection(coordinatesToTest.map(coords => turf.point(coords)))
                                                const closestPoint = turf.nearestPoint(placeAsPoint, coordinatesAsPointCollection)
                                                const localDistanceFromPlace = turf.distance(placeAsPoint, closestPoint, {units: 'miles'})
                                                distanceFromPlace = localDistanceFromPlace < distanceFromPlace ? localDistanceFromPlace : distanceFromPlace
                                            } 
                                        }
                                    })
                                })
                            }
                            if (distanceFromPlace < (place.isPostcode ? postcodeIsInFloodAreaTolerance : townIsInFloodAreaTolerance)) {
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
                    areas[index].affectsPlaceDirectly = distanceFromPlace == 0 || placeIsWithBoundries
                })
                const filteredAreas = areas.filter(area => {
                    return !area.hasDistance || area.distance < (req.session.data.searchRadius ? Number(req.session.data.searchRadius) : cuttoffDistanceFromPostcode)
                })
                place.warningAreas = filteredAreas.filter(area => {
                    return area.notation.includes('FW')
                })
                place.alertAreas = filteredAreas.filter(area => {
                    return area.notation.includes('WA')
                })
                req.session.data.location = place
                res.redirect(nextPage)
            })).catch(errors => {
                console.log('Polygon fetch error', errors)
            })
        }).catch(error => {
            console.log('Error', error.message)
            res.redirect(errorPage)
        })
})

router.post('/warning-select', (req, res) => {
    const nextPage = req.session.data['next-page']
    const selectedAreaIds = req.session.data['subscribed-warning-areas']
    const willAcceptSingleArea = req.session.data['subscribe-only-warning-area'] == 'Yes'
    const singleWarningAreaId = req.session.data['single-warning-area']
    if (!Array.isArray(req.session.data.subscribedAreas)) {
        req.session.data.subscribedAreas = []
    }
    // Remove any that are unchecked
    if (Array.isArray(req.session.data.location.warningAreas)) {
        req.session.data.location.warningAreas.forEach(area => {
            const selectedAreaIndex = req.session.data.subscribedAreas.indexOf(area.notation)
            if (selectedAreaIndex > -1) {
                req.session.data.subscribedAreas.splice(selectedAreaIndex, 1)
            }
        })
    }
    const selectedAreaIndex = req.session.data.subscribedAreas.indexOf(singleWarningAreaId)
    if (selectedAreaIndex > -1) {
        req.session.data.subscribedAreas.splice(selectedAreaIndex, 1)
    }
    // Add any that are checked
    if (Array.isArray(selectedAreaIds)) {
        selectedAreaIds.forEach(areaId => {
            if (areaId != '_unchecked') {
                if (!req.session.data.subscribedAreas.includes(areaId)) {
                    req.session.data.subscribedAreas.push(areaId)
                }
            }
        })
    }
    if (willAcceptSingleArea) {
        if (!req.session.data.subscribedAreas.includes(singleWarningAreaId)) {
            req.session.data.subscribedAreas.push(singleWarningAreaId)
        }
    }
    res.redirect(nextPage)
})


router.post('/alert-select', (req, res) => {
    const nextPage = req.session.data['next-page']
    const selectedAreaIds = req.session.data['subscribed-alert-areas']
    const willAcceptSingleArea = req.session.data['subscribe-only-alert-area'] == 'Yes'
    const singleAlertAreaId = req.session.data['single-alert-area']
    if (!Array.isArray(req.session.data.subscribedAreas)) {
        req.session.data.subscribedAreas = []
    }
    // Remove any that are unchecked
    if (Array.isArray(req.session.data.location.alertAreas)) {
        req.session.data.location.alertAreas.forEach(area => {
            const selectedAreaIndex = req.session.data.subscribedAreas.indexOf(area.notation)
            if (selectedAreaIndex > -1) {
                req.session.data.subscribedAreas.splice(selectedAreaIndex, 1)
            }
        })
    }
    const selectedAreaIndex = req.session.data.subscribedAreas.indexOf(singleAlertAreaId)
    if (selectedAreaIndex > -1) {
        req.session.data.subscribedAreas.splice(selectedAreaIndex, 1)
    }
    // Add any that are checked
    if (Array.isArray(selectedAreaIds)) {
        selectedAreaIds.forEach(areaId => {
            if (areaId != '_unchecked') {
                if (!req.session.data.subscribedAreas.includes(areaId)) {
                    req.session.data.subscribedAreas.push(areaId)
                }
            }
        })
    }
    if (willAcceptSingleArea) {
        if (!req.session.data.subscribedAreas.includes(singleAlertAreaId)) {
            req.session.data.subscribedAreas.push(singleAlertAreaId)
        }
    }
    res.redirect(nextPage)
})


router.post('/remove-area', (req, res) => {
    const nextPage = req.session.data['next-page']
    const selectedAreaId = req.session.data['selected-area']
    if (!Array.isArray(req.session.data.subscribedAreas)) {
        req.session.data.subscribedAreas = []
    }
    // Remove any that are unchecked
    const selectedAreaIndex = req.session.data.subscribedAreas.indexOf(selectedAreaId)
    if (selectedAreaIndex > -1) {
        req.session.data.subscribedAreas.splice(selectedAreaIndex, 1)
    }
    res.redirect(nextPage)
})

module.exports = router
