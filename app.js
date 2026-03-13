
(function(){
  if (window.navigator.standalone === true) {
    const target = window.location.href;
    document.body.innerHTML = `
      <div class='startScreen'>
        <img src='assets/icon-192.png'>
        <div>Mickes Reselogger</div><br>
        <button id='startPWA'>Starta Reselogger</button>
      </div>`;
    setTimeout(()=>{
      const b=document.getElementById('startPWA');
      if(b){b.onclick=()=>{window.open(target,'_top');};}
    },50);
    window.__blocked=true;
  }
})();

if(!window.__blocked){
// minimal working v9 functionality
let map=L.map('map').setView([58.5877,16.1924],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
}
