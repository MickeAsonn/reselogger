
// Kill any old service workers
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
    // Gör export Excel klickbar även om det bara blev 0 punkter, enligt önskemål
    exportExcelBtn.disabled=false;
  };

  function buildTrip(){ return { date:(startTime||new Date()).toISOString().slice(0,10), startTime:startTime?startTime.toISOString():null, stopTime:stopTime?stopTime.toISOString():null, totalKm:Number(totalKm.toFixed(3)), points:points.slice() }; }

  function rowsFromTrip(t){ const r=[["Datum",t.date],["Starttid",t.startTime||''],["Stopptid",t.stopTime||''],["Total km",t.totalKm],[],["Tid (ISO)","Lat","Lon"]]; for(const p of t.points) r.push([new Date(p.ts).toISOString(),p.lat,p.lon]); return r; }

  function exportExcel(t){
    try{
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.aoa_to_sheet(rowsFromTrip(t));
      XLSX.utils.book_append_sheet(wb,ws,'Resa');
      const safe=(t.date||'resa').replace(/[^0-9A-Za-z_-]/g,'-');
      XLSX.writeFile(wb,`resa_${safe}.xlsx`);
    }catch(e){
      alert('Kunde inte skapa Excel. Prova i Safari eller Chrome.');
      console.error(e);
    }
  }

  // Gör knappen klickbar i alla lägen efter Stoppa
  exportExcelBtn.addEventListener('click', ()=> exportExcel(buildTrip()));

})();
