
// Reselogger – huvudlogik
// Funktioner: Leaflet-karta, GPS-tracking, historik (IndexedDB), Excel/PDF-export, mail via Netlify, save to FaunaDB

(function(){
  // --- State ---
  let map, tileLayer, marker, polyline;
  let watchId = null;
  let points = []; // {lat, lon, ts}
  let totalKm = 0;
  let startTime = null, stopTime = null;

  // --- UI refs ---
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const historyBtn = document.getElementById('historyBtn');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const mailBtn = document.getElementById('mailBtn');
  const emailTo = document.getElementById('emailTo');
  const statusEl = document.getElementById('status');
  const kmEl = document.getElementById('km');
  const historyModal = document.getElementById('historyModal');
  const closeHistory = document.getElementById('closeHistory');
  const historyList = document.getElementById('historyList');

  // --- Init map ---
  initMap();

  function initMap(){
    map = L.map('map');
    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    });
    tileLayer.addTo(map);
    map.setView([58.5877, 16.1924], 12); // Norrköping approx
    polyline = L.polyline([], { color: '#1976d2', weight: 5 }).addTo(map);
  }

  // --- Haversine ---
  function distanceKm(a, b){
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const lat1 = a.lat * Math.PI/180, lat2 = b.lat * Math.PI/180;
    const sinDLat = Math.sin(dLat/2), sinDLon = Math.sin(dLon/2);
    const h = sinDLat*sinDLat + Math.cos(lat1)*Math.cos(lat2)*sinDLon*sinDLon;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
  }

  function updateKmUI(){
    kmEl.textContent = `Totalt: ${totalKm.toFixed(2)} km`;
  }

  // --- Geolocation tracking ---
  function startTracking(){
    if (!('geolocation' in navigator)){
      alert('Geolocation stöds inte i denna webbläsare.');
      return;
    }
    points = [];
    totalKm = 0;
    startTime = new Date();
    stopTime = null;
    updateKmUI();
    statusEl.textContent = 'Status: Registrerar…';

    if (polyline){ polyline.setLatLngs([]); }
    if (marker){ map.removeLayer(marker); marker = null; }

    watchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000
    });

    startBtn.disabled = true;
    stopBtn.disabled = false;
    exportExcelBtn.disabled = true;
    exportPdfBtn.disabled = true;
    mailBtn.disabled = true;
  }

  function onPos(pos){
    const { latitude, longitude } = pos.coords;
    const ts = Date.now();
    const p = { lat: latitude, lon: longitude, ts };

    if (points.length){
      const prev = points[points.length - 1];
      const km = distanceKm(prev, p);
      // Enkla filter för brus (undvik hopp > 2 km mellan punkter inom 30 sek)
      if (km < 2){
        totalKm += km;
        updateKmUI();
      } else {
        // Ignorera troligt brus
      }
    } else {
      // center map on first point
      map.setView([p.lat, p.lon], 15);
    }

    points.push(p);

    polyline.addLatLng([p.lat, p.lon]);
    if (!marker){
      marker = L.marker([p.lat, p.lon]).addTo(map);
    } else {
      marker.setLatLng([p.lat, p.lon]);
    }
  }

  function onErr(err){
    console.error('Geo error', err);
    statusEl.textContent = `Geo-fel: ${err.message}`;
  }

  function stopTracking(){
    if (watchId !== null){
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    stopTime = new Date();
    statusEl.textContent = 'Status: Klar';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    exportExcelBtn.disabled = points.length === 0;
    exportPdfBtn.disabled = points.length === 0;
    mailBtn.disabled = points.length === 0;

    // Save locally & backend
    const trip = buildTripObject();
    saveTripLocal(trip).catch(console.error);
    saveTripBackend(trip).catch(console.warn);
  }

  function buildTripObject(){
    return {
      id: startTime ? startTime.toISOString() : String(Date.now()),
      date: startTime ? startTime.toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
      startTime: startTime ? startTime.toISOString() : null,
      stopTime: stopTime ? stopTime.toISOString() : null,
      totalKm: Number(totalKm.toFixed(3)),
      points: points.slice(),
    };
  }

  // --- IndexedDB (vanilla) ---
  const DB_NAME = 'reselogger';
  const STORE = 'trips';

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveTripLocal(trip){
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(trip);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function listTripsLocal(){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a,b)=> (b.startTime||'').localeCompare(a.startTime||'')));
      req.onerror = () => reject(req.error);
    });
  }

  // --- Backend save (Fauna via Netlify function) ---
  async function saveTripBackend(trip){
    const res = await fetch('/.netlify/functions/saveTrip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trip)
    });
    // no throw if 500 – just log
    try { const j = await res.json(); console.log('saveTrip backend:', j); } catch(e) {}
  }

  // --- Export helpers ---
  function buildRowsFromTrip(trip){
    const rows = [
      ['Datum', trip.date],
      ['Starttid', trip.startTime || ''],
      ['Stopptid', trip.stopTime || ''],
      ['Total km', trip.totalKm],
      [],
      ['Tid (ISO)', 'Lat', 'Lon']
    ];
    for (const p of trip.points){
      rows.push([new Date(p.ts).toISOString(), p.lat, p.lon]);
    }
    return rows;
  }

  function exportTripToExcel(trip, filename = undefined){
    const rows = buildRowsFromTrip(trip);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Resa');
    const safeDate = (trip.date || 'resa').replace(/[^0-9A-Za-z_-]/g, '-');
    const fname = filename || `resa_${safeDate}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  async function exportTripToExcelBase64(trip){
    const rows = buildRowsFromTrip(trip);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Resa');
    // Return base64
    const out = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    return out;
  }

  async function exportTripToPDF(trip){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    let y = margin;

    doc.setFontSize(16);
    doc.text('Reselogger – Rapport', margin, y);
    y += 24;

    doc.setFontSize(12);
    const lines = [
      `Datum: ${trip.date}`,
      `Starttid: ${trip.startTime || ''}`,
      `Stopptid: ${trip.stopTime || ''}`,
      `Total sträcka: ${trip.totalKm.toFixed(2)} km`
    ];
    for (const line of lines){
      doc.text(line, margin, y);
      y += 18;
    }
    y += 8;

    // Tabellhuvud
    doc.setFont(undefined, 'bold');
    doc.text('Tid (ISO)', margin, y);
    doc.text('Lat', margin + 240, y);
    doc.text('Lon', margin + 340, y);
    doc.setFont(undefined, 'normal');
    y += 16;

    // Rendera max 40 punkter (eller samplade) för PDF
    const step = Math.max(1, Math.floor(trip.points.length / 40));
    for (let i = 0; i < trip.points.length; i += step){
      const p = trip.points[i];
      const row = [new Date(p.ts).toISOString(), p.lat.toFixed(6), p.lon.toFixed(6)];
      doc.text(String(row[0]), margin, y);
      doc.text(String(row[1]), margin + 240, y);
      doc.text(String(row[2]), margin + 340, y);
      y += 16;
      if (y > 800){ doc.addPage(); y = margin; }
    }

    const safeDate = (trip.date || 'resa').replace(/[^0-9A-Za-z_-]/g, '-');
    doc.save(`resa_${safeDate}.pdf`);
  }

  async function mailTripExcel(trip){
    const to = (emailTo.value || '').trim();
    if (!to){
      alert('Fyll i e‑postadress först.');
      emailTo.focus();
      return;
    }
    const base64 = await exportTripToExcelBase64(trip);
    const safeDate = (trip.date || 'resa').replace(/[^0-9A-Za-z_-]/g, '-');
    const res = await fetch('/.netlify/functions/sendMail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject: `Reselogger – ${safeDate}`,
        text: `Rapport för ${safeDate}. Total ${trip.totalKm.toFixed(2)} km.`,
        filename: `resa_${safeDate}.xlsx`,
        attachmentBase64: base64
      })
    });
    if (res.ok){
      alert('Mail skickat!');
    } else {
      const t = await res.text();
      alert('Kunde inte skicka mail: ' + t);
    }
  }

  // --- Historik UI ---
  async function openHistory(){
    historyList.innerHTML = '<p class="small">Laddar…</p>';
    historyModal.classList.remove('hidden');
    const trips = await listTripsLocal();
    if (!trips.length){
      historyList.innerHTML = '<p>Ingen historik sparad ännu.</p>';
      return;
    }
    historyList.innerHTML = '';
    for (const t of trips){
      const div = document.createElement('div');
      div.className = 'history-item';
      const left = document.createElement('div');
      left.innerHTML = `<strong>${t.date}</strong><div class="small">${t.startTime || ''} – ${t.stopTime || ''}</div><div>${(t.totalKm||0).toFixed(2)} km, punkter: ${t.points.length}</div>`;
      const actions = document.createElement('div');
      actions.className = 'history-actions';
      const showBtn = document.createElement('button'); showBtn.textContent = 'Visa';
      const xlsxBtn = document.createElement('button'); xlsxBtn.textContent = 'Excel';
      const pdfBtn = document.createElement('button'); pdfBtn.textContent = 'PDF';
      const mailBtn2 = document.createElement('button'); mailBtn2.textContent = 'Maila';

      showBtn.onclick = () => {
        // Rita på kartan
        polyline.setLatLngs(t.points.map(p=>[p.lat,p.lon]));
        if (t.points.length){
          map.fitBounds(polyline.getBounds(), { padding: [20,20] });
          if (!marker){ marker = L.marker([t.points[0].lat, t.points[0].lon]).addTo(map); }
          marker.setLatLng([t.points[t.points.length-1].lat, t.points[t.points.length-1].lon]);
        }
        totalKm = t.totalKm || 0; updateKmUI();
      };
      xlsxBtn.onclick = () => exportTripToExcel(t);
      pdfBtn.onclick = () => exportTripToPDF(t);
      mailBtn2.onclick = () => mailTripExcel(t);

      actions.append(showBtn, xlsxBtn, pdfBtn, mailBtn2);
      div.append(left, actions);
      historyList.appendChild(div);
    }
  }

  // --- Event wiring ---
  startBtn.addEventListener('click', startTracking);
  stopBtn.addEventListener('click', stopTracking);
  historyBtn.addEventListener('click', openHistory);
  closeHistory.addEventListener('click', ()=> historyModal.classList.add('hidden'));

  exportExcelBtn.addEventListener('click', () => exportTripToExcel(buildTripObject()));
  exportPdfBtn.addEventListener('click', () => exportTripToPDF(buildTripObject()));
  mailBtn.addEventListener('click', () => mailTripExcel(buildTripObject()));

})();
