
// Simple, robust tracker + exports + storage + ort-lookup
let map, marker, polyline, watchId=null, pts=[], km=0, start=null, stop=null, follow=true;
const $=id=>document.getElementById(id);
function kmDist(a,b){const R=6371;const dLat=(b.lat-a.lat)*Math.PI/180;const dLon=(b.lon-a.lon)*Math.PI/180;const la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180;const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function ui(){ $('pts').textContent=String(pts.length); $('totkm').textContent=km.toFixed(2); }

// Map
function initMap(){ map=L.map('map').setView([58.5877,16.1924],12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map); polyline=L.polyline([], {color:'#1976d2',weight:5}).addTo(map); map.on('dragstart', ()=>{follow=false;}); }
initMap();

// Start/Stop
$('startBtn').onclick=()=>{
  pts=[]; km=0; start=new Date(); stop=null; ui(); $('status').textContent='Startar GPS…';
  if(navigator.geolocation){
    // Seed first fix fast
    navigator.geolocation.getCurrentPosition(onFix, onGeoErr, {enableHighAccuracy:true, maximumAge:0, timeout:20000});
    // Continuous
    watchId=navigator.geolocation.watchPosition(onFix, onGeoErr, {enableHighAccuracy:true, maximumAge:0, timeout:60000});
  } else {
    $('status').textContent='Denna enhet saknar geolocation.'; return;
  }
  $('startBtn').disabled=true; $('stopBtn').disabled=false; $('exportNowBtn').disabled=true; follow=true;
};
$('stopBtn').onclick=()=>{
  if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; }
  stop=new Date(); $('status').textContent='Klar'; $('startBtn').disabled=false; $('stopBtn').disabled=true; $('exportNowBtn').disabled=false;
  saveTrip(buildTrip()).catch(()=>{});
};

function onFix(p){ const o={lat:p.coords.latitude, lon:p.coords.longitude, ts:Date.now()}; if(pts.length){ const d=kmDist(pts[pts.length-1],o); if(d<2) km+=d; } else { map.setView([o.lat,o.lon],15); }
  pts.push(o); polyline.addLatLng([o.lat,o.lon]); if(!marker) marker=L.marker([o.lat,o.lon]).addTo(map); marker.setLatLng([o.lat,o.lon]); if(follow) map.setView([o.lat,o.lon], Math.max(map.getZoom(),15)); ui(); $('status').textContent='GPS aktiv'; }
function onGeoErr(err){ $('status').textContent='GPS-fel: '+(err&&err.message||'okänt'); }
$('followBtn').onclick=()=>{ follow=true; if(pts.length) map.setView([pts[pts.length-1].lat, pts[pts.length-1].lon], Math.max(map.getZoom(),15)); };

// Build trip object
function buildTrip(){ return { id:start?start.toISOString():String(Date.now()), date:(start||new Date()).toISOString().slice(0,10), startTime:start?start.toISOString():null, stopTime:stop?stop.toISOString():null, totalKm:Number(km.toFixed(3)), points:pts.slice() }; }

// Storage (IndexedDB)
const DB='reselogger', STORE='trips';
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1); r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'}); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);});}
async function saveTrip(t){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(t);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function allTrips(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).getAll();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error);});}
async function delTrip(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function clearAll(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}

$('cleanEmptyBtn').onclick=async()=>{const t=await allTrips();const empties=t.filter(x=>!x.points||!x.points.length);if(!empties.length)return alert('Inga tomma resor');if(!confirm(`Rensa ${empties.length} tomma resor?`))return;for(const e of empties) await delTrip(e.id);alert('Rensade tomma resor');};
$('clearAllBtn').onclick=async()=>{if(!confirm('Rensa ALL historik?'))return;await clearAll();alert('All historik rensad');};

// Reverse geocode (Ort)
const geoCache=new Map();
function cacheKey(p){return (Math.round(p.lat*1000)/1000)+','+(Math.round(p.lon*1000)/1000);} // ~100m
async function ortFor(p){ if(!p) return 'Ingen position'; const k=cacheKey(p); if(geoCache.has(k)) return geoCache.get(k); const qs=new URLSearchParams({format:'jsonv2',lat:String(p.lat),lon:String(p.lon),addressdetails:'1',zoom:'14','accept-language':'sv',email:'reselogger@example.com'}); try{const r=await fetch('https://nominatim.openstreetmap.org/reverse?'+qs.toString(),{headers:{'Accept':'application/json'}}); if(!r.ok) throw new Error('HTTP '+r.status); const data=await r.json(); const a=data.address||{}; let o=a.town||a.city||a.village||a.municipality||a.hamlet||a.suburb||a.neighbourhood||a.county||''; if(!o){ const dn=(data.display_name||'').split(','); if(dn.length)o=dn[0].trim(); } if(!o) o='Okänd ort'; geoCache.set(k,o); return o; }catch(e){ return 'Okänd ort'; } }

// Export current trip
$('exportNowBtn').onclick=async()=>{
  const t=buildTrip();
  const startOrt=await ortFor(t.points[0]);
  const stopOrt=await ortFor(t.points[t.points.length-1]);
  const wb=XLSX.utils.book_new();
  const summary=[['Datum','Starttid','Stopptid','Total km','Start Ort','Stopp Ort'],[t.date, t.startTime||'', t.stopTime||'', t.totalKm, startOrt, stopOrt]];
  const ws1=XLSX.utils.aoa_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, ws1, 'Sammanfattning');
  // Sample points (max 20) → Tid, Ort
  const rows=[['Tid (ISO)','Ort']];
  const max=20, step=Math.max(1, Math.floor((t.points.length||1)/max));
  for(let i=0;i<t.points.length;i+=step){ rows.push([new Date(t.points[i].ts).toISOString(), await ortFor(t.points[i])]); }
  const ws2=XLSX.utils.aoa_to_sheet(rows); XLSX.utils.book_append_sheet(wb, ws2, 'Punkter');
  const safe=(t.date||'resa').replace(/[^0-9A-Za-z_-]/g,'-');
  XLSX.writeFile(wb, `resa_${safe}.xlsx`);
};

// Export range
$('exportRangeBtn').onclick=async()=>{
  const list=await allTrips(); const from=$('fromDate').value||'0000-01-01', to=$('toDate').value||'9999-12-31';
  const sel=list.filter(t=> (t.date||'')>=from && (t.date||'')<=to).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  if(!sel.length){ alert('Inga resor i valt intervall.'); return; }
  const wb=XLSX.utils.book_new(); const rows=[['Datum','Starttid','Stopptid','Total km','Start Ort','Stopp Ort']];
  for(const t of sel){ const sP=t.points&&t.points[0]; const eP=t.points&&t.points[t.points.length-1]; rows.push([t.date, t.startTime||'', t.stopTime||'', Number(t.totalKm||0), await ortFor(sP), await ortFor(eP)]); }
  const ws=XLSX.utils.aoa_to_sheet(rows); XLSX.utils.book_append_sheet(wb, ws, 'Resor');
  const f=from.replace(/[^0-9A-Za-z_-]/g,'-'), tt=to.replace(/[^0-9A-Za-z_-]/g,'-');
  XLSX.writeFile(wb, `resor_${f}_till_${tt}.xlsx`);
};
