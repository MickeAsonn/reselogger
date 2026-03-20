
const e = React.createElement;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function nextMonthKey(ym){ if(!ym) return ''; const [y,m]=ym.split('-').map(n=>parseInt(n,10)); const d=new Date(y,m-1,1); d.setMonth(d.getMonth()+1); const ny=d.getFullYear(), nm=(d.getMonth()+1+'').padStart(2,'0'); return ny+'-'+nm; }
function km(n){ const v=Number(n); return isFinite(v)?v:0; }
function calcTripKm(entry){ return Math.max(0, km(entry.toKm)-km(entry.fromKm)); }
function sortByStartDateTimeAsc(a,b){ const A=(a.startDate||'')+(a.startTime||''); const B=(b.startDate||'')+(b.startTime||''); return A.localeCompare(B); }

function buildMonthRowsSorted(month,tankningar,tvattar){
  const selectedTank=tankningar.filter(t=>t.datum && t.datum.startsWith(month));
  const selectedTvatt=tvattar.filter(t=>t.datum && t.datum.startsWith(month));
  const rows=[
    ...selectedTank.map(t=>({Typ:'Tankning',Datum:t.datum||'',Tid:t.tid||'',Plats:t.plats||'',Liter:t.liter||'','Mätarställning':t.matning||'','Tvätt':''})),
    ...selectedTvatt.map(v=>({Typ:'Tvätt',Datum:v.datum||'',Tid:v.tid||'',Plats:'',Liter:'','Mätarställning':'','Tvätt':'Ja'}))
  ];
  rows.sort((ra,rb)=> (ra.Datum+(ra.Tid||'')).localeCompare(rb.Datum+(rb.Tid||'')) );
  return rows;
}

