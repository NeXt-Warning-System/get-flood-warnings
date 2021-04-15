const express = require('express')
const router = express.Router()

const axios = require('axios')
const proj4 = require('proj4')

const osApiKey = process.env.OS_API_KEY
const osSecret = process.env.OS_SECRET

const filters = require('../filters')(process.env)

const turf = require('@turf/turf')

// Radii

const postcodeFloodAreaSearchRadius = 0 // Search radius from centre of postcode in kilometers
const townFloodAreaSearchRadius = 6 // Search radius from centre of town in kilometers

const postcodeIsInFloodAreaTolerance = 0.15 // Areas that are less that X miles away from centre of postcode will be counted as zero miles away
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

router.post('/search', (req, res) => {
    const searchQuery = req.session.data['place-query']
    const nextPage = req.session.data['next-page']
    const errorPage = req.session.data['error-page']
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
                req.session.data.placeSearchTopResult = standardisedResults[0]
                req.session.data.placeSearchOtherResults = standardisedResults.slice(1, 11);
                if (req.session.data.placeSearchTopResult == null) {
                    throw new Error("No results")
                }
                req.session.data.placeSearchResponse = data
                res.redirect(nextPage)
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
    const place = req.session.data.allPlaceResults[selectedPlaceId]
    const placeAsPoint = turf.point(place.location)
    const radius = place.isPostcode ? postcodeFloodAreaSearchRadius : townFloodAreaSearchRadius
    const floodAreaURL = `https://environment.data.gov.uk/flood-monitoring/id/floodAreas?lat=${place.location[1]}&long=${place.location[0]}&dist=${radius}`
    axios.get(floodAreaURL)
        .then(response => {
            const data = response.data
            var areas = data.items
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
                            const coordinatesArray = feature.geometry.coordinates
                            if (Array.isArray(coordinatesArray)) {
                                coordinatesArray.forEach(coordinates => {
                                    if (Array.isArray(coordinates)) {
                                        if (Array.isArray(coordinates[0][0])) {
                                            const coordinatesAsTurfLine = turf.lineString(coordinates[0])
                                            const localDistanceFromPlace = turf.nearestPointOnLine(coordinatesAsTurfLine, placeAsPoint, {units: 'miles'}).properties.dist
                                            distanceFromPlace = localDistanceFromPlace < distanceFromPlace ? localDistanceFromPlace : distanceFromPlace
                                        }
                                    }
                                })
                            }
                            if (distanceFromPlace < (place.isPostcode ? postcodeIsInFloodAreaTolerance : townIsInFloodAreaTolerance)) {
                                distanceFromPlace = 0
                                placeIsWithBoundries = true
                            }
                        }
                    })
                    if (distanceFromPlace == 9999) {
                        distanceFromPlace = 0
                    }
                    areas[index].polygonData = polygonData
                    areas[index].distance = distanceFromPlace
                    areas[index].affectsPlaceDirectly = distanceFromPlace == 0
                })
                place.warningAreas = areas.filter(area => {
                    return area.notation.includes('FWF')
                })
                place.alertAreas = areas.filter(area => {
                    return area.notation.includes('WAF')
                })
                req.session.data.selectedPlace = place
                res.redirect(nextPage)
            })).catch(errors => {
                console.log('Polygon fetch error', errors)
            })
        }).catch(error => {
            console.log('Error', error.message)
        })
})

module.exports = router
