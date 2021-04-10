const express = require('express')
const router = express.Router()

const cors = require('cors')

var corsOptions = {
  origin: 'http://environment.data.gov.uk/',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

router.use('*', cors(corsOptions))

// Add your routes here - above the module.exports line

let placeRouter = require('./routes/place')
router.use('/place', placeRouter)

module.exports = router
