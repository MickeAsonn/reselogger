// HOMESCREEN FALLBACK: Only show a Safari button
(function(){
  if (window.navigator.standalone === true) {
    const target = window.location.href;
    document.body.innerHTML = `
      <div class="fallbackBox">
        Denna app kräver Safari för GPS.<br><br>
        <a href="${target}">Öppna i Safari</a>
      </div>`;
    return;
  }
})();

// ===== ORIGINAL V9 FUNCTIONALITET =====
let map, marker, polyline, watchId=null, pts=[], km=0, start=null, stop=null, follow=true;
const $=id=>document.getElementById(id);
function kmDist(a,b){const R=6371;const dLat=(b.lat-a.lat)*Math.PI/180;const dLon=(b.lon-a.lon)*Math.PI/180;const la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180;const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function ui(){ $('pts').textContent=pts.length; $('totkm').textContent=km.toFixed(2); }

map=L.map('map').setView([58.5877,16.1924],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
polyline=L.polyline([], {color:'#1976d2',weight:5}).addTo(map);
map.on('dragstart',()=>{follow=false});

$('startBtn').onclick=()=>{
  pts=[]; km=0; start=new Date(); stop=null; ui(); $('status').textContent='Startar GPS…';
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(onFix,onErr,{enableHighAccuracy:true,maximumAge:0,timeout:20000});
    watchId=navigator.geolocation.watchPosition(onFix,onErr,{enableHighAccuracy:true,maximumAge:0,timeout:60000});
  } else $('status').textContent='Enheten saknar geolocation.';
  $('startBtn').disabled=true; $('stopBtn').disabled=false; $('exportNowBtn').disabled=true; follow=true;
};

$('stopBtn').onclick=()=>{
  if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;}
  stop=new Date(); $('status').textContent='Klar';
  $('startBtn').disabled=false; $('stopBtn').disabled=true; $('exportNowBtn').disabled=false;
};

function onFix(p){
  const o={lat:p.coords.latitude,lon:p.coords.longitude,ts:Date.now()};
  if(pts.length){const d=kmDist(pts[pts.length-1],o);if(d<2)km+=d;} else map.setView([o.lat,o.lon],15);
  pts.push(o); polyline.addLatLng([o.lat,o.lon]);
  if(!marker) marker=L.marker([o.lat,o.lon]).addTo(map);
  marker.setLatLng([o.lat,o.lon]); if(follow) map.setView([o.lat,o.lon], Math.max(map.getZoom(),15));
  ui(); $('status').textContent='GPS aktiv';
}
function onErr(err){ $('status').textContent='GPS-fel: '+(err.message||'okänt'); }
$('followBtn').onclick=()=>{ follow=true; if(pts.length) map.setView([pts[pts.length-1].lat,pts[pts.length-1].lon], Math.max(map.getZoom(),15)); };

function buildTrip(){return {id:start.toISOString(),date:start.toISOString().slice(0,10),startTime:start.toISOString(),stopTime:stop?stop.toISOString():null,totalKm:Number(km.toFixed(3)),points:pts.slice()};}

$('exportNowBtn').onclick=()=>{
  const t=buildTrip();
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([["Datum","Starttid","Stopptid","Total km"],[t.date,t.startTime,t.stopTime,t.totalKm]]);
  XLSX.utils.book_append_sheet(wb,ws,'Sammanfattning');
  XLSX.writeFile(wb,'resa.xlsx');
};
