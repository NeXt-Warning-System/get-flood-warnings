const express = require('express')
const router = express.Router()

const filters = require('./filters')(process.env)

// Add your routes here - above the module.exports line


// all routes for registration v2
router.use('/v2', require('./routes_v2'))


// Route index page
router.get('/', function (req, res) {
    res.render('index')
  })

router.all('*', (req, res, next) => {
    req.session.data.postcodeNotFound = false
    next()
})

let placeRouter = require('./routes/place')
router.use('/place', placeRouter)

let locationRouter = require('./routes/location')
router.use('/location', locationRouter)

module.exports = router
