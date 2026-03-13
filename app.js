// Safari-only v3.1 with live diagnosis overlay
let map, marker, polyline, watchId=null, pts=[], km=0, start=null, stop=null, follow=true;
const $=id=>document.getElementById(id);
function kmDist(a,b){const R=6371;const dLat=(b.lat-a.lat)*Math.PI/180;const dLon=(b.lon-a.lon)*Math.PI/180;const la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180;const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function ui(){ $('pts').textContent=String(pts.length); $('totkm').textContent=km.toFixed(2); }

// Map
map=L.map('map').setView([58.5877,16.1924],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
polyline=L.polyline([], {color:'#1976d2',weight:5}).addTo(map);
map.on('dragstart', ()=>{follow=false;});

// Diagnosis overlay
const diag=$('diag');
function logDiag(){
  const lines=[];
  lines.push('secureContext: '+(window.isSecureContext?'JA':'NEJ'));
  lines.push('standalone: '+(window.navigator.standalone===true?'JA':'NEJ'));
  lines.push('punkter: '+pts.length);
  diag.innerHTML = lines.join('<br>')+
    '<br><button id="dPerm">Läs behörighet</button> <button id="dTest">Testa GPS nu</button>\n<div id="dOut" style="margin-top:6px;white-space:pre-wrap"></div>';
  $('dPerm').onclick=async()=>{
    try{
      if(navigator.permissions&&navigator.permissions.query){
        const p=await navigator.permissions.query({name:'geolocation'});
        $('dOut').textContent='permission.state = '+p.state;
      } else {$('dOut').textContent='permissions.query ej tillgängligt';}
    }catch(e){$('dOut').textContent='perm error: '+e;}
  };
  $('dTest').onclick=()=>{
    if(!navigator.geolocation){$('dOut').textContent='geolocation saknas';return}
    $('dOut').textContent='Hämtar...';
    navigator.geolocation.getCurrentPosition(
      pos=>{$('dOut').textContent='OK '+pos.coords.latitude.toFixed(5)+','+pos.coords.longitude.toFixed(5)+' ±'+Math.round(pos.coords.accuracy)+'m';},
      err=>{$('dOut').textContent='ERROR '+(err&&err.message||('code '+err.code));},
      {enableHighAccuracy:true, maximumAge:0, timeout:20000}
    );
  };
}
logDiag();

// Start
$('startBtn').onclick=()=>{
  pts=[]; km=0; start=new Date(); stop=null; ui(); $('status').textContent='Startar GPS…';
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(onFix, onErr, {enableHighAccuracy:true, maximumAge:0, timeout:20000});
    watchId=navigator.geolocation.watchPosition(onFix, onErr, {enableHighAccuracy:true, maximumAge:0, timeout:60000});
  } else { $('status').textContent='Denna enhet saknar geolocation.'; return; }
  $('startBtn').disabled=true; $('stopBtn').disabled=false; $('exportNowBtn').disabled=true; follow=true;
};

// Stop
$('stopBtn').onclick=()=>{
  if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; }
  stop=new Date(); $('status').textContent='Klar';
  $('startBtn').disabled=false; $('stopBtn').disabled=true; $('exportNowBtn').disabled=false;
};

function onFix(p){ const o={lat:p.coords.latitude, lon:p.coords.longitude, ts:Date.now()}; if(pts.length){ const d=kmDist(pts[pts.length-1],o); if(d<2) km+=d; } else { map.setView([o.lat,o.lon],15); }
  pts.push(o); polyline.addLatLng([o.lat,o.lon]); if(!marker) marker=L.marker([o.lat,o.lon]).addTo(map); marker.setLatLng([o.lat,o.lon]); if(follow) map.setView([o.lat,o.lon], Math.max(map.getZoom(),15)); ui(); $('status').textContent='GPS aktiv'; logDiag(); }
function onErr(err){ $('status').textContent='GPS-fel: '+(err&&err.message||'okänt'); logDiag(); }

$('followBtn').onclick=()=>{ follow=true; if(pts.length) map.setView([pts[pts.length-1].lat, pts[pts.length-1].lon], Math.max(map.getZoom(),15)); };

// Reverse geocoding + exports + IndexedDB omitted in diagnos build for brevity
