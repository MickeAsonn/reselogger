
// Remove any old service workers
if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister())).catch(()=>{});}

(function(){
  let map, marker, polyline; let watchId=null; let points=[]; let totalKm=0; let startTime=null, stopTime=null;
  const $=id=>document.getElementById(id);
  const statusEl=$('status'), kmEl=$('km');
  const exportExcelBtn=$('exportExcelBtn');

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
    $('startBtn').disabled=true; $('stopBtn').disabled=false;
    exportExcelBtn.disabled=true;
  };

  function onPos(pos){
    const {latitude,longitude}=pos.coords; const p={lat:latitude,lon:longitude,ts:Date.now()};
    if(points.length){ const km=dist(points[points.length-1],p); if(km<2){ totalKm+=km; updateKm(); } }
    else { map.setView([p.lat,p.lon],15); }
    points.push(p); polyline.addLatLng([p.lat,p.lon]);
    if(!marker) marker=L.marker([p.lat,p.lon]).addTo(map); marker.setLatLng([p.lat,p.lon]);
  }
  function onErr(err){ statusEl.textContent='Geo-fel: '+err.message; }

  $('stopBtn').onclick=()=>{
    if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; }
    stopTime=new Date(); statusEl.textContent='Status: Klar';
    $('startBtn').disabled=false; $('stopBtn').disabled=true;
    exportExcelBtn.disabled=false; // alltid aktiv efter stop
  };

  function buildTrip(){ return { date:(startTime||new Date()).toISOString().slice(0,10), startTime:startTime?startTime.toISOString():null, stopTime:stopTime?stopTime.toISOString():null, totalKm:Number(totalKm.toFixed(3)), points:points.slice() }; }

  // ---- Reverse geocoding to get Ort (locality) instead of lat/lon ----
  const geocache=new Map();
  function key(p){return (Math.round(p.lat*1000)/1000)+','+(Math.round(p.lon*1000)/1000);} // cache by ~100m

  async function geocodeOrt(p){
    const k=key(p); if(geocache.has(k)) return geocache.get(k);
    const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lon}&zoom=10&addressdetails=1`;
    try{
      const resp=await fetch(url,{headers:{'Accept':'application/json'}});
      const data=await resp.json();
      const addr=data.address||{};
      const ort=addr.town||addr.city||addr.village||addr.hamlet||addr.municipality||addr.county||addr.state||'Okänd ort';
      geocache.set(k,ort);
      return ort;
    }catch(e){ console.warn('Geocoder fel',e); return 'Okänd ort'; }
  }

  async function rowsWithOrter(t){
    const rows=[["Datum",t.date],["Starttid",t.startTime||''],["Stopptid",t.stopTime||''],["Total km",t.totalKm],[],["Tid (ISO)","Ort"]];
    if(!t.points.length) return rows;
    // Begränsa antalet reverse geocoding anrop (max 25)
    const max=25; const step=Math.max(1, Math.floor(t.points.length/max));
    for(let i=0;i<t.points.length;i+=step){
      const p=t.points[i]; const ort=await geocodeOrt(p);
      rows.push([new Date(p.ts).toISOString(), ort]);
      // liten paus för att vara snäll mot API (50ms)
      await new Promise(r=>setTimeout(r,50));
    }
    return rows;
  }

  async function exportExcelOrter(t){
    try{
      statusEl.textContent='Skapar Excel (hämtar ortnamn)…';
      const rows=await rowsWithOrter(t);
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb,ws,'Resa');
      const safe=(t.date||'resa').replace(/[^0-9A-Za-z_-]/g,'-');
      XLSX.writeFile(wb,`resa_${safe}.xlsx`);
      statusEl.textContent='Excel klar';
    }catch(e){
      statusEl.textContent='Kunde inte skapa Excel';
      alert('Kunde inte skapa Excel. Prova i Safari eller Chrome.');
      console.error(e);
    }
  }

  exportExcelBtn.addEventListener('click', ()=> exportExcelOrter(buildTrip()));

})();
