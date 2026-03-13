(function(){
  if (window.navigator.standalone === true) {
    var target = window.location.href;
    document.body.innerHTML = "<div class='fallbackBox'>Denna app kräver Safari för GPS.<br/><br/>"+
      "<a id='openSafari' href='"+target+"'>Öppna i Safari</a></div>";
    // Stop rest of app
    throw new Error('Stop standalone');
  }
})();

// Rest of v9 code omitted for brevity but should be included here...
let map=L.map('map').setView([58.5877,16.1924],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
