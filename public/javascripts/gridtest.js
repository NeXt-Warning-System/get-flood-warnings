
$( "select#size" ).on("change",function(){

  // Remove all existing grid square if there are any
  $( ".gridsq" ).remove();

  // Add first grid square
  $( "#map" ).append( '<div class="gridsq" id="sq0" tabindex="1"></div>' );

  var gridSizeSelected = $( "select#size" ).val()
  var gridSizePx = parseInt(gridSizeSelected, 10)
  //var gridSizePx = 50

  //console.log("gridSizePx:" + gridSizePx)

  var gridBorderPx = 1
  var gridWidthHeight = gridSizePx - (2 * gridBorderPx)
  var mapWidth = $( "#map" ).width()
  var mapHeight = $( "#map" ).height()

  var numWide = parseInt(mapWidth/gridSizePx, 10)
  var numHigh = parseInt(mapHeight/gridSizePx, 10)

  //console.log("numWide:" + numWide)

  var numSquares = numWide * numHigh

  //console.log("numSquares:" + numSquares)

  $( ".gridsq" ).css( "width", gridWidthHeight )
  $( ".gridsq" ).css( "height", gridWidthHeight )
  $( ".gridsq" ).css( "border-width", gridBorderPx+"px" )

  for (var i = 1; i < numSquares; i++) {
    $( "#sq0" ).clone().attr('id', 'sq'+ i).appendTo( "#map" )
  }


// Select square functions
    $( ".gridsq" ).click(function () {
            $( this ).toggleClass('on')
    });

    $( ".gridsq" ).on('keydown',function(e) {
        if (e.key === ' ' || e.key === 'Spacebar')  {
            e.preventDefault()
            $( this ).click()
        }
        if (e.keyCode == '38') {
            // up arrow
            e.preventDefault()
            var thisSqId = $(this).attr('id')
            $( "#sq"+moveSq(thisSqId, (numWide*-1) ) ).focus()
        }
        else if (e.keyCode == '40') {
            // down arrow
            e.preventDefault()
            var thisSqId = $(this).attr('id')
            $( "#sq"+moveSq(thisSqId,numWide) ).focus()
        }
        else if (e.keyCode == '37') {
           // left arrow
           e.preventDefault()
           var thisSqId = $(this).attr('id')
           $( "#sq"+moveSq(thisSqId,-1) ).focus()
        }
        else if (e.keyCode == '39') {
           // right arrow
           e.preventDefault()
           var thisSqId = $(this).attr('id')
           $( "#sq"+moveSq(thisSqId,1) ).focus()
        }

    })

}).trigger("change") // extra call to initialise at start  // end onchange

function moveSq(thisSqId,dist){
  var thisSqNum = parseInt(thisSqId.replace("sq", ""), 10)
  var nextSqNum = thisSqNum + dist
  var nextSqNumStr = nextSqNum.toString()
  return nextSqNumStr
}
