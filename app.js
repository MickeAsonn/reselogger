let map,marker,polyline,watchId=null,pts=[],km=0,start=null,stop=null,follow=true;
const $=id=>document.getElementById(id);
function kmDist(a,b){const R=6371;const dLat=(b.lat-a.lat)*Math.PI/180;const dLon=(b.lon-a.lon)*Math.PI/180;const la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180;const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function ui(){$('pts').textContent=String(pts.length);$('totkm').textContent=km.toFixed(2);} 

// Hjälpare: svensk lokaltid
function two(n){return ('0'+n).slice(-2);} 
function dateKeyLocal(d){return d.getFullYear()+"-"+two(d.getMonth()+1)+"-"+two(d.getDate());}
function timeLocalISO(d){ // YYYY-MM-DD HH:mm:ss i lokal tid
  return dateKeyLocal(d)+" "+two(d.getHours())+":"+two(d.getMinutes())+":"+two(d.getSeconds());
}

// Karta
map=L.map('map').setView([58.5877,16.1924],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
polyline=L.polyline([], {color:'#1976d2',weight:5}).addTo(map);
map.on('dragstart',()=>{follow=false});

const ONE_HOUR = 60*60*1000; // 60 minuter

$('startBtn').onclick=()=>{
  pts=[]; km=0; start=new Date(); stop=null; ui(); $('status').textContent='Startar GPS…';
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(onFix,onErr,{enableHighAccuracy:true,maximumAge:0,timeout:ONE_HOUR});
    watchId=navigator.geolocation.watchPosition(onFix,onErr,{enableHighAccuracy:true,maximumAge:0,timeout:ONE_HOUR});
  } else { $('status').textContent='Denna enhet saknar geolocation.'; return; }
  $('startBtn').disabled=true; $('stopBtn').disabled=false; $('exportNowBtn').disabled=true; follow=true;
};

$('stopBtn').onclick=async()=>{
  if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; }
  stop=new Date(); $('status').textContent='Klar';
  const trip = await buildTrip();
  if(trip && trip.points && trip.points.length){ await saveTrip(trip); }
  $('startBtn').disabled=false; $('stopBtn').disabled=true; $('exportNowBtn').disabled=false;
};

function onFix(p){ const o={lat:p.coords.latitude,lon:p.coords.longitude,ts:Date.now()}; if(pts.length){ const d=kmDist(pts[pts.length-1],o); if(d<2) km+=d; } else { map.setView([o.lat,o.lon],15); } pts.push(o); polyline.addLatLng([o.lat,o.lon]); if(!marker) marker=L.marker([o.lat,o.lon]).addTo(map); marker.setLatLng([o.lat,o.lon]); if(follow) map.setView([o.lat,o.lon], Math.max(map.getZoom(),15)); ui(); $('status').textContent='GPS aktiv'; }
function onErr(e){ $('status').textContent='GPS-fel: '+(e&&e.message||e.code); }
$('followBtn').onclick=()=>{ follow=true; if(pts.length) map.setView([pts[pts.length-1].lat,pts[pts.length-1].lon], Math.max(map.getZoom(),15)); };

async function buildTrip(){
  const t={
    id: start? start.toISOString(): String(Date.now()),
    date: start? dateKeyLocal(start): dateKeyLocal(new Date()), // svensk dag-nyckel
    startTime: start? timeLocalISO(start): null,  // svensk tidsträng
    stopTime: stop? timeLocalISO(stop): null,     // svensk tidsträng
    totalKm: Number(km.toFixed(3)),
    points: pts.slice()
  };
  return t;
}

// Reverse geocoding
const geoCache=new Map();function key(p){return p.lat.toFixed(3)+','+p.lon.toFixed(3);} 
async function ort(p){if(!p)return'Ingen';const k=key(p);if(geoCache.has(k))return geoCache.get(k);try{const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+p.lat+'&lon='+p.lon+'&zoom=14&addressdetails=1',{headers:{'Accept':'application/json'}});const d=await r.json();const a=d.address||{};let o=a.town||a.city||a.village||a.municipality||a.county||'Okänd';geoCache.set(k,o);return o;}catch(e){return'Okänd';}}

// Export aktuell resa (svensk tid i celler och filnamn)
$('exportNowBtn').onclick=async()=>{
  if(!start){alert('Ingen resa startad.');return;}
  const t=await buildTrip();
  const sO=await ort(t.points[0]); const eO=await ort(t.points[t.points.length-1]);
  const wb=XLSX.utils.book_new();
  const ws1=XLSX.utils.aoa_to_sheet([["Datum","Start","Stopp","Km","Startort","Slutort"],[t.date,t.startTime,t.stopTime,t.totalKm,sO,eO]]);
  XLSX.utils.book_append_sheet(wb,ws1,'Sammanfattning');
  const rows=[["Tid (sv)","Ort"]]; const step=Math.max(1,Math.floor(Math.max(1,t.points.length)/20));
  for(let i=0;i<t.points.length;i+=step){ const d=new Date(t.points[i].ts); rows.push([timeLocalISO(d), await ort(t.points[i])]); }
  const ws2=XLSX.utils.aoa_to_sheet(rows); XLSX.utils.book_append_sheet(wb,ws2,'Punkter');
  const safe=t.date.replace(/[^0-9A-Za-z_-]/g,'-'); XLSX.writeFile(wb,'resa_'+safe+'.xlsx');
};

// IndexedDB
const DB='reselogger',STORE='trips';
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function saveTrip(t){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(t);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function allTrips(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).getAll();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error);});}
async function delTrip(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function clearDB(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}

$('cleanEmptyBtn').onclick=async()=>{const list=await allTrips();const empt=list.filter(t=>!t.points||!t.points.length);if(!empt.length){alert('Inga tomma');return;}if(!confirm('Rensa '+empt.length+' tomma?'))return;for(const t of empt)await delTrip(t.id);alert('Klart');};
$('clearAllBtn').onclick=async()=>{if(!confirm('Rensa ALL historik?'))return;await clearDB();alert('Historik rensad');};

$('exportRangeBtn').onclick=async()=>{
  const list=await allTrips();
  const from=($('fromDate').value||'0000-01-01');
  const to=($('toDate').value||'9999-12-31');
  const sel=list.filter(t=> (t.date||'')>=from && (t.date||'')<=to ).sort((a,b)=> (a.date||'').localeCompare(b.date||''));
  if(!sel.length){ alert('Inga resor i valt intervall.'); return; }
  const wb=XLSX.utils.book_new(); const rows=[["Datum","Start","Stop","Km","Startort","Stopp Ort"]];
  for(const t of sel){ const sP=t.points&&t.points[0]; const eP=t.points&&t.points[t.points.length-1]; rows.push([t.date, t.startTime||'', t.stopTime||'', Number(t.totalKm||0), await ort(sP), await ort(eP)]); }
  const ws=XLSX.utils.aoa_to_sheet(rows); XLSX.utils.book_append_sheet(wb,ws,'Resor');
  XLSX.writeFile(wb,'resor_'+from+'_till_'+to+'.xlsx');
};
