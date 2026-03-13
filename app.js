
let map, marker, polyline, watchId=null, pts=[], km=0, start=null, stop=null;
const $=id=>document.getElementById(id);
function init(){ map=L.map('map').setView([58.5,16.1],13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
polyline=L.polyline([], {color:'#1976d2',weight:5}).addTo(map); }
init();
function dist(a,b){const R=6371;const dLat=(b.lat-a.lat)*Math.PI/180;const dLon=(b.lon-a.lon)*Math.PI/180;const la1=a.lat*Math.PI/180;const la2=b.lat*Math.PI/180;const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
$('startBtn').onclick=()=>{
 pts=[]; km=0; start=new Date(); stop=null; $('pts').textContent='0';
 $('status').textContent='Startar GPS…';
 if(navigator.geolocation){
   watchId=navigator.geolocation.watchPosition(p=>{
     const o={lat:p.coords.latitude,lon:p.coords.longitude,ts:Date.now()};
     if(pts.length){ km+=dist(pts[pts.length-1],o); }
     pts.push(o); $('pts').textContent=pts.length;
     polyline.addLatLng([o.lat,o.lon]);
     if(!marker) marker=L.marker([o.lat,o.lon]).addTo(map);
     marker.setLatLng([o.lat,o.lon]);
     map.setView([o.lat,o.lon], 15);
     $('status').textContent='GPS klar';
   }, err=>{ $('status').textContent='Fel: '+err.message; }, {enableHighAccuracy:true, maximumAge:0, timeout:30000});
 }
 $('startBtn').disabled=true; $('stopBtn').disabled=false; $('exportBtn').disabled=true;
};
$('stopBtn').onclick=()=>{
 if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; }
 stop=new Date(); $('status').textContent='Klar';
 $('startBtn').disabled=false; $('stopBtn').disabled=true; $('exportBtn').disabled=false;
};
$('exportBtn').onclick=()=>{
 const rows=[['Datum','Starttid','Stopptid','Total km']];
 rows.push([start.toISOString().slice(0,10), start.toISOString(), stop.toISOString(), km.toFixed(2)]);
 const wb=XLSX.utils.book_new();
 const ws=XLSX.utils.aoa_to_sheet(rows);
 XLSX.utils.book_append_sheet(wb,ws,'Resa');
 XLSX.writeFile(wb,'resa.xlsx');
};
