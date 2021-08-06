const express = require('express')
const router = express.Router()

var folder = "v5"
var servicename = "Get flood warnings"
var paymentMethod = "govpay"  // or "govpay"


// HTML for standard buttons
var backlink = '<a href="javascript:history.back()" class="govuk-back-link">Back</a>'
var submitButton = '<button type="submit" id="continueButton" class="govuk-button" name="Continue">Continue</button>'
//var completeLink = '<a id="completeLink" href="/'+folder+'/save-and-return/check">Continue later</a>'
var completeLink = ''

function nocache(req, res, next) {
  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.header('Expires', '-1');
  res.header('Pragma', 'no-cache');
  next();
}

router.use(function (req, res, next) {
    // set a folder and store in locals
    // this can then be used in pages as {{folder}}
    res.locals.folder=folder
    res.locals.backlink=backlink
    res.locals.submitButton=submitButton
    res.locals.completeLink=completeLink
    res.locals.paymentMethod=paymentMethod
    res.locals.serviceName=servicename
    // permit and autostore data set in all statement at bottom
    res.locals.permit=res.locals.data
    next()
  });

router.get('/target-area/autocomplete', function (req, res) {
  res.locals.targetAreas = JSON.stringify(require('./data/target-areas').data)
  res.render(folder + '/target-area/autocomplete',{
      "formAction":"/"+ folder + "/target-area/review"
  })
})

router.get('/target-area/autocomplete-error', function (req, res) {
  res.locals.targetAreas = JSON.stringify(require('./data/target-areas').data)
  res.render(folder + '/target-area/autocomplete-error',{
      "formAction":"/"+ folder + "/target-area/review"
  })
})

router.get('/target-area/review', function (req, res) {
  res.locals.targetAreas = JSON.stringify(require('./data/target-areas').data)
  res.render(folder + '/target-area/autocomplete-error',{
      "formAction":"/"+ folder + "/target-area/review"
  })
})

function getTargetArea (taString) {
  const words = taString.split(' ')
  const code = words.slice(-1)[0]
  const name = words.slice(0, -1).join(' ')
  return { code, name }
}

router.post('/target-area/review', function (req, res) {
  const targetAreas = require('./data/target-areas').data
  const targetAreaString = targetAreas.find(ta => ta === res.locals.data.targetareaautocomplete)

  if (targetAreaString) {
    const targetArea = getTargetArea(targetAreaString)
    res.render(folder + '/target-area/review', { targetArea })
  } else {
    res.render(folder + '/target-area/autocomplete-error', { targetArea: { name: targetAreaString } })
  }
})

router.post('/target-area/review-input', function (req, res) {
  const targetAreas = require('./data/target-areas').data
  const targetArea = targetAreas.map(ta => getTargetArea(ta)).find(ta => ta.code === res.locals.data['target-area'])

  if (targetArea) {
    res.render(folder + '/target-area/review', { targetArea })
  } else {
    res.render(folder + '/target-area/error', { targetArea })
  }
})



// REGIONS ============
router.get('/location/catigories', function (req, res) {
  res.render(folder + '/location/catigories',{
    "formAction":"/"+ folder + "/location/catigories-check"
  })
})

router.post('/location/catigories', function (req, res) {
  res.render(folder + '/location/catigories',{
    "formAction":"/"+ folder + "/location/catigories-check"
  })
})


