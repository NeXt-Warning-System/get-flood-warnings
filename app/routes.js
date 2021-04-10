const express = require('express')
const router = express.Router()

// Add your routes here - above the module.exports line

let placeRouter = require('./routes/place')
router.use('/place', placeRouter)

module.exports = router