function exportRowsToWorkbook(filename, rows, sheetName='Export'){
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function exportMonthToExcel(month,tankningar,tvattar){ if(!month){alert('Välj månad först');return;} const rows=buildMonthRowsSorted(month,tankningar,tvattar); exportRowsToWorkbook('export_'+month+'.xlsx', rows, 'Export'); }
async function mailMonthExcel(month,tankningar,tvattar){ if(!month){alert('Välj månad först');return;} const rows=buildMonthRowsSorted(month,tankningar,tvattar); const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Export'); const u8=XLSX.write(wb,{bookType:'xlsx',type:'array'}); const blob=new Blob([u8],{type:MIME_XLSX}); const file=new File([blob],'export_'+month+'.xlsx',{type:MIME_XLSX}); if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){ try{ await navigator.share({title:'Körjournal',text:'Export '+month,files:[file]}); return; }catch(e){} } XLSX.writeFile(wb,'export_'+month+'.xlsx'); alert('Kopian sparades lokalt.'); }

function buildJournalSummaryForMonth(month, journal, monthMeta){
  const trips = journal.filter(j=>j.startDate && j.startDate.startsWith(month)).sort(sortByStartDateTimeAsc);
  const tjansteMil = trips.reduce((s,j)=> s + calcTripKm(j), 0);
  const meta = monthMeta[month] || {}; const kmIn = meta.kmIn; const kmOut = meta.kmOut;
  const totalOdo = (kmOut!=null && kmIn!=null) ? Math.max(0, km(kmOut)-km(kmIn)) : null;
  const privataMil = (totalOdo!=null) ? Math.max(0, totalOdo - tjansteMil) : null;
  return { trips, tjansteMil, kmIn, kmOut, totalOdo, privataMil };
}

function buildJournalExportRows(month, journal, monthMeta){
  const { trips, tjansteMil, kmIn, kmOut, totalOdo, privataMil } = buildJournalSummaryForMonth(month, journal, monthMeta);
  const rows = trips.map(t=>({'Startdatum': t.startDate||'', 'Starttid': t.startTime||'', 'Slutdatum': t.endDate||'', 'Sluttid': t.endTime||'', 'Från km': t.fromKm||'', 'Till km': t.toKm||'', 'Körda km': calcTripKm(t), 'Ärende/Kund': t.arende||''}));
  // Always append a spacer + summary lines even if numbers are null
  rows.push({});
  rows.push({'Sammanfattning':'Km in',Värde: (kmIn!=null&&kmIn!=='')? kmIn : ''});
  rows.push({'Sammanfattning':'Km ut',Värde: (kmOut!=null&&kmOut!=='')? kmOut : ''});
  rows.push({'Sammanfattning':'Tjänstemil',Värde: tjansteMil});
  rows.push({'Sammanfattning':'Totalt (km ut - km in)',Värde: (totalOdo!=null)? totalOdo : ''});
  rows.push({'Sammanfattning':'Privata mil',Värde: (privataMil!=null)? privataMil : ''});
  return rows;
}

function exportJournalMonthExcel(month, journal, monthMeta){ if(!month){ alert('Välj månad för journalen'); return; } const rows = buildJournalExportRows(month, journal, monthMeta); exportRowsToWorkbook('korjournal_'+month+'.xlsx', rows, 'Körjournal '+month); }
async function mailJournalMonthExcel(month, journal, monthMeta){ if(!month){ alert('Välj månad för journalen'); return; } const rows = buildJournalExportRows(month, journal, monthMeta); const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Körjournal '+month); const u8=XLSX.write(wb,{bookType:'xlsx',type:'array'}); const blob=new Blob([u8],{type:MIME_XLSX}); const file=new File([blob],'korjournal_'+month+'.xlsx',{type:MIME_XLSX}); if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){ try{ await navigator.share({title:'Körjournal',text:'Körjournal '+month,files:[file]}); return; }catch(e){} } XLSX.writeFile(wb,'korjournal_'+month+'.xlsx'); alert('Journalen sparades lokalt.'); }

function Label(text){ return e('label',{style:{fontSize:'16px',fontWeight:'bold',marginTop:'12px',display:'block'}},text); }

function App(){
  const [tankningar,setTank]=React.useState(JSON.parse(localStorage.getItem('tankningar')||'[]'));
  const [tvattar,setTvatt]=React.useState(JSON.parse(localStorage.getItem('tvattar')||'[]'));
  const [tf,setTF]=React.useState({datum:'',tid:'',plats:'',liter:'',matning:''});
  const [vf,setVF]=React.useState({datum:'',tid:''});

  const [journal,setJournal]=React.useState(JSON.parse(localStorage.getItem('journal')||'[]'));
  const [monthMeta,setMonthMeta]=React.useState(JSON.parse(localStorage.getItem('monthMeta')||'{}'));

  const [summaryMonth,setSummaryMonth]=React.useState('');
  const [exportMonth,setExportMonth]=React.useState('');

  const [jForm,setJForm]=React.useState({startDate:'',startTime:'',endDate:'',endTime:'',fromKm:'',toKm:'',arende:''});
  const [kmInInput,setKmInInput]=React.useState('');
  const [kmOutInput,setKmOutInput]=React.useState('');

  React.useEffect(()=>localStorage.setItem('tankningar',JSON.stringify(tankningar)),[tankningar]);
  React.useEffect(()=>localStorage.setItem('tvattar',JSON.stringify(tvattar)),[tvattar]);
  React.useEffect(()=>localStorage.setItem('journal',JSON.stringify(journal)),[journal]);
  React.useEffect(()=>localStorage.setItem('monthMeta',JSON.stringify(monthMeta)),[monthMeta]);
  React.useEffect(()=>{ if('serviceWorker' in navigator){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('./service-worker.js').catch(console.warn); }); } },[]);

  function addT(){ if(!tf.datum||!tf.liter||!tf.matning) return; setTank([...tankningar,tf]); setTF({datum:'',tid:'',plats:'',liter:'',matning:''}); }
  function addV(){ if(!vf.datum) return; setTvatt([...tvattar,vf]); setVF({datum:'',tid:''}); }
  function addTrip(){ if(!jForm.startDate || jForm.fromKm==='' || jForm.toKm===''){ alert('Fyll startdatum, från km och till km'); return; } if(km(jForm.toKm) < km(jForm.fromKm)){ alert('Till km måste vara >= Från km'); return; } const entry={...jForm, fromKm: km(jForm.fromKm), toKm: km(jForm.toKm)}; setJournal([...journal, entry]); setJForm({startDate:'',startTime:'',endDate:'',endTime:'',fromKm:'',toKm:'',arende:''}); }

  function saveMonthOdo(){ if(!summaryMonth){ alert('Välj månad'); return; } const meta={...monthMeta}; const cur=meta[summaryMonth]||{}; const newKmIn=kmInInput!==''? km(kmInInput) : cur.kmIn; const newKmOut=kmOutInput!==''? km(kmOutInput) : cur.kmOut; meta[summaryMonth] = { kmIn:newKmIn, kmOut:newKmOut }; if(newKmOut!=null){ const nx=nextMonthKey(summaryMonth); if(nx){ const nxMeta=meta[nx]||{}; nxMeta.kmIn=newKmOut; meta[nx]=nxMeta; } } setMonthMeta(meta); setKmInInput(''); setKmOutInput(''); }

  return e('div',{style:{padding:'20px',maxWidth:'820px',margin:'auto'}},[
    e('h1',{style:{fontSize:'26px',marginBottom:'20px'}},'Körjournal'),

    e('h2',null,'Körjournal – summering'),
    Label('Välj månad (för summering & vy)'),
    e('select',{value:summaryMonth,onChange:e=>setSummaryMonth(e.target.value)},[
      e('option',{value:''},'Välj månad...'), ...['01','02','03','04','05','06','07','08','09','10','11','12'].map(m=>e('option',{value:'2026-'+m},'2026-'+m))
    ]),
    e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginTop:'10px'}},[
      e('div',null,[ Label('Km in (månadens start)'), e('input',{type:'number',value:kmInInput,onChange:e=>setKmInInput(e.target.value)}) ]),
      e('div',null,[ Label('Km ut (månadens slut)'), e('input',{type:'number',value:kmOutInput,onChange:e=>setKmOutInput(e.target.value)}) ])
    ]),
    e('button',{onClick:saveMonthOdo,style:{marginTop:'10px',padding:'12px',background:'#22c55e',borderRadius:'8px'}},'Spara månadens mätarställning (för över Km ut → nästa månads Km in)'),

    e('h3',{style:{marginTop:'16px'}},'Lägg till resa'),
    e('div',{style:{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px'}},[
      e('div',null,[ Label('Startdatum'), e('input',{type:'date',value:jForm.startDate,onChange:e=>setJForm({...jForm,startDate:e.target.value})}) ]),
      e('div',null,[ Label('Starttid'), e('input',{type:'time',value:jForm.startTime,onChange:e=>setJForm({...jForm,startTime:e.target.value})}) ])
    ]),
    e('div',{style:{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px'}},[
      e('div',null,[ Label('Slutdatum'), e('input',{type:'date',value:jForm.endDate,onChange:e=>setJForm({...jForm,endDate:e.target.value})}) ]),
      e('div',null,[ Label('Sluttid'), e('input',{type:'time',value:jForm.endTime,onChange:e=>setJForm({...jForm,endTime:e.target.value})}) ])
    ]),
    e('div',{style:{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px'}},[
      e('div',null,[ Label('Från km'), e('input',{type:'number',value:jForm.fromKm,onChange:e=>setJForm({...jForm,fromKm:e.target.value})}) ]),
      e('div',null,[ Label('Till km'), e('input',{type:'number',value:jForm.toKm,onChange:e=>setJForm({...jForm,toKm:e.target.value})}) ])
    ]),
    Label('Ärende/Kund'), e('input',{value:jForm.arende,onChange:e=>setJForm({...jForm,arende:e.target.value})}),
    e('button',{onClick:addTrip,style:{marginTop:'10px',padding:'12px',background:'#2563eb',borderRadius:'8px'}},'Spara resa'),

    e('h2',null,'Körjournal – exportera'),
    Label('Välj månad att exportera'),
    e('select',{value:exportMonth,onChange:e=>setExportMonth(e.target.value)},[
      e('option',{value:''},'Välj månad...'), ...['01','02','03','04','05','06','07','08','09','10','11','12'].map(m=>e('option',{value:'2026-'+m},'2026-'+m))
    ]),
    e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginTop:'10px'}},[
      e('button',{onClick:()=>exportJournalMonthExcel(exportMonth, journal, monthMeta),style:{padding:'12px',background:'#3b82f6',borderRadius:'8px'}},'Exportera körjournal (Excel)'),
      e('button',{onClick:()=>mailJournalMonthExcel(exportMonth, journal, monthMeta),style:{padding:'12px',background:'#0ea5e9',borderRadius:'8px'}},'Maila körjournal')
    ]),

    e('h2',null,'Tankning'),
    Label('Datum'), e('input',{type:'date',value:tf.datum,onChange:e=>setTF({...tf,datum:e.target.value})}),
    Label('Tid'), e('input',{type:'time',value:tf.tid,onChange:e=>setTF({...tf,tid:e.target.value})}),
    Label('Plats'), e('input',{value:tf.plats,onChange:e=>setTF({...tf,plats:e.target.value})}),
    Label('Antal liter'), e('input',{type:'number',value:tf.liter,onChange:e=>setTF({...tf,liter:e.target.value})}),
    Label('Mätarställning'), e('input',{type:'number',value:tf.matning,onChange:e=>setTF({...tf,matning:e.target.value})}),
    e('button',{onClick:addT,style:{marginTop:'10px',padding:'12px',background:'#2563eb',borderRadius:'8px'}},'Spara tankning'),

    e('h2',null,'Tvätt'),
    Label('Datum'), e('input',{type:'date',value:vf.datum,onChange:e=>setVF({...vf,datum:e.target.value})}),
    Label('Tid'), e('input',{type:'time',value:vf.tid,onChange:e=>setVF({...vf,tid:e.target.value})}),
    e('button',{onClick:addV,style:{marginTop:'10px',padding:'12px',background:'#16a34a',borderRadius:'8px'}},'Spara tvätt'),

    e('h2',null,'Tankning & Tvätt – exportera'),
    Label('Välj månad (för tankning/tvätt export)'),
    e('select',{value:exportMonth,onChange:e=>setExportMonth(e.target.value)},[
      e('option',{value:''},'Välj månad...'), ...['01','02','03','04','05','06','07','08','09','10','11','12'].map(m=>e('option',{value:'2026-'+m},'2026-'+m))
    ]),
    e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginTop:'10px'}},[
      e('button',{onClick:()=>exportMonthToExcel(exportMonth,tankningar,tvattar),style:{padding:'12px',background:'#3b82f6',borderRadius:'8px'}},'Exportera Excel (Tankning & Tvätt)'),
      e('button',{onClick:()=>mailMonthExcel(exportMonth,tankningar,tvattar),style:{padding:'12px',background:'#0ea5e9',borderRadius:'8px'}},'Maila kopia')
    ])
  ]);
}

ReactDOM.render(e(App), document.getElementById('root'));
