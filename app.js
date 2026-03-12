
(function(){let map,marker,polyline,watchId=null,points=[],totalKm=0,startTime=null,stopTime=null;
const $=id=>document.getElementById(id);

function init(){
  map=L.map('map');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  polyline=L.polyline([], {color:'#1976d2'}).addTo(map);
  map.setView([58.5877,16.1924],12);
}
init();

function dist(a,b){const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180;const h=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function update(){ $('km').textContent=`Totalt: ${totalKm.toFixed(2)} km`; }

$('startBtn').onclick=()=>{points=[];totalKm=0;startTime=new Date();$('status').textContent='Registrerar…';polyline.setLatLngs([]);if(marker){map.removeLayer(marker);marker=null;}watchId=navigator.geolocation.watchPosition(onPos,console.error,{enableHighAccuracy:true});$('startBtn').disabled=true;$('stopBtn').disabled=false;}
$('stopBtn').onclick=()=>{if(watchId){navigator.geolocation.clearWatch(watchId);watchId=null;}stopTime=new Date();$('status').textContent='Klar';$('startBtn').disabled=false;$('stopBtn').disabled=true;const ok=points.length>0;$('exportExcelBtn').disabled=$('exportPdfBtn').disabled=$('mailBtn').disabled=!ok;saveTripLocal(build())}
function onPos(pos){const p={lat:pos.coords.latitude,lon:pos.coords.longitude,ts:Date.now()};if(points.length){const km=dist(points[points.length-1],p);if(km<2){totalKm+=km;update();}}else map.setView([p.lat,p.lon],15);points.push(p);polyline.addLatLng([p.lat,p.lon]);if(!marker)marker=L.marker([p.lat,p.lon]).addTo(map);marker.setLatLng([p.lat,p.lon]);}
function build(){return{id:startTime.toISOString(),date:startTime.toISOString().slice(0,10),startTime:startTime.toISOString(),stopTime:stopTime.toISOString(),totalKm:Number(totalKm.toFixed(2)),points:points}}

// IndexedDB
const DB='reselogger',STORE='trips';function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});} 
async function saveTripLocal(t){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(t);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});} 
async function listTrips(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).getAll();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error)});} 
async function delTrip(id){const db=await openDB();db.transaction(STORE,'readwrite').objectStore(STORE).delete(id);} 
async function clearAll(){const db=await openDB();db.transaction(STORE,'readwrite').objectStore(STORE).clear();}

$('clearLastBtn').onclick=async()=>{const t=await listTrips();if(!t.length)return alert('Ingen historik');if(!confirm('Rensa senaste?'))return;await delTrip(t[t.length-1].id);alert('Rensad');}
$('clearAllBtn').onclick=async()=>{if(!confirm('Rensa ALL historik?'))return;await clearAll();alert('Allt rensat');}

function rows(t){const r=[["Datum",t.date],["Start",t.startTime],["Stop",t.stopTime],["Km",t.totalKm],[],["Tid","Lat","Lon"]];for(const p of t.points)r.push([new Date(p.ts).toISOString(),p.lat,p.lon]);return r;}
$('exportExcelBtn').onclick=()=>{const t=build();const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(rows(t));XLSX.utils.book_append_sheet(wb,ws,'Resa');XLSX.writeFile(wb,`resa_${t.date}.xlsx`)}
$('exportPdfBtn').onclick=()=>{const t=build();const{jsPDF}=window.jspdf;const doc=new jsPDF();let y=10;rows(t).forEach(r=>{doc.text(String(r),10,y);y+=10;if(y>280)doc.addPage()});doc.save(`resa_${t.date}.pdf`)}
$('mailBtn').onclick=()=>alert('Mailfunktion kräver backend (ej GitHub Pages)')

// SAFARI FIX — hide map fully with visibility
$('historyBtn').onclick=async()=>{
  const list=await listTrips();const box=$('historyList');box.innerHTML='';
  list.forEach(t=>{const d=document.createElement('div');d.textContent=t.date+' '+t.totalKm+' km';d.style.padding='8px';d.style.margin='6px 0';d.style.border='1px solid #ccc';d.onclick=()=>{points=t.points;totalKm=t.totalKm;polyline.setLatLngs(t.points.map(p=>[p.lat,p.lon]));update();};box.appendChild(d);});
  $('historyModal').classList.remove('hidden');
  const m=document.getElementById('map');
  m.style.visibility='hidden';
  m.style.pointerEvents='none';
};
$('closeHistory').onclick=()=>{
  $('historyModal').classList.add('hidden');
  const m=document.getElementById('map');
  m.style.visibility='visible';
  m.style.pointerEvents='auto';
};

})();