// dirceting to regions
router.post('/location/catigories-check', function (req, res) {
  var region = req.body.region

    if (req.session.data.chosenRegion==="Yorkshire") {
      res.redirect("/"+ folder + "/location/regions/yorkshire")
    } else if (req.session.data.chosenRegion==="Thames"){
      res.redirect("/"+ folder + "/location/regions/thames")
    } else if (req.session.data.chosenRegion==="West Midlands"){
      res.redirect("/"+ folder + "/location/regions/west-midlands")
    } else if (req.session.data.chosenRegion==="Wessex"){
      res.redirect("/"+ folder + "/location/regions/wessex")    
    } else if (req.session.data.chosenRegion==="Solent and South Downs"){
        res.redirect("/"+ folder + "/location/regions/solent-south-downs")
    } else if (req.session.data.chosenRegion==="North East"){
        res.redirect("/"+ folder + "/location/regions/north-east")
    } else if (req.session.data.chosenRegion==="Lincolnshire and Northamptonshire"){
          res.redirect("/"+ folder + "/location/regions/lincs-northants")
    } else if (req.session.data.chosenRegion==="Kent, South London and East Sussex"){
          res.redirect("/"+ folder + "/location/regions/kent-s-london-e-sussex")
    } else if (req.session.data.chosenRegion==="Hertfordshire and North London"){
            res.redirect("/"+ folder + "/location/regions/herts-north-london")
    } else if (req.session.data.chosenRegion==="Cumbria and Lancashire"){
            res.redirect("/"+ folder + "/location/regions/cumbria-lancashire")
    } else if (req.session.data.chosenRegion==="Devon, Cornwall and the Isles of Scilly"){
            res.redirect("/"+ folder + "/location/regions/devon-cornwall")
    } else if (req.session.data.chosenRegion==="East Anglia"){
            res.redirect("/"+ folder + "/location/regions/east-anglia")
    } else if (req.session.data.chosenRegion==="East Midlands"){
            res.redirect("/"+ folder + "/location/regions/east-midlands")
    } else if (req.session.data.chosenRegion==="Greater Manchester, Merseyside and Cheshire"){
            res.redirect("/"+ folder + "/location/regions/gtr-mancs-mersey-ches")
    } else {
      res.redirect("/"+ folder + "/not-yet-built")
    }
})

  // Choose alerts ==============================================================

  router.get('/find-location/choose-alerts', function (req, res) {
    res.render(folder+'/find-location/choose-alerts',{
        "formAction":"/"+folder+"/find-location/choose-alerts-check"
    })
  })

  router.post('/find-location/choose-alerts', function (req, res) {
    res.render(folder+'/find-location/choose-alerts',{
        "formAction":"/"+folder+"/find-location/choose-alerts-check"
    })
  })
  
  // Route to check if new application has started or is a renewal
  router.post('/find-location/choose-alerts-check', function (req, res) {
  
    if (req.body['alertsChoose']=="yes") {
      res.redirect("/"+folder+"/find-location/alerts")
    } else {
      res.redirect("/"+folder+"/find-location/review")
    }
  })


  // Is address selection correct? ==============================================================

  router.get('/address/address-confirm', function (req, res) {
    res.render(folder+'/address/address-confirm',{
        "formAction":"/"+folder+"/address/address-confirm-check"
    })
  })

  router.post('/address/address-confirm', function (req, res) {
    res.render(folder+'/address/address-confirm',{
        "formAction":"/"+folder+"/address/address-confirm-check"
    })
  })
  
  // Route to check if new application has started or is a renewal
  router.post('/address/address-confirm-check', function (req, res) {
  
    if (req.body['address-selection']=="no") {
      res.redirect("/"+folder+"/address/postcode")
    } else {
      res.redirect("/"+folder+"/address/address-risk")
    }
  })



  // Address risk (yes / try another / go to list) ==============================================================

  router.get('/address/address-risk', function (req, res) {
    res.render(folder+'/address/address-risk',{
        "formAction":"/"+folder+"/address/address-risk-check"
    })
  })

  router.post('/address/address-risk', function (req, res) {
    res.render(folder+'/address/address-risk',{
        "formAction":"/"+folder+"/address/address-risk-check"
    })
  })
  
  // Route to check if new application has started or is a renewal
  router.post('/address/address-risk-check', function (req, res) {
  
    if (req.body['selection']=="yes") {
      res.redirect("/"+folder+"/address/list")
    } else if (req.body['selection']=="no"){
      res.redirect("/"+folder+"/address/postcode")
    } else {
      res.redirect("/"+folder+"/address/address-risk")
    }
  })


module.exports = router
