
// Remove any old service workers
if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister())).catch(()=>{});}

(function(){
  let map, marker, polyline, watchId=null, points=[], totalKm=0, startTime=null, stopTime=null;
  const $=id=>document.getElementById(id);
  const statusEl=$('status'), kmEl=$('km');
  const exportExcelBtn=$('exportExcelBtn');
  const exportRangeBtn=$('exportRangeBtn');

  function init(){
    map=L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    polyline=L.polyline([], {color:'#1976d2',weight:5}).addTo(map);
    map.setView([58.5877,16.1924],12);
  }
  init();

  function dist(a,b){const R=6371;const dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180;const la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180;const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
  function updateKm(){ kmEl.textContent=`Totalt: ${totalKm.toFixed(2)} km`; }

  $('startBtn').onclick=()=>{
    points=[]; totalKm=0; startTime=new Date(); stopTime=null; updateKm();
    statusEl.textContent='Status: Registrerar…';
    polyline.setLatLngs([]); if(marker){ map.removeLayer(marker); marker=null; }
    watchId=navigator.geolocation.watchPosition(onPos,onErr,{enableHighAccuracy:true,maximumAge:1000,timeout:15000});
    $('startBtn').disabled=true; $('stopBtn').disabled=false; exportExcelBtn.disabled=true;
  };
  function onPos(pos){
    const {latitude,longitude}=pos.coords; const p={lat:latitude,lon:longitude,ts:Date.now()};
    if(points.length){ const km=dist(points[points.length-1],p); if(km<2){ totalKm+=km; updateKm(); } }
    else { map.setView([p.lat,p.lon],15); }
    points.push(p); polyline.addLatLng([p.lat,p.lon]); if(!marker) marker=L.marker([p.lat,p.lon]).addTo(map); marker.setLatLng([p.lat,p.lon]);
  }
  function onErr(err){ statusEl.textContent='Geo-fel: '+err.message; }

  $('stopBtn').onclick=()=>{
    if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; }
    stopTime=new Date(); statusEl.textContent='Status: Klar';
    $('startBtn').disabled=false; $('stopBtn').disabled=true; exportExcelBtn.disabled=false;
    // Spara resan lokalt i IndexedDB
    saveTripLocal(buildTrip()).catch(e=>console.warn('saveTripLocal',e));
  };

  function buildTrip(){ return { id:startTime?startTime.toISOString():String(Date.now()), date:(startTime||new Date()).toISOString().slice(0,10), startTime:startTime?startTime.toISOString():null, stopTime:stopTime?stopTime.toISOString():null, totalKm:Number(totalKm.toFixed(3)), points:points.slice() }; }

  // === IndexedDB för period-export ===
  const DB='reselogger', STORE='trips';
  function openDB(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DB,1); r.onupgradeneeded=()=> r.result.createObjectStore(STORE,{keyPath:'id'}); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function saveTripLocal(t){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(t); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
  async function listTrips(){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).getAll(); rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error); }); }

  // Reverse geocoding → Ort
  const geocache=new Map();
  function key(p){return (Math.round(p.lat*1000)/1000)+','+(Math.round(p.lon*1000)/1000);} // ~100 m
  async function geocodeOrt(p){
    if(!p) return '—';
    const k=key(p); if(geocache.has(k)) return geocache.get(k);
    const params=new URLSearchParams({format:'jsonv2',lat:String(p.lat),lon:String(p.lon),addressdetails:'1',zoom:'14','accept-language':'sv',email:'reselogger@example.com'});
    const url=`https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
    try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); if(!resp.ok) throw new Error('HTTP '+resp.status); const data=await resp.json(); const a=data.address||{}; let ort=a.town||a.city||a.village||a.municipality||a.hamlet||a.suburb||a.neighbourhood||a.county||''; if(!ort){ const dn=(data.display_name||'').split(','); if(dn.length) ort=dn[0].trim(); } if(!ort) ort='Okänd ort'; geocache.set(k,ort); return ort; }catch(e){ console.warn('Geocoder fel',e); return 'Okänd ort'; }
  }

  // ====== Export av aktuell resa (en rad + punkter) ======
  async function exportCurrentTrip(){
    statusEl.textContent='Skapar Excel (hämtar ortnamn)…';
    const t=buildTrip();
    const startOrt=await geocodeOrt(t.points[0]);
    const stopOrt=await geocodeOrt(t.points[t.points.length-1]);
    const header=['Datum','Starttid','Stopptid','Total km','Start Ort','Stopp Ort'];
    const row=[t.date, t.startTime||'', t.stopTime||'', t.totalKm, startOrt, stopOrt];
    const max=20; const step=Math.max(1, Math.floor((t.points.length||1)/max));
    const rows=[['Tid (ISO)','Ort']];
    for(let i=0;i<t.points.length;i+=step){ const p=t.points[i]; const ort=await geocodeOrt(p); rows.push([new Date(p.ts).toISOString(), ort]); await new Promise(r=>setTimeout(r,60)); }
    const wb=XLSX.utils.book_new();
    const ws1=XLSX.utils.aoa_to_sheet([header,row]);
    const ws2=XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Sammanfattning');
    XLSX.utils.book_append_sheet(wb, ws2, 'Punkter');
    const safe=(t.date||'resa').replace(/[^0-9A-Za-z_-]/g,'-');
    XLSX.writeFile(wb, `resa_${safe}.xlsx`);
    statusEl.textContent='Excel klar';
  }

  exportExcelBtn.addEventListener('click', ()=> exportCurrentTrip());

  // ====== Export av period ======
  exportRangeBtn.addEventListener('click', async ()=>{
    try{
      statusEl.textContent='Läser resor…';
      const all=await listTrips();
      const from=($('fromDate').value||'0000-01-01');
      const to=($('toDate').value||'9999-12-31');
      const sel=all.filter(t=> (t.date||'')>=from && (t.date||'')<=to ).sort((a,b)=> (a.date||'').localeCompare(b.date||''));
      if(!sel.length){ alert('Inga resor i valt intervall.'); statusEl.textContent='Inga resor i intervall'; return; }

      const wb=XLSX.utils.book_new();
      const header=['Datum','Starttid','Stopptid','Total km','Start Ort','Stopp Ort'];
      const rows=[header];
      for(const t of sel){
        const startP=t.points && t.points[0];
        const stopP = t.points && t.points[t.points.length-1];
        const startOrt=await geocodeOrt(startP);
        const stopOrt =await geocodeOrt(stopP);
        rows.push([t.date, t.startTime||'', t.stopTime||'', Number(t.totalKm||0), startOrt, stopOrt]);
        await new Promise(r=>setTimeout(r,60));
      }
      const ws=XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Resor');
      const safeFrom=from.replace(/[^0-9A-Za-z_-]/g,'-');
      const safeTo=to.replace(/[^0-9A-Za-z_-]/g,'-');
      XLSX.writeFile(wb, `resor_${safeFrom}_till_${safeTo}.xlsx`);
      statusEl.textContent='Excel klar';
    }catch(e){
      console.error(e); alert('Kunde inte skapa Excel för perioden.'); statusEl.textContent='Fel vid export';
    }
  });

})();
