let map,marker,polyline,watchId=null,pts=[],km=0,start=null,stop=null,follow=true;
const $=id=>document.getElementById(id);
function kmDist(a,b){const R=6371;const dLat=(b.lat-a.lat)*Math.PI/180;const dLon=(b.lon-a.lon)*Math.PI/180;const la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180;const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function ui(){$('pts').textContent=String(pts.length);$('totkm').textContent=km.toFixed(2);} 

// Karta
map=L.map('map').setView([58.5877,16.1924],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
polyline=L.polyline([], {color:'#1976d2',weight:5}).addTo(map);
map.on('dragstart',()=>{follow=false});

// Start/Stop
$('startBtn').onclick=()=>{pts=[];km=0;start=new Date();stop=null;ui();$('status').textContent='Startar GPS…';if(navigator.geolocation){navigator.geolocation.getCurrentPosition(onFix,onErr,{enableHighAccuracy:true,maximumAge:0,timeout:20000});watchId=navigator.geolocation.watchPosition(onFix,onErr,{enableHighAccuracy:true,maximumAge:0,timeout:60000});}$('startBtn').disabled=true;$('stopBtn').disabled=false;$('exportNowBtn').disabled=true;follow=true;};
$('stopBtn').onclick=()=>{if(watchId){navigator.geolocation.clearWatch(watchId);watchId=null;}stop=new Date();$('status').textContent='Klar';$('startBtn').disabled=false;$('stopBtn').disabled=true;$('exportNowBtn').disabled=false;};

function onFix(p){const o={lat:p.coords.latitude,lon:p.coords.longitude,ts:Date.now()};if(pts.length){const d=kmDist(pts[pts.length-1],o);if(d<2)km+=d;}else map.setView([o.lat,o.lon],15);
pts.push(o);polyline.addLatLng([o.lat,o.lon]);if(!marker)marker=L.marker([o.lat,o.lon]).addTo(map);marker.setLatLng([o.lat,o.lon]);if(follow)map.setView([o.lat,o.lon],Math.max(map.getZoom(),15));ui();$('status').textContent='GPS aktiv';}
function onErr(e){$('status').textContent='GPS-fel: '+(e&&e.message||e.code);} 
$('followBtn').onclick=()=>{follow=true;if(pts.length)map.setView([pts[pts.length-1].lat,pts[pts.length-1].lon],Math.max(map.getZoom(),15));};

// Reverse geocoding
const geoCache=new Map();function key(p){return p.lat.toFixed(3)+','+p.lon.toFixed(3);} 
async function ort(p){if(!p)return'Ingen';const k=key(p);if(geoCache.has(k))return geoCache.get(k);try{const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+p.lat+'&lon='+p.lon+'&zoom=14&addressdetails=1',{headers:{'Accept':'application/json'}});const d=await r.json();const a=d.address||{};let o=a.town||a.city||a.village||a.municipality||a.county||'Okänd';geoCache.set(k,o);return o;}catch(e){return'Okänd';}}

// Export aktuell resa
$('exportNowBtn').onclick=async()=>{if(!start){alert('Ingen resa startad.');return;}const t={id:start.toISOString(),date:start.toISOString().slice(0,10),startTime:start.toISOString(),stopTime:stop?stop.toISOString():null,totalKm:Number(km.toFixed(3)),points:pts.slice()};const sO=await ort(t.points[0]);const eO=await ort(t.points[t.points.length-1]);const wb=XLSX.utils.book_new();const ws1=XLSX.utils.aoa_to_sheet([["Datum","Start","Stopp","Km","Startort","Slutort"],[t.date,t.startTime,t.stopTime,t.totalKm,sO,eO]]);XLSX.utils.book_append_sheet(wb,ws1,'Sammanfattning');let rows=[["Tid","Ort"]];const step=Math.max(1,Math.floor(Math.max(1,t.points.length)/20));for(let i=0;i<t.points.length;i+=step){rows.push([new Date(t.points[i].ts).toISOString(),await ort(t.points[i])]);}const ws2=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws2,'Punkter');const safe=t.date.replace(/[^0-9A-Za-z_-]/g,'-');XLSX.writeFile(wb,'resa_'+safe+'.xlsx');};

// IndexedDB
const DB='reselogger',STORE='trips';function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function allTrips(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).getAll();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error);});}
async function delTrip(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function clearDB(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}

$('cleanEmptyBtn').onclick=async()=>{const list=await allTrips();const empt=list.filter(t=>!t.points||!t.points.length);if(!empt.length){alert('Inga tomma');return;}if(!confirm('Rensa '+empt.length+' tomma?'))return;for(const t of empt)await delTrip(t.id);alert('Klart');};
$('clearAllBtn').onclick=async()=>{if(!confirm('Rensa ALL historik?'))return;await clearDB();alert('Historik rensad');};

$('exportRangeBtn').onclick=async()=>{const list=await allTrips();const fd=$('fromDate').value||'0000-01-01';const td=$('toDate').value||'9999-12-31';const sel=list.filter(t=>t.date>=fd&&t.date<=td);if(!sel.length){alert('Inga resor');return;}const wb=XLSX.utils.book_new();const rows=[["Datum","Start","Stop","Km","Startort","Slutort"]];for(const t of sel){const sP=t.points[0];const eP=t.points[t.points.length-1];rows.push([t.date,t.startTime||'',t.stopTime||'',Number(t.totalKm||0),await ort(sP),await ort(eP)]);}const ws=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Resor');const f=fd.replace(/[^0-9A-Za-z_-]/g,'-'),tt=td.replace(/[^0-9A-Za-z_-]/g,'-');XLSX.writeFile(wb,'period_'+f+'_till_'+tt+'.xlsx');};
