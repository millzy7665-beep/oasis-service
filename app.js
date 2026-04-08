'use strict';

/* ── Version / localStorage reset ─────────────────────────────── */
const APP_VERSION = 'v5-oasis-2026';
(function() {
  if (localStorage.getItem('psp_version') !== APP_VERSION) {
    ['psp_customers','psp_technicians','psp_routes','psp_workOrders','psp_session'].forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem('psp_session');
    localStorage.setItem('psp_version', APP_VERSION);
  }
})();

/* ── AUTH ──────────────────────────────────────────────────────── */
const Auth = {
  current: null,
  load() {
    try { this.current = JSON.parse(sessionStorage.getItem('psp_session')) || null; } catch { this.current = null; }
  },
  signIn(techId) {
    const t = DB.getTechnician(techId);
    if (!t) return false;
    this.current = { techId, name: t.name, isAdmin: !!t.isAdmin };
    sessionStorage.setItem('psp_session', JSON.stringify(this.current));
    return true;
  },
  signOut() { this.current = null; sessionStorage.removeItem('psp_session'); },
  get isAdmin() { return !!(this.current && this.current.isAdmin); },
  get techId()  { return this.current ? this.current.techId : null; },
};

/* ── DATABASE ──────────────────────────────────────────────────── */
const DB = {
  _key: k => `psp_${k}`,
  load() {
    this.customers   = this._get('customers');
    this.technicians = this._get('technicians');
    this.routes      = this._get('routes');
    this.workOrders  = this._get('workOrders');
  },
  _get(col) { try { return JSON.parse(localStorage.getItem(this._key(col))) || []; } catch { return []; } },
  save(col) { localStorage.setItem(this._key(col), JSON.stringify(this[col])); },
  uid()     { return Date.now().toString(36) + Math.random().toString(36).slice(2); },
  addCustomer(d)       { const r={id:this.uid(),...d}; this.customers.push(r); this.save('customers'); return r; },
  updateCustomer(id,d) { const i=this.customers.findIndex(c=>c.id===id); if(i>-1){this.customers[i]={...this.customers[i],...d};this.save('customers');} },
  deleteCustomer(id)   { this.customers=this.customers.filter(c=>c.id!==id); this.save('customers'); },
  getCustomer(id)      { return this.customers.find(c=>c.id===id); },
  addTechnician(d)       { const r={id:this.uid(),...d}; this.technicians.push(r); this.save('technicians'); return r; },
  updateTechnician(id,d) { const i=this.technicians.findIndex(t=>t.id===id); if(i>-1){this.technicians[i]={...this.technicians[i],...d};this.save('technicians');} },
  deleteTechnician(id)   { this.technicians=this.technicians.filter(t=>t.id!==id); this.save('technicians'); },
  getTechnician(id)      { return this.technicians.find(t=>t.id===id); },
  addRoute(d)       { const r={id:this.uid(),...d}; this.routes.push(r); this.save('routes'); return r; },
  updateRoute(id,d) { const i=this.routes.findIndex(r=>r.id===id); if(i>-1){this.routes[i]={...this.routes[i],...d};this.save('routes');} },
  deleteRoute(id)   { this.routes=this.routes.filter(r=>r.id!==id); this.save('routes'); },
  getRoute(id)      { return this.routes.find(r=>r.id===id); },
  addWorkOrder(d)       { const r={id:this.uid(),...d}; this.workOrders.push(r); this.save('workOrders'); return r; },
  updateWorkOrder(id,d) { const i=this.workOrders.findIndex(w=>w.id===id); if(i>-1){this.workOrders[i]={...this.workOrders[i],...d};this.save('workOrders');} },
  deleteWorkOrder(id)   { this.workOrders=this.workOrders.filter(w=>w.id!==id); this.save('workOrders'); },
  getWorkOrder(id)      { return this.workOrders.find(w=>w.id===id); },
};

/* ── SEED DATA ─────────────────────────────────────────────────── */
function seedDemoData() {
  if (DB.technicians.length > 0) return;
  DB.technicians = [
    { id:'t1', name:'Ace',       pin:'1111', isAdmin:false, specialty:'Cleaning & Chemicals', phone:'', email:'' },
    { id:'t2', name:'Ariel',     pin:'1111', isAdmin:false, specialty:'Cleaning & Chemicals', phone:'', email:'' },
    { id:'t3', name:'Donald',    pin:'1111', isAdmin:false, specialty:'Cleaning & Chemicals', phone:'', email:'' },
    { id:'t4', name:'Elvin',     pin:'1111', isAdmin:false, specialty:'Cleaning & Chemicals', phone:'', email:'' },
    { id:'t5', name:'Jermaine',  pin:'1111', isAdmin:false, specialty:'Cleaning & Chemicals', phone:'', email:'' },
    { id:'t6', name:'Kadeem',    pin:'1111', isAdmin:false, specialty:'Cleaning & Chemicals', phone:'', email:'' },
    { id:'t7', name:'Kingsley',  pin:'1111', isAdmin:false, specialty:'Cleaning & Chemicals', phone:'', email:'' },
    { id:'t8', name:'Malik',     pin:'1111', isAdmin:false, specialty:'Cleaning & Chemicals', phone:'', email:'' },
    { id:'admin', name:'Chris Mills (Admin)', pin:'0000', isAdmin:true, specialty:'Management', phone:'(345) 945-7665', email:'chris@oasis.ky' },
  ];
  DB.save('technicians');

  DB.customers = [
    { id:'c01', name:'Harbour Heights Villa',  address:'14 Harbour Drive, Grand Cayman',     poolSize:'18000', poolType:'Inground Gunite',    notes:'Remote gate — code #4477' },
    { id:'c02', name:'Seven Mile Residences',  address:'7 Mile Beach Road, Grand Cayman',    poolSize:'22000', poolType:'Inground Fiberglass', notes:'Concierge will let you in' },
    { id:'c03', name:'The Ritz Cayman',        address:'West Bay Road, Grand Cayman',         poolSize:'45000', poolType:'Commercial Gunite',   notes:'Check in at front desk' },
    { id:'c04', name:'Camana Bay Penthouse',   address:'18 Forum Lane, Camana Bay',           poolSize:'12000', poolType:'Inground Vinyl',      notes:'Roof terrace pool. Use service lift.' },
    { id:'c05', name:'Rum Point Estate',       address:'23 Rum Point Drive, North Side',      poolSize:'16000', poolType:'Inground Gunite',    notes:'Gated. Code: 8822. Large dog onsite.' },
    { id:'c06', name:'East End Retreat',       address:'45 Breakers Road, East End',          poolSize:'10000', poolType:'Above Ground',        notes:'Call 20 min before arrival' },
    { id:'c07', name:'Kaibo Beach House',      address:'8 Kaibo Yacht Club Road, North Side', poolSize:'14000', poolType:'Inground Fiberglass', notes:'Access via beach path on south side' },
    { id:'c08', name:'Old Homestead Resort',   address:'12 West Bay Beach Drive',             poolSize:'30000', poolType:'Commercial Gunite',   notes:'Resort pool + 2 spas' },
    { id:'c09', name:'Breezy Pines Villa',     address:'55 Pine Tree Road, Bodden Town',      poolSize:'11000', poolType:'Inground Gunite',    notes:'Seasonal — owners Dec-Apr only' },
    { id:'c10', name:'Coral Stone Cottage',    address:'3 Coral Way, West Bay',               poolSize:'9000',  poolType:'Inground Vinyl',      notes:'Small pool + hot tub spa' },
    { id:'c11', name:'Sunset Palms Estate',    address:'29 Sunset Drive, South Sound',        poolSize:'20000', poolType:'Inground Gunite',    notes:'Check in at security booth' },
    { id:'c12', name:'Cayman Kai Retreat',     address:'7 Cayman Kai Road, North Side',       poolSize:'13000', poolType:'Inground Fiberglass', notes:'Open gate — park on gravel' },
  ];
  DB.save('customers');

  const D={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const stops=[
    {tech:'t1',cust:'c01',day:D.Mon,stop:1,type:'Weekly Clean',route:'1'},
    {tech:'t1',cust:'c02',day:D.Mon,stop:2,type:'Weekly Clean',route:'1'},
    {tech:'t1',cust:'c03',day:D.Mon,stop:3,type:'Chemical Treatment',route:'1'},
    {tech:'t1',cust:'c04',day:D.Mon,stop:4,type:'Weekly Clean',route:'1'},
    {tech:'t1',cust:'c01',day:D.Thu,stop:1,type:'Chemical Check',route:'1'},
    {tech:'t1',cust:'c05',day:D.Tue,stop:1,type:'Weekly Clean',route:'1'},
    {tech:'t2',cust:'c07',day:D.Tue,stop:1,type:'Weekly Clean',route:'2'},
    {tech:'t2',cust:'c08',day:D.Tue,stop:2,type:'Weekly Clean',route:'2'},
    {tech:'t2',cust:'c09',day:D.Wed,stop:1,type:'Chemical Treatment',route:'2'},
    {tech:'t2',cust:'c10',day:D.Wed,stop:2,type:'Weekly Clean',route:'2'},
    {tech:'t3',cust:'c11',day:D.Mon,stop:1,type:'Weekly Clean',route:'3'},
    {tech:'t3',cust:'c12',day:D.Mon,stop:2,type:'Weekly Clean',route:'3'},
    {tech:'t3',cust:'c06',day:D.Thu,stop:1,type:'Chemical Treatment',route:'3'},
  ];
  DB.routes = stops.map(s=>({id:DB.uid(),technicianId:s.tech,customerId:s.cust,dayOfWeek:s.day,stopOrder:s.stop,serviceType:s.type,routeNumber:s.route}));
  DB.save('routes');
}

/* ── MODAL / CONFIRM / TOAST ───────────────────────────────────── */
const Modal = {
  _cb: null,
  show(title, html, onSave) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
    this._cb = onSave;
  },
  hide() { document.getElementById('modal-overlay').classList.add('hidden'); this._cb = null; },
  save() { if (this._cb) this._cb(); }
};
const Confirm = {
  show(msg, onOk) {
    document.getElementById('confirm-message').textContent = msg;
    document.getElementById('confirm-overlay').classList.remove('hidden');
    document.getElementById('confirm-ok-btn').onclick = () => { Confirm.hide(); onOk(); };
  },
  hide() { document.getElementById('confirm-overlay').classList.add('hidden'); }
};
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), 2800);
}

/* ── HELPERS ───────────────────────────────────────────────────── */
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function initials(n) { return (n||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function fmtDate(d) { if(!d)return'—'; return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function fmtTime(t) { if(!t)return''; const[h,m]=t.split(':'),hr=parseInt(h); return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?'PM':'AM'}`; }
function todayStr()  { return new Date().toISOString().split('T')[0]; }
function todayDOW()  { return new Date().getDay(); }
const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function statusBadge(s) { const L={pending:'Pending','in-progress':'In Progress',completed:'Done',cancelled:'Cancelled'}; return `<span class="badge badge-${s}">${L[s]||s}</span>`; }
function customerOptions(sel='') { return DB.customers.map(c=>`<option value="${esc(c.id)}"${c.id===sel?' selected':''}>${esc(c.name)}</option>`).join(''); }
function techOptions(sel='')     { return DB.technicians.map(t=>`<option value="${esc(t.id)}"${t.id===sel?' selected':''}>${esc(t.name)}</option>`).join(''); }

/* ── ROUTE HELPERS ─────────────────────────────────────────────── */
function getStopWO(routeId, date)     { return DB.workOrders.find(w=>w.routeId===routeId&&w.date===date); }
function getTodaysStops(techId)       { const d=todayDOW(); return DB.routes.filter(r=>r.technicianId===techId&&r.dayOfWeek===d).sort((a,b)=>a.stopOrder-b.stopOrder); }
function getStopsByDay(techId, dow)   { return DB.routes.filter(r=>r.technicianId===techId&&r.dayOfWeek===dow).sort((a,b)=>a.stopOrder-b.stopOrder); }

/* ── LOGIN / SIGN-OUT ──────────────────────────────────────────── */
function populateLoginDropdown() {
  // Only overwrite the hardcoded HTML options if DB has technicians loaded
  const sel = document.getElementById('login-tech');
  if (!sel || DB.technicians.length === 0) return;
  sel.innerHTML = '<option value="">\u2014 Select your name \u2014</option>'
    + DB.technicians.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
}

function doLogin() {
  const techId = document.getElementById('login-tech').value;
  const err    = document.getElementById('login-error');
  if (!techId) {
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  // Always ensure DB is seeded before signing in
  seedDemoData();
  DB.load();
  Auth.signIn(techId);
  showAppShell();
}

function signOut() {
  Auth.signOut();
  woState = { view:'list' };
  Router.current = 'dashboard';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-tech').value = '';
  const err = document.getElementById('login-error');
  if (err) err.style.display = 'none';
}

function showAppShell() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = '';

  // Show/hide admin tab
  document.querySelectorAll('.admin-only').forEach(el =>
    el.style.display = Auth.isAdmin ? '' : 'none'
  );

  const tech = DB.getTechnician(Auth.techId);
  const routeNum = DB.routes.find(r=>r.technicianId===Auth.techId)?.routeNumber || '';
  const sub = document.querySelector('.header-sub');
  if (sub) sub.textContent = (tech ? tech.name : '') + (routeNum ? ' \u00b7 Route ' + routeNum : '');

  App.render();
}

/* ── PHOTOS ────────────────────────────────────────────────────── */
const PHOTO_KEYS = ['before','after','extra1','extra2','extra3','extra4','extra5'];
let WO_PHOTOS = {};
function resetPhotos(wo) { WO_PHOTOS={}; PHOTO_KEYS.forEach(k=>{WO_PHOTOS[k]=(wo&&wo.photos&&wo.photos[k])||null;}); }
function compressImage(file) {
  return new Promise(resolve=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const MAX=1200;let w=img.width,h=img.height;
        if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}
        const c=document.createElement('canvas');c.width=w;c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        resolve(c.toDataURL('image/jpeg',0.72));
      };img.src=e.target.result;
    };reader.readAsDataURL(file);
  });
}
function handlePhotoUpload(key,input) {
  const file=input.files[0];if(!file)return;
  compressImage(file).then(d=>{
    WO_PHOTOS[key]=d;
    const p=document.getElementById(`photo-preview-${key}`);
    if(p)p.innerHTML=`<img src="${d}" class="photo-thumb" onclick="viewPhoto('${key}')"><button class="photo-remove" onclick="removePhoto('${key}')">&times;</button>`;
  });
}
function removePhoto(key) {
  WO_PHOTOS[key]=null;
  const p=document.getElementById(`photo-preview-${key}`);if(p)p.innerHTML=photoPlaceholder(key);
  const i=document.getElementById(`photo-input-${key}`);if(i)i.value='';
}
function viewPhoto(key) {
  const src=WO_PHOTOS[key];if(!src)return;
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;';
  ov.onclick=()=>ov.remove();
  ov.innerHTML=`<img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
  document.body.appendChild(ov);
}
function photoPlaceholder(key){const l=key==='before'?'+ Before':key==='after'?'+ After':'+ Photo';return `<label class="photo-add-btn" for="photo-input-${key}">${l}</label>`;}
function photoSlot(key,label){const d=WO_PHOTOS[key];return`<div class="photo-slot"><div class="photo-slot-lbl">${label}</div><div class="photo-preview-box" id="photo-preview-${key}">${d?`<img src="${d}" class="photo-thumb" onclick="viewPhoto('${key}')"><button class="photo-remove" onclick="removePhoto('${key}')">&times;</button>`:photoPlaceholder(key)}</div><input type="file" accept="image/*" capture="environment" id="photo-input-${key}" class="photo-file-inp" onchange="handlePhotoUpload('${key}',this)"></div>`;}

/* ── SEND REPORT ───────────────────────────────────────────────── */
const REPORT_EMAIL='chris@oasis.ky';
function buildReportText(wo){
  const cust=DB.getCustomer(wo.customerId),tech=DB.getTechnician(wo.technicianId);
  const p=wo.pool||{},s=wo.spa||{};
  const r=(v,u='')=>v?`${v}${u}`:'—';
  const cA=(o,lbl)=>{const pts=[];if(o.tabs)pts.push(`Tabs:${o.tabs}ea`);if(o.hypo)pts.push(`Hypo:${o.hypo}lbs`);if(o.acid)pts.push(`Acid:${o.acid}gal`);if(o.sodaAsh)pts.push(`Soda Ash:${o.sodaAsh}lbs`);if(o.bicarb)pts.push(`Bicarb:${o.bicarb}lbs`);if(o.conditioner)pts.push(`Cond:${o.conditioner}lbs`);if(o.bromine)pts.push(`Bromine:${o.bromine}ea`);if(o.phosphateOz)pts.push(`Phos:${o.phosphateOz}oz`);if(o.saltBag)pts.push(`Salt:${o.saltBag}bag`);if(o.algaecide)pts.push(`Alg:${o.algaecide}oz`);if(o.clarifier)pts.push(`Clar:${o.clarifier}oz`);return pts.length?`${lbl}\n${pts.join(' | ')}`:`${lbl}\nNone`;};
  const photoCount=PHOTO_KEYS.filter(k=>(wo.photos||{})[k]).length;
  return['═══════════════════════════════','OASIS — SERVICE REPORT','═══════════════════════════════','',`Tech: ${tech?tech.name:'—'}   Route: ${wo.routeNumber||'—'}`,`Client: ${cust?cust.name:'—'}`,`Address: ${wo.address||'—'}`,`Date: ${fmtDate(wo.date)}   In: ${fmtTime(wo.timeIn)||'—'} → Out: ${fmtTime(wo.timeOut)||'—'}`,`Condition: ${wo.condition||'—'}   Pool: ${wo.gallons?parseInt(wo.gallons).toLocaleString()+' gal':'—'}`,'','─── CHEMICAL READINGS ──────────',`             POOL          SPA`,`Chlorine     ${r(p.chlorine,'ppm').padEnd(14)} ${r(s.chlorine,'ppm')}`,`pH           ${r(p.pH).padEnd(14)} ${r(s.pH)}`,`Alkalinity   ${r(p.alk,'ppm').padEnd(14)} ${r(s.alk,'ppm')}`,`CYA          ${r(p.cya,'ppm').padEnd(14)} ${r(s.cya,'ppm')}`,`Calcium      ${r(p.calcium,'ppm').padEnd(14)} ${r(s.calcium,'ppm')}`,`Salt         ${r(p.salt,'ppm').padEnd(14)} ${r(s.salt,'ppm')}`,`Phosphate    ${r(p.phosphate,'ppb').padEnd(14)} ${r(s.phosphate,'ppb')}`,`TDS          ${r(p.tds,'ppm').padEnd(14)} ${r(s.tds,'ppm')}`,'','─── CHEMICALS ADDED ────────────',cA(p,'POOL'),'',cA(s,'SPA'),'','─── SERVICE NOTES ──────────────',wo.notes||'None','',photoCount>0?`📸 ${photoCount} photo(s) attached.`:'','','═══════════════════════════════','Sent via OASIS Service App','═══════════════════════════════'].join('\n');
}
function sendReport(id) {
  const wo = DB.getWorkOrder(id); if (!wo) return;
  const cust  = DB.getCustomer(wo.customerId);
  const tech  = DB.getTechnician(wo.technicianId);
  const subject = encodeURIComponent(
    'OASIS Service Report \u2014 ' + (cust ? cust.name : 'Client') + ' \u2014 ' + fmtDate(wo.date)
  );
  const mailBody = encodeURIComponent(
    'Please find the OASIS Service Report attached as a PDF.\n\n'
    + 'Client     : ' + (cust ? cust.name : '\u2014') + '\n'
    + 'Date       : ' + fmtDate(wo.date) + '\n'
    + 'Technician : ' + (tech ? tech.name : '\u2014') + '\n'
    + 'Route      : ' + (wo.routeNumber || '\u2014') + '\n\n'
    + 'Save the PDF report from the window that opened, then attach it to this email.'
  );
  openPrintReport(wo);
  showToast('\ud83d\udcc4 Save as PDF \u2192 attach to email that opens');
  setTimeout(function() {
    window.location.href = 'mailto:' + REPORT_EMAIL + '?subject=' + subject + '&body=' + mailBody;
  }, 800);
}

function openPrintReport(wo) {
  const cust   = DB.getCustomer(wo.customerId);
  const tech   = DB.getTechnician(wo.technicianId);
  const p      = wo.pool || {}, s = wo.spa || {};
  const photos = wo.photos || {};
  const photoEntries = PHOTO_KEYS.filter(function(k){ return photos[k]; });

  /* Resolve logo as absolute file path so the popup can load it */
  const logoSrc = (function() {
    const a = document.createElement('a');
    a.href = 'oasis-logo.png';
    return a.href;
  })();

  function dot(param, val) {
    var v = parseFloat(val);
    var ranges = { chlorine:{ok:[1,3],warn:[0.5,5]}, pH:{ok:[7.2,7.6],warn:[7.0,7.8]}, alk:{ok:[80,120],warn:[60,180]}, cya:{ok:[30,50],warn:[20,80]}, calcium:{ok:[200,400],warn:[150,500]} };
    var r = ranges[param]; if (!r || isNaN(v)) return '';
    if (v >= r.ok[0] && v <= r.ok[1])    return '<span style="color:#2a7a4f">\u25cf</span>';
    if (v >= r.warn[0] && v <= r.warn[1]) return '<span style="color:#9a6f1e">\u25cf</span>';
    return '<span style="color:#b53030">\u25cf</span>';
  }

  function rv(v, u) { return v ? (v + (u||'')) : '\u2014'; }

  function chemRow(label, pv, pu, sv, param) {
    return '<tr>'
      + '<td class="rl">' + label + '</td>'
      + '<td class="rv">' + dot(param, pv) + '&nbsp;' + rv(pv, pu) + '</td>'
      + '<td class="rv">' + rv(sv, pu) + '</td>'
      + '</tr>';
  }

  function addedParts(o) {
    var rows = [];
    if (o.tabs)         rows.push(['Tabs', o.tabs + ' ea']);
    if (o.hypo)         rows.push(['Hypo-Chlorite', o.hypo + ' lbs']);
    if (o.acid)         rows.push(['Acid', o.acid + ' gal']);
    if (o.sodaAsh)      rows.push(['Soda Ash', o.sodaAsh + ' lbs']);
    if (o.bicarb)       rows.push(['Na Bicarbonate', o.bicarb + ' lbs']);
    if (o.conditioner)  rows.push(['Conditioner', o.conditioner + ' lbs']);
    if (o.bromine)      rows.push(['Bromine', o.bromine + ' ea']);
    if (o.phosphateOz)  rows.push(['Phosphate Remover', o.phosphateOz + ' oz']);
    if (o.saltBag)      rows.push(['Salt', o.saltBag + ' bag']);
    if (o.algaecide)    rows.push(['Algaecide', o.algaecide + ' oz']);
    if (o.clarifier)    rows.push(['Clarifier', o.clarifier + ' oz']);
    if (!rows.length)   return '<tr><td colspan="2" style="color:#999;font-style:italic;padding:6px 0">None added</td></tr>';
    return rows.map(function(r){ return '<tr><td class="al">' + r[0] + '</td><td class="av">' + r[1] + '</td></tr>'; }).join('');
  }

  var photoHTML = '';
  if (photoEntries.length) {
    photoHTML = '<div class="section-hd">SITE PHOTOS</div>'
      + '<div class="photos-grid">'
      + photoEntries.map(function(k) {
          var label = k === 'before' ? 'Before' : k === 'after' ? 'After' : 'Photo ' + k.replace('extra','');
          return '<div class="photo-item"><img src="' + photos[k] + '" /><div class="photo-cap">' + label + '</div></div>';
        }).join('')
      + '</div>';
  }

  var css = [
    '* { box-sizing:border-box; margin:0; padding:0; }',
    'body { font-family: Georgia, serif; background:#fff; color:#231F20; font-size:11px; }',
    '@page { size:A4; margin:0; }',
    '@media print { .no-print { display:none!important; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }',
    /* print bar */
    '.print-bar { position:fixed; top:0; left:0; right:0; background:#1A405F; padding:11px 28px; display:flex; align-items:center; justify-content:space-between; z-index:100; }',
    '.print-bar-left { color:#D4C9BB; font-family:Arial,sans-serif; font-size:12px; letter-spacing:0.06em; }',
    '.print-btn { background:linear-gradient(135deg,#539199,#226683); color:#fff; border:none; padding:10px 26px; border-radius:4px; font-family:Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; cursor:pointer; }',
    '.page { margin-top:54px; }',
    /* header */
    '.hdr { background:#0a1e2e; padding:20px 32px; display:flex; align-items:center; justify-content:space-between; }',
    '.hdr-left { display:flex; align-items:center; gap:14px; }',
    '.hdr-logo { width:52px; height:auto; display:block; }',
    '.hdr-brand { color:#D4C9BB; font-family:Georgia,serif; font-size:28px; font-weight:300; letter-spacing:0.38em; text-transform:uppercase; }',
    '.hdr-right { text-align:right; }',
    '.hdr-title { color:#fff; font-family:Arial,sans-serif; font-size:13px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; }',
    '.hdr-sub { color:#539199; font-family:Arial,sans-serif; font-size:8.5px; letter-spacing:0.16em; text-transform:uppercase; margin-top:5px; }',
    /* gold rule */
    '.gold-rule { height:3px; background:linear-gradient(90deg,#c9a87c,#D4C9BB,#c9a87c); }',
    /* job info */
    '.job-block { padding:16px 32px; background:#f8f5f1; border-bottom:1px solid #dbd5cc; }',
    '.job-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px 32px; }',
    '.jl { font-family:Arial,sans-serif; font-size:8px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#a09589; }',
    '.jv { font-family:Arial,sans-serif; font-size:12px; font-weight:600; color:#1A405F; margin-top:2px; margin-bottom:8px; }',
    /* section */
    '.section-hd { background:#1A405F; color:#D4C9BB; font-family:Arial,sans-serif; font-size:8.5px; font-weight:700; letter-spacing:0.22em; text-transform:uppercase; padding:8px 32px; }',
    '.section-body { padding:14px 32px; }',
    /* chem table */
    '.chem-tbl { width:100%; border-collapse:collapse; }',
    '.chem-tbl th { background:#226683; color:#fff; font-family:Arial,sans-serif; font-size:8.5px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; padding:8px 12px; text-align:left; }',
    '.chem-tbl th:nth-child(2), .chem-tbl th:nth-child(3) { text-align:center; }',
    '.rl { padding:7px 12px; font-family:Arial,sans-serif; font-size:10px; color:#334155; border-bottom:1px solid #ede9e3; }',
    '.rv { padding:7px 12px; font-family:Arial,sans-serif; font-size:10px; font-weight:600; color:#1A405F; text-align:center; border-bottom:1px solid #ede9e3; }',
    '.chem-tbl tr:nth-child(even) td { background:#f8f5f1; }',
    '.ideal-note { font-family:Arial,sans-serif; font-size:8px; color:#a09589; font-style:italic; padding:6px 12px 10px; border-bottom:2px solid #D4C9BB; }',
    /* added */
    '.added-wrap { display:grid; grid-template-columns:1fr 1fr; gap:28px; }',
    '.added-title { font-family:Arial,sans-serif; font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#539199; margin-bottom:8px; padding-bottom:5px; border-bottom:1px solid #D4C9BB; }',
    '.added-tbl { width:100%; border-collapse:collapse; }',
    '.al { font-family:Arial,sans-serif; font-size:10px; color:#334155; padding:5px 0; border-bottom:1px solid #ede9e3; }',
    '.av { font-family:Arial,sans-serif; font-size:10px; font-weight:700; color:#1A405F; padding:5px 0; text-align:right; border-bottom:1px solid #ede9e3; }',
    /* notes */
    '.notes-box { background:#f8f5f1; border-left:3px solid #D4C9BB; padding:12px 16px; font-family:Arial,sans-serif; font-size:11px; line-height:1.6; color:#334155; min-height:44px; border-radius:0 4px 4px 0; }',
    /* photos */
    '.photos-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:14px 32px; }',
    '.photo-item img { width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:4px; border:1px solid #dbd5cc; }',
    '.photo-cap { font-family:Arial,sans-serif; font-size:8.5px; text-align:center; color:#a09589; margin-top:4px; letter-spacing:0.08em; text-transform:uppercase; }',
    /* footer */
    '.footer { background:#0a1e2e; padding:14px 32px; display:flex; align-items:center; justify-content:space-between; page-break-inside:avoid; margin-top:24px; }',
    '.footer-logo { width:36px; height:auto; display:block; }',
    '.footer-brand { color:#D4C9BB; font-family:Georgia,serif; font-size:15px; font-weight:300; letter-spacing:0.32em; text-transform:uppercase; }',
    '.footer-info { color:rgba(212,201,187,.5); font-family:Arial,sans-serif; font-size:8px; letter-spacing:0.1em; margin-top:3px; }',
    '.footer-right { text-align:right; color:rgba(212,201,187,.55); font-family:Arial,sans-serif; font-size:8px; letter-spacing:0.06em; line-height:1.8; }',
  ].join('\n');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<title>OASIS Service Report \u2014 ' + (cust ? cust.name : '') + '</title>'
    + '<style>' + css + '</style>'
    + '</head><body>'

    /* print bar */
    + '<div class="print-bar no-print">'
    + '<div class="print-bar-left">OASIS Service Report \u2014 ' + (cust ? cust.name : '') + '</div>'
    + '<button class="print-btn" onclick="window.print()">Save as PDF \u2193</button>'
    + '</div>'

    + '<div class="page">'

    /* header */
    + '<div class="hdr">'
    + '<div class="hdr-left">'
    + '<img class="hdr-logo" src="' + logoSrc + '" alt="OASIS">'
    + '<div class="hdr-brand">Oasis</div>'
    + '</div>'
    + '<div class="hdr-right"><div class="hdr-title">Service Report</div><div class="hdr-sub">Luxury Pool &amp; Watershape Design</div></div>'
    + '</div>'
    + '<div class="gold-rule"></div>'

    /* job info */
    + '<div class="job-block"><div class="job-grid">'
    + '<div><div class="jl">Client</div><div class="jv">' + (cust ? cust.name : '\u2014') + '</div></div>'
    + '<div><div class="jl">Date</div><div class="jv">' + fmtDate(wo.date) + '</div></div>'
    + '<div><div class="jl">Address</div><div class="jv">' + (wo.address || '\u2014') + '</div></div>'
    + '<div><div class="jl">Time In / Out</div><div class="jv">' + (fmtTime(wo.timeIn) || '\u2014') + ' \u2192 ' + (fmtTime(wo.timeOut) || '\u2014') + '</div></div>'
    + '<div><div class="jl">Technician</div><div class="jv">' + (tech ? tech.name : '\u2014') + '</div></div>'
    + '<div><div class="jl">Route &amp; Pool Size</div><div class="jv">Route ' + (wo.routeNumber || '\u2014') + (wo.gallons ? ' \u00b7 ' + parseInt(wo.gallons).toLocaleString() + ' gal' : '') + '</div></div>'
    + '<div><div class="jl">Surface Type</div><div class="jv">' + (wo.surfaceType || '\u2014') + '</div></div>'
    + '<div><div class="jl">Condition</div><div class="jv">' + (wo.condition || '\u2014') + '</div></div>'
    + '</div></div>'

    /* chemical readings */
    + '<div class="section-hd">Chemical Readings</div>'
    + '<table class="chem-tbl">'
    + '<thead><tr><th style="width:38%">Parameter</th><th style="width:31%">Pool</th><th style="width:31%">Spa</th></tr></thead>'
    + '<tbody>'
    + chemRow('Chlorine', p.chlorine, ' ppm', s.chlorine, 'chlorine')
    + chemRow('pH', p.pH, '', s.pH, 'pH')
    + chemRow('Total Alkalinity', p.alk, ' ppm', s.alk, 'alk')
    + chemRow('CYA / Stabilizer', p.cya, ' ppm', s.cya, 'cya')
    + chemRow('Calcium Hardness', p.calcium, ' ppm', s.calcium, 'calcium')
    + chemRow('Salt', p.salt, ' ppm', s.salt, '')
    + chemRow('Phosphate', p.phosphate, ' ppb', s.phosphate, '')
    + chemRow('TDS', p.tds, ' ppm', s.tds, '')
    + '</tbody></table>'
    + '<div class="ideal-note">\u25cf Ideal: Chlorine 1\u20133 ppm \u00b7 pH 7.2\u20137.6 \u00b7 Alkalinity 80\u2013120 ppm \u00b7 CYA 30\u201350 ppm \u00b7 Calcium 200\u2013400 ppm</div>'

    /* chemicals added */
    + '<div class="section-hd">Chemicals Added</div>'
    + '<div class="section-body"><div class="added-wrap">'
    + '<div><div class="added-title">Pool</div><table class="added-tbl">' + addedParts(p) + '</table></div>'
    + '<div><div class="added-title">Spa</div><table class="added-tbl">' + addedParts(s) + '</table></div>'
    + '</div></div>'

    /* notes */
    + '<div class="section-hd">Service Notes</div>'
    + '<div class="section-body"><div class="notes-box">' + (wo.notes || '<span style="color:#a09589;font-style:italic">No notes recorded.</span>') + '</div></div>'

    /* photos */
    + photoHTML

    /* footer */
    + '<div class="footer">'
    + '<div style="display:flex;align-items:center;gap:14px">'
    + '<img class="footer-logo" src="' + logoSrc + '" alt="OASIS">'
    + '<div><div class="footer-brand">Oasis</div><div class="footer-info">Luxury Pool &amp; Watershape Design, Construction &amp; Maintenance</div></div>'
    + '</div>'
    + '<div class="footer-right">Harbour Walk, 2nd Floor \u2014 Grand Cayman, KY1-1001<br>+1 345-945-7665 \u00b7 oasis.ky<br>Generated ' + new Date().toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'}) + '</div>'
    + '</div>'

    + '</div>'
    + '<script>window.onload=function(){window.print();};<\/script>'
    + '</body></html>';

  var w = window.open('', '_blank', 'width=860,height=720');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function dataURLtoFile(dataURL,filename){const arr=dataURL.split(','),mime=arr[0].match(/:(.*?);/)[1],bstr=atob(arr[1]),u8=new Uint8Array(bstr.length);for(let i=0;i<bstr.length;i++)u8[i]=bstr.charCodeAt(i);return new File([u8],filename,{type:mime});}

/* ── DOSING CALCULATOR ─────────────────────────────────────────── */
function getTempFactor(t){const tbl=[[32,0],[41,.1],[50,.2],[59,.3],[68,.4],[77,.5],[86,.6],[95,.7],[104,.8],[113,.9]];t=parseFloat(t)||77;if(t<=32)return 0;if(t>=113)return.9;for(let i=0;i<tbl.length-1;i++){if(t>=tbl[i][0]&&t<=tbl[i+1][0]){const r=(t-tbl[i][0])/(tbl[i+1][0]-tbl[i][0]);return tbl[i][1]+r*(tbl[i+1][1]-tbl[i][1]);}}return.5;}
function calcLSI(pH,ca,alk,tempF){const p=parseFloat(pH),c=parseFloat(ca),a=parseFloat(alk);if(isNaN(p)||isNaN(c)||isNaN(a)||c<=0||a<=0)return null;return parseFloat((p+Math.log10(c)+Math.log10(a)+getTempFactor(tempF)-12.1).toFixed(2));}
function lsiStatus(lsi,surface){if(lsi===null)return{cls:'na',label:'—'};const pl=!surface||surface.includes('Plaster')||surface.includes('Concrete');if(lsi<-0.5)return{cls:'bad',label:'Very Corrosive'};if(lsi<(pl?-0.3:-0.5))return{cls:'warn',label:'Slightly Corrosive'};if(lsi<=(pl?0.3:0.0))return{cls:'ok',label:'Balanced ✓'};if(lsi<=0.5)return{cls:'warn',label:'Slightly Scaling'};return{cls:'bad',label:'Scaling'};}
function calcDosing(gallons,r,tempF){const g=parseFloat(gallons)||0;if(g<=0)return[];const G=g/10000,items=[],cl=parseFloat(r.chlorine),ph=parseFloat(r.pH),alk=parseFloat(r.alk),cya=parseFloat(r.cya),ca=parseFloat(r.calcium),salt=parseFloat(r.salt),phos=parseFloat(r.phosphate);if(!isNaN(cl)){if(cl<1){const d=2-cl,ch=(d*G*.1316).toFixed(2),lq=(d*G*.10).toFixed(2);items.push({s:'low',icon:'⬇️',label:`Chlorine LOW — ${cl} ppm (1–3)`,add:`${ch} lbs Cal-Hypo (65%)`,note:`or ${lq} gal Liquid Chlorine — add at dusk`});}else if(cl>3)items.push({s:'high',icon:'⬆️',label:`Chlorine HIGH — ${cl} ppm (1–3)`,add:'Allow to dissipate naturally',note:'Sodium thiosulfate: ~1 oz per 1 ppm per 10,000 gal'});}if(!isNaN(ph)){const af=isNaN(alk)?1:Math.min(2,Math.max(.5,alk/100));if(ph>7.6){const d=ph-7.4,oz=Math.round(d/.1*6*G*af),qt=(oz/32).toFixed(1);items.push({s:'high',icon:'⬆️',label:`pH HIGH — ${ph} (7.2–7.6)`,add:`${oz} fl oz (${qt} qt) Muriatic Acid`,note:'Pre-dilute in bucket. Retest after 1 hr.'});}else if(ph<7.2){const d=7.4-ph,oz=Math.round(d/.2*6*G),lb=(oz/16).toFixed(2);items.push({s:'low',icon:'⬇️',label:`pH LOW — ${ph} (7.2–7.6)`,add:`${oz} oz (${lb} lbs) Soda Ash`,note:'Broadcast across pool with pump running.'});}}if(!isNaN(alk)){if(alk<80){const d=100-alk,lb=(d/10*1.5*G).toFixed(2);items.push({s:'low',icon:'⬇️',label:`ALK LOW — ${alk} ppm (80–120)`,add:`${lb} lbs Sodium Bicarbonate`,note:'Broadcast in front of a return fitting.'});}else if(alk>120){const d=alk-100,oz=Math.round(d/10*11*G);items.push({s:'high',icon:'⬆️',label:`ALK HIGH — ${alk} ppm (80–120)`,add:`${oz} fl oz Muriatic Acid`,note:'Add around perimeter with pump OFF.'});}}if(!isNaN(cya)){if(cya<30){const d=40-cya,oz=(d/10*13*G).toFixed(1),lb=(parseFloat(oz)/16).toFixed(2);items.push({s:'low',icon:'⬇️',label:`CYA LOW — ${cya} ppm (30–50)`,add:`${lb} lbs Cyanuric Acid`,note:'Add in skimmer sock or dissolve in warm water.'});}else if(cya>80)items.push({s:'high',icon:'⬆️',label:`CYA HIGH — ${cya} ppm (30–50)`,add:cya>100?'Partial drain & refill required':'Partial drain recommended',note:`At ${cya} ppm CYA, chlorine efficacy is impaired.`});}if(!isNaN(ca)){if(ca<200){const d=300-ca,lb=(d/10*1.25*G).toFixed(2);items.push({s:'low',icon:'⬇️',label:`Calcium LOW — ${ca} ppm (200–400)`,add:`${lb} lbs Calcium Chloride`,note:'Low calcium etches plaster.'});}else if(ca>400)items.push({s:'high',icon:'⬆️',label:`Calcium HIGH — ${ca} ppm (200–400)`,add:'Partial drain & refill',note:'High calcium causes scaling.'});}if(!isNaN(phos)&&phos>100){const oz=Math.ceil(phos/100*G*10);items.push({s:'high',icon:'⬆️',label:`Phosphates HIGH — ${phos} ppb (0–100)`,add:`~${oz} oz Phosphate Remover`,note:'Backwash filter 24 hrs after treating.'});}if(!isNaN(salt)&&salt>500){if(salt<3000){const d=3200-salt,lb=Math.round(d/100*8.3*G),bags=Math.ceil(lb/40);items.push({s:'low',icon:'⬇️',label:`Salt LOW — ${salt} ppm (3,000–4,000)`,add:`${lb} lbs Pool Salt (~${bags} × 40-lb bags)`,note:'Use pure NaCl. Allow 24 hrs to circulate.'});}else if(salt>4000)items.push({s:'high',icon:'⬆️',label:`Salt HIGH — ${salt} ppm (3,000–4,000)`,add:'Partial drain & refill',note:'Excess salt corrodes metal fixtures.'});}return items;}
function renderDosingResults(gallons,r,tempF,surface){const g=parseFloat(gallons);if(!g||g<=0)return`<div class="dosing-empty"><p>Enter pool gallons &amp; readings above</p></div>`;const lsi=calcLSI(r.pH,r.calcium,r.alk,tempF||80);const st=lsiStatus(lsi,surface);const items=calcDosing(gallons,r,tempF);const sign=lsi!==null&&lsi>0?'+':'';const lsiHTML=`<div class="lsi-box lsi-${st.cls}"><div class="lsi-main"><div><div class="lsi-val">${lsi!==null?sign+lsi:'—'}</div><div class="lsi-name">Langelier Saturation Index</div></div><div class="lsi-badge lsi-bdg-${st.cls}">${st.label}</div></div>${lsi!==null?`<div class="lsi-track"><div class="lsi-dot" style="left:${Math.min(96,Math.max(4,((lsi+1)/2)*100))}%"></div></div><div class="lsi-labels"><span>−1.0 Corrosive</span><span>0 Balanced</span><span>+1.0 Scaling</span></div>`:''}  <div class="lsi-ideal">Ideal: −0.3 to +0.3 (plaster) · −0.3 to 0.0 (fiberglass/vinyl)</div></div>`;const allOk=items.length===0;const itemsHTML=allOk?`<div class="dosing-all-ok">✅ All parameters within range — water is balanced!</div>`:`<div class="dosing-hdr">RECOMMENDATIONS</div>`+items.map(it=>`<div class="dosing-item dosing-${it.s}"><div class="dosing-top"><span>${it.icon}</span><strong>${esc(it.label)}</strong></div><div class="dosing-add">${esc(it.add)}</div>${it.note?`<div class="dosing-note">${esc(it.note)}</div>`:''}</div>`).join('');return lsiHTML+itemsHTML;}
function updateDosingCalc(){const g=document.getElementById('wo-gallons')?.value||'';const tmp=document.getElementById('wo-temp')?.value||'80';const sfc=document.getElementById('wo-surface')?.value||'Plaster / Concrete';const r={chlorine:document.getElementById('wo-pool-cl')?.value,pH:document.getElementById('wo-pool-ph')?.value,alk:document.getElementById('wo-pool-alk')?.value,cya:document.getElementById('wo-pool-cya')?.value,calcium:document.getElementById('wo-pool-ca')?.value,salt:document.getElementById('wo-pool-salt')?.value,phosphate:document.getElementById('wo-pool-phos')?.value};const el=document.getElementById('dosing-results');if(el)el.innerHTML=renderDosingResults(g,r,tmp,sfc);}

/* ── VIEWS ─────────────────────────────────────────────────────── */

/* DASHBOARD */
function renderDashboard() {
  const techId=Auth.techId,today=todayStr(),dow=todayDOW();
  const todayStops=getTodaysStops(techId);
  const h=new Date().getHours(),greet=h<12?'Good Morning':h<17?'Good Afternoon':'Good Evening';
  const done=todayStops.filter(s=>{const wo=getStopWO(s.id,today);return wo&&wo.status==='completed';}).length;
  const myWOs=DB.workOrders.filter(w=>w.technicianId===techId).length;
  const tech=DB.getTechnician(techId);

  const stopsHTML=todayStops.length===0
    ?`<p style="padding:16px;color:var(--gray-400);text-align:center;font-size:13px">${DAY_NAMES[dow]} is not a scheduled service day.</p>`
    :todayStops.map(s=>{const cust=DB.getCustomer(s.customerId);const wo=getStopWO(s.id,today);const st=wo?wo.status:'pending';
      return`<div class="schedule-item" onclick="Router.navigate('route')" style="cursor:pointer">
        <div class="schedule-dot ${st}"></div>
        <div style="min-width:24px;font-size:13px;font-weight:700;color:var(--champagne-dk)">${s.stopOrder}</div>
        <div class="schedule-info"><div class="schedule-name">${esc(cust?cust.name:'Unknown')}</div><div class="schedule-detail">${esc(s.serviceType)}</div></div>
        ${statusBadge(st)}</div>`;}).join('');

  return`<div class="wave-banner">
    <div class="wave-banner-eyebrow">Luxury Pool &amp; Watershape Service</div>
    <div class="wave-banner-title">${esc(greet)}</div>
    <div class="wave-banner-sub">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
  </div>
  <div class="stats-grid" style="margin-top:20px">
    <div class="stat-card primary"><div class="stat-icon">📍</div><div class="stat-value">${todayStops.length}</div><div class="stat-label">Stops Today</div></div>
    <div class="stat-card primary"><div class="stat-icon">✅</div><div class="stat-value">${done}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card"><div class="stat-icon">⏳</div><div class="stat-value" style="color:var(--warning)">${todayStops.length-done}</div><div class="stat-label">Remaining</div></div>
    <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-value" style="color:var(--teal)">${myWOs}</div><div class="stat-label">My Chem Sheets</div></div>
  </div>
  <div class="section-header"><span class="section-title">Today — ${DAY_SHORT[dow]}</span><button class="btn btn-sm btn-primary" onclick="Router.navigate('route')">Full Route</button></div>
  <div class="card">${stopsHTML}</div>
  <div class="section-header"><span class="section-title">Quick Actions</span></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px 16px">
    <button class="btn btn-primary" style="justify-content:center" onclick="Router.navigate('route')">📍 My Route</button>
    <button class="btn btn-secondary" style="justify-content:center" onclick="woState={view:'form',id:null};Router.navigate('logs')">📋 New Chem Sheet</button>
    <button class="btn btn-secondary" style="justify-content:center" onclick="Router.navigate('customers')">👥 Clients</button>
    <button class="btn btn-secondary" style="justify-content:center" onclick="Router.navigate('logs')">📄 My Sheets</button>
  </div>`;
}

/* MY ROUTE */
let routeViewDay=null;
function renderRoute(){
  const techId=Auth.techId,today=todayStr(),dow=routeViewDay!==null?routeViewDay:todayDOW(),isToday=dow===todayDOW();
  const stops=getStopsByDay(techId,dow),tech=DB.getTechnician(techId);
  const total=stops.length,done=stops.filter(s=>{const wo=getStopWO(s.id,today);return wo&&wo.status==='completed';}).length,pct=total>0?Math.round((done/total)*100):0;
  const weekDays=[1,2,3,4,5,6];
  const dayTabsHTML=weekDays.map(d=>{const has=DB.routes.some(r=>r.technicianId===techId&&r.dayOfWeek===d);return`<button class="filter-tab${dow===d?' active':''} ${has?'':'day-empty'}" onclick="routeViewDay=${d};App.render()">${DAY_SHORT[d]}</button>`;}).join('');
  const stopsHTML=stops.length===0
    ?`<div class="empty-state"><div class="empty-icon">🏖️</div><div class="empty-title">No stops on ${DAY_NAMES[dow]}</div></div>`
    :stops.map(s=>{const cust=DB.getCustomer(s.customerId);const wo=getStopWO(s.id,today);const st=wo?wo.status:'pending';
      const isDone=st==='completed',isActive=st==='in-progress';
      return`<div class="route-stop ${isDone?'route-stop-done':isActive?'route-stop-active':''}">
        <div class="route-stop-num">${s.stopOrder}</div>
        <div class="route-stop-body">
          <div class="route-stop-name">${esc(cust?cust.name:'Unknown')}</div>
          <div class="route-stop-addr">${esc(cust?cust.address:'')}</div>
          <div class="route-stop-meta">
            <span class="route-type-badge">${esc(s.serviceType)}</span>
            ${cust&&cust.poolSize?`<span class="route-meta-pill">${parseInt(cust.poolSize).toLocaleString()} gal</span>`:''}
          </div>
          ${cust&&cust.notes?`<div class="route-stop-notes">📌 ${esc(cust.notes)}</div>`:''}
        </div>
        <div class="route-stop-actions">
          ${statusBadge(st)}
          <div class="route-btn-row">
            ${isToday&&st==='pending'?`<button class="btn btn-sm route-start-btn" onclick="startStop('${esc(s.id)}')">▶ Start</button>`:''}
            ${isToday&&st==='in-progress'?`<button class="btn btn-sm route-complete-btn" onclick="showChemSheetForStop('${esc(s.id)}')">📋 Chem Sheet</button>`:''}
            ${isDone&&wo?`<button class="btn btn-sm btn-secondary" onclick="woState={view:'form',id:'${esc(wo.id)}'};Router.navigate('logs')">📋 View</button>`:''}
            ${cust?`<a class="btn btn-sm btn-secondary" href="https://maps.google.com/?q=${encodeURIComponent(cust.address||'')}" target="_blank">🗺️</a>`:''}
          </div>
        </div>
      </div>`;}).join('');
  return`<div class="page-header">
    <div><div class="page-title">My Route</div><div class="page-subtitle">Route ${stops[0]?.routeNumber||'—'} · ${tech?tech.name:''}</div></div>
  </div>
  <div class="filter-tabs">${dayTabsHTML}</div>
  ${total>0?`<div class="route-progress-bar"><div class="route-progress-inner" style="width:${pct}%"></div><span class="route-progress-label">${done}/${total} stops complete</span></div>`:''}
  <div style="padding:4px 0">${stopsHTML}</div>`;
}

function startStop(routeId){
  const route=DB.getRoute(routeId);if(!route)return;
  const cust=DB.getCustomer(route.customerId),existing=getStopWO(routeId,todayStr());
  if(existing){DB.updateWorkOrder(existing.id,{status:'in-progress'});}
  else{DB.addWorkOrder({routeId,customerId:route.customerId,technicianId:Auth.techId,routeNumber:route.routeNumber,date:todayStr(),timeIn:new Date().toTimeString().slice(0,5),timeOut:'',condition:'Good',gallons:cust?cust.poolSize||'':'',address:cust?cust.address||'':'',temp:'80',surfaceType:cust?cust.poolType||'Plaster / Concrete':'Plaster / Concrete',notes:'',status:'in-progress',pool:{chlorine:'',pH:'',alk:'',cya:'',calcium:'',salt:'',phosphate:'',tds:'',tabs:'',hypo:'',acid:'',sodaAsh:'',bicarb:'',conditioner:'',bromine:'',phosphateOz:'',saltBag:'',algaecide:'',clarifier:''},spa:{chlorine:'',pH:'',alk:'',cya:'',calcium:'',salt:'',phosphate:'',tds:'',tabs:'',hypo:'',acid:'',sodaAsh:'',bicarb:'',conditioner:'',bromine:'',phosphateOz:'',saltBag:'',algaecide:'',clarifier:''},photos:{}});}
  showToast('Stop started');App.render();
}

function showChemSheetForStop(routeId){const wo=getStopWO(routeId,todayStr());if(wo){woState={view:'form',id:wo.id};Router.navigate('logs');}}

/* CHEM SHEETS */
let woState={view:'list'};
function renderWorkOrders(){if(woState.view==='form'){App._afterRender=updateDosingCalc;return renderWorkOrderForm(woState.id);}return renderWorkOrderList();}

function renderWorkOrderList(){
  const techId=Auth.techId;
  const myWOs=Auth.isAdmin?[...DB.workOrders]:DB.workOrders.filter(w=>w.technicianId===techId);
  const sorted=myWOs.sort((a,b)=>(b.date+(b.timeIn||'')).localeCompare(a.date+(a.timeIn||'')));
  const condCls={Good:'completed',Excellent:'completed',Fair:'in-progress',Poor:'pending','Green Pool':'cancelled',Algae:'cancelled',Cloudy:'pending'};
  const listHTML=sorted.length===0
    ?`<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No chem sheets yet</div><div class="empty-subtitle">Start a route stop or tap + to add one manually.</div></div>`
    :sorted.map(wo=>{const cust=DB.getCustomer(wo.customerId);const pool=wo.pool||{};
      return`<div class="job-card">
        <div class="job-card-header">
          <div><div class="job-card-title">${esc(cust?cust.name:'Unknown')}</div>
            <div class="job-card-customer">Route ${esc(wo.routeNumber||'—')}${wo.gallons?' · '+parseInt(wo.gallons).toLocaleString()+' gal':''}</div></div>
          <span class="badge badge-${condCls[wo.condition]||'pending'}">${esc(wo.condition||'—')}</span>
        </div>
        <div class="job-card-body">
          <div class="job-meta">
            <div class="job-meta-item">📅 ${fmtDate(wo.date)}</div>
            ${wo.timeIn?`<div class="job-meta-item">🕐 In: ${fmtTime(wo.timeIn)}</div>`:''}
            ${wo.timeOut?`<div class="job-meta-item">🕓 Out: ${fmtTime(wo.timeOut)}</div>`:''}
          </div>
          ${pool.chlorine?`<div class="wo-pills">${woPill('Cl',pool.chlorine,1,3,'ppm')}${woPill('pH',pool.pH,7.2,7.6,'')}${woPill('Alk',pool.alk,80,120,'')}${pool.cya?woPill('CYA',pool.cya,30,50,''):''}</div>`:''}
        </div>
        <div class="job-card-footer">
          <button class="btn btn-sm btn-primary" onclick="woState={view:'form',id:'${esc(wo.id)}'};App.render()">📋 Open</button>
          <button class="btn btn-sm" style="background:var(--navy);color:var(--champagne)" onclick="sendReport('${esc(wo.id)}')">📧 Send</button>
          <button class="btn btn-sm btn-secondary" style="color:var(--danger)" onclick="deleteWO('${esc(wo.id)}')">🗑️</button>
        </div>
      </div>`;}).join('');
  return`<div class="page-header"><div><div class="page-title">Chem Sheets</div><div class="page-subtitle">${sorted.length} record${sorted.length!==1?'s':''}</div></div><button class="btn-fab" onclick="woState={view:'form',id:null};App.render()">+</button></div><div style="margin-top:4px">${listHTML}</div>`;
}
function woPill(lbl,val,min,max,unit){const v=parseFloat(val),ok=!isNaN(v)&&v>=min&&v<=max;return`<span class="wo-pill ${isNaN(v)?'':'wo-pill-'+(ok?'ok':'bad')}">${lbl}: ${val}${unit}</span>`;}
function deleteWO(id){Confirm.show('Delete this chem sheet?',()=>{DB.deleteWorkOrder(id);App.render();showToast('Deleted');});}

function renderWorkOrderForm(id){
  const wo=id?(DB.getWorkOrder(id)||{}):{};resetPhotos(wo);
  const p=wo.pool||{},s=wo.spa||{},custId=wo.customerId||'',today=todayStr();
  const tech=DB.getTechnician(Auth.techId);
  return`<div class="wo-form">
  <div class="wo-bar"><button class="btn btn-secondary btn-sm" onclick="woState={view:'list'};App.render()">← Back</button><span class="wo-bar-title">${id?'Edit Chem Sheet':'New Chem Sheet'}</span><button class="btn btn-primary btn-sm" onclick="saveWorkOrder(${id?`'${esc(id)}'`:'null'})">💾 Save</button></div>
  <div class="wo-sec"><div class="wo-sec-hd" onclick="toggleWoSection(this)"><span>📋  Job Info</span><span class="wo-chev">▼</span></div>
  <div class="wo-sec-bd">
    <div class="form-row">
      <div class="form-group"><label class="form-label">Technician</label><input class="form-control" value="${esc(tech?tech.name:'')}" readonly style="background:var(--gray-50)"></div>
      <div class="form-group"><label class="form-label">Route #</label><input class="form-control" id="wo-route" value="${esc(wo.routeNumber||DB.routes.find(r=>r.technicianId===Auth.techId)?.routeNumber||'')}"></div>
    </div>
    <div class="form-group"><label class="form-label">Customer *</label><select class="form-control" id="wo-customer" onchange="onWoCustChange()"><option value="">— Select client —</option>${customerOptions(custId)}</select></div>
    <div class="form-group"><label class="form-label">Address</label><input class="form-control" id="wo-address" readonly style="background:var(--gray-50)" value="${esc(wo.address||(custId?DB.getCustomer(custId)?.address||'':''))}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Date *</label><input class="form-control" id="wo-date" type="date" value="${esc(wo.date||today)}"></div>
      <div class="form-group"><label class="form-label">Pool Gallons</label><input class="form-control" id="wo-gallons" type="number" step="500" min="0" placeholder="15000" value="${esc(wo.gallons||(custId?DB.getCustomer(custId)?.poolSize||'':''))}" oninput="updateDosingCalc()"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Time In</label><input class="form-control" id="wo-timein" type="time" value="${esc(wo.timeIn||'')}"></div>
      <div class="form-group"><label class="form-label">Time Out</label><input class="form-control" id="wo-timeout" type="time" value="${esc(wo.timeOut||'')}"></div>
    </div>
    <div class="form-group"><label class="form-label">Condition</label><select class="form-control" id="wo-condition">${['Good','Excellent','Fair','Poor','Cloudy','Green Pool','Algae'].map(c=>`<option${(wo.condition||'Good')===c?' selected':''}>${c}</option>`).join('')}</select></div>
  </div></div>
  <div class="wo-sec"><div class="wo-sec-hd" onclick="toggleWoSection(this)"><span>🧪  Chemical Readings</span><span class="wo-chev">▼</span></div>
  <div class="wo-sec-bd">
    <p class="wo-hint">Ideal ranges shown below each field.</p>
    <div class="wo-blk-lbl">🏊  POOL</div><div class="wo-grid">
      ${rf('Chlorine','wo-pool-cl',p.chlorine,'2–4 ppm')}${rf('pH','wo-pool-ph',p.pH,'7.2–7.6')}${rf('ALK','wo-pool-alk',p.alk,'80–120 ppm')}${rf('CYA','wo-pool-cya',p.cya,'30–50 ppm')}${rf('Ca Hardness','wo-pool-ca',p.calcium,'200–400 ppm')}${rf('Salt','wo-pool-salt',p.salt,'3000–4000')}${rf('Phosphate','wo-pool-phos',p.phosphate,'0 ppb')}${rf('TDS','wo-pool-tds',p.tds,'&lt;2000')}
    </div>
    <div class="wo-blk-lbl" style="margin-top:12px">🛁  SPA</div><div class="wo-grid">
      ${rf('Chlorine','wo-spa-cl',s.chlorine,'3–5 ppm')}${rf('pH','wo-spa-ph',s.pH,'7.2–7.6')}${rf('ALK','wo-spa-alk',s.alk,'80–120 ppm')}${rf('CYA','wo-spa-cya',s.cya,'30–50 ppm')}${rf('Ca Hardness','wo-spa-ca',s.calcium,'150–400')}${rf('Salt','wo-spa-salt',s.salt,'—')}${rf('Phosphate','wo-spa-phos',s.phosphate,'0 ppb')}${rf('TDS','wo-spa-tds',s.tds,'&lt;1500')}
    </div>
  </div></div>
  <div class="wo-sec"><div class="wo-sec-hd" onclick="toggleWoSection(this)"><span>⚗️  Chemicals Added</span><span class="wo-chev">▼</span></div>
  <div class="wo-sec-bd">
    <div class="wo-blk-lbl">🏊  POOL</div><div class="wo-grid">
      ${cf('Tabs','wo-pool-tabs',p.tabs,'ea')}${cf('Hypo','wo-pool-hypo',p.hypo,'lbs')}${cf('Acid','wo-pool-acid',p.acid,'gal')}${cf('Soda Ash','wo-pool-sodaash',p.sodaAsh,'lbs')}${cf('Na Bicarb','wo-pool-bicarb',p.bicarb,'lbs')}${cf('Conditioner','wo-pool-cond',p.conditioner,'lbs')}${cf('Bromine','wo-pool-brom',p.bromine,'ea')}${cf('Phos Rmvr','wo-pool-phosoz',p.phosphateOz,'oz')}${cf('Salt','wo-pool-saltbag',p.saltBag,'bag')}${cf('Algaecide','wo-pool-alg',p.algaecide,'oz')}${cf('Clarifier','wo-pool-clar',p.clarifier,'oz')}
    </div>
    <div class="wo-blk-lbl" style="margin-top:12px">🛁  SPA</div><div class="wo-grid">
      ${cf('Tabs','wo-spa-tabs',s.tabs,'ea')}${cf('Hypo','wo-spa-hypo',s.hypo,'lbs')}${cf('Acid','wo-spa-acid',s.acid,'gal')}${cf('Soda Ash','wo-spa-sodaash',s.sodaAsh,'lbs')}${cf('Na Bicarb','wo-spa-bicarb',s.bicarb,'lbs')}${cf('Conditioner','wo-spa-cond',s.conditioner,'lbs')}${cf('Bromine','wo-spa-brom',s.bromine,'ea')}${cf('Phos Rmvr','wo-spa-phosoz',s.phosphateOz,'oz')}${cf('Salt','wo-spa-saltbag',s.saltBag,'bag')}${cf('Algaecide','wo-spa-alg',s.algaecide,'oz')}${cf('Clarifier','wo-spa-clar',s.clarifier,'oz')}
    </div>
    <div class="form-group" style="margin-top:14px"><label class="form-label">Service Notes</label><textarea class="form-control" id="wo-notes" rows="3">${esc(wo.notes||'')}</textarea></div>
  </div></div>
  <div class="wo-sec"><div class="wo-sec-hd wo-photo-hd" onclick="toggleWoSection(this)"><span>📸  Photos</span><span class="wo-chev">▼</span></div>
  <div class="wo-sec-bd">
    <p class="wo-hint">Tap a slot to photograph or choose from library.</p>
    <div class="photo-ba-row">${photoSlot('before','Before')}${photoSlot('after','After')}</div>
    <div class="wo-blk-lbl" style="margin-top:14px">Additional Photos</div>
    <div class="photo-extra-grid">${photoSlot('extra1','1')}${photoSlot('extra2','2')}${photoSlot('extra3','3')}${photoSlot('extra4','4')}${photoSlot('extra5','5')}</div>
  </div></div>
  <div class="wo-sec"><div class="wo-sec-hd wo-calc-hd" onclick="toggleWoSection(this)"><span>🧮  Dosing Calculator</span><span class="wo-chev">▼</span></div>
  <div class="wo-sec-bd">
    <div class="form-row" style="margin-bottom:14px">
      <div class="form-group"><label class="form-label">Water Temp (°F)</label><input class="form-control" id="wo-temp" type="number" min="32" max="120" placeholder="80" value="${esc(wo.temp||'80')}" oninput="updateDosingCalc()"></div>
      <div class="form-group"><label class="form-label">Pool Surface</label><select class="form-control" id="wo-surface" onchange="updateDosingCalc()">${['Plaster / Concrete','Fiberglass','Vinyl Liner'].map(s=>`<option${(wo.surfaceType||'Plaster / Concrete')===s?' selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div id="dosing-results"><div class="dosing-empty"><p>Enter pool readings &amp; gallons above</p></div></div>
  </div></div>
  ${wo.routeId?`<div style="padding:16px"><button class="btn btn-primary" style="width:100%;justify-content:center;padding:14px" onclick="completeStop('${esc(id||'')}')">✅  Mark Stop Complete &amp; Save</button></div>`:''}
  <div style="height:24px"></div></div>`;
}

function rf(label,id,val,hint){return`<div class="wo-fld"><div class="wo-fld-lbl">${label}</div><input class="form-control wo-fld-inp" id="${id}" type="number" step="0.1" min="0" placeholder="—" value="${esc(val||'')}" oninput="updateDosingCalc()"><div class="wo-fld-hint">${hint}</div></div>`;}
function cf(label,id,val,unit){return`<div class="wo-fld"><div class="wo-fld-lbl">${label} <span class="wo-unit">${unit}</span></div><input class="form-control wo-fld-inp" id="${id}" type="number" step="0.1" min="0" placeholder="0" value="${esc(val||'')}"></div>`;}
function toggleWoSection(hd){const bd=hd.nextElementSibling,cv=hd.querySelector('.wo-chev');cv.textContent=bd.classList.toggle('collapsed')?'▶':'▼';}
function onWoCustChange(){const sel=document.getElementById('wo-customer');const cust=sel?.value?DB.getCustomer(sel.value):null;const addr=document.getElementById('wo-address');const gal=document.getElementById('wo-gallons');if(addr)addr.value=cust?.address||'';if(gal&&!gal.value&&cust?.poolSize)gal.value=cust.poolSize;updateDosingCalc();}
function saveWorkOrder(id,extra={}){const custId=document.getElementById('wo-customer')?.value;const date=document.getElementById('wo-date')?.value;if(!custId){alert('Please select a customer.');return;}if(!date){alert('Please enter a date.');return;}const v=eid=>document.getElementById(eid)?.value.trim()||'';const data={customerId:custId,technicianId:Auth.techId,routeNumber:v('wo-route'),date,timeIn:v('wo-timein'),timeOut:v('wo-timeout'),condition:v('wo-condition'),gallons:v('wo-gallons'),address:v('wo-address'),temp:v('wo-temp'),surfaceType:v('wo-surface'),notes:v('wo-notes'),photos:{...WO_PHOTOS},...extra,pool:{chlorine:v('wo-pool-cl'),pH:v('wo-pool-ph'),alk:v('wo-pool-alk'),cya:v('wo-pool-cya'),calcium:v('wo-pool-ca'),salt:v('wo-pool-salt'),phosphate:v('wo-pool-phos'),tds:v('wo-pool-tds'),tabs:v('wo-pool-tabs'),hypo:v('wo-pool-hypo'),acid:v('wo-pool-acid'),sodaAsh:v('wo-pool-sodaash'),bicarb:v('wo-pool-bicarb'),conditioner:v('wo-pool-cond'),bromine:v('wo-pool-brom'),phosphateOz:v('wo-pool-phosoz'),saltBag:v('wo-pool-saltbag'),algaecide:v('wo-pool-alg'),clarifier:v('wo-pool-clar')},spa:{chlorine:v('wo-spa-cl'),pH:v('wo-spa-ph'),alk:v('wo-spa-alk'),cya:v('wo-spa-cya'),calcium:v('wo-spa-ca'),salt:v('wo-spa-salt'),phosphate:v('wo-spa-phos'),tds:v('wo-spa-tds'),tabs:v('wo-spa-tabs'),hypo:v('wo-spa-hypo'),acid:v('wo-spa-acid'),sodaAsh:v('wo-spa-sodaash'),bicarb:v('wo-spa-bicarb'),conditioner:v('wo-spa-cond'),bromine:v('wo-spa-brom'),phosphateOz:v('wo-spa-phosoz'),saltBag:v('wo-spa-saltbag'),algaecide:v('wo-spa-alg'),clarifier:v('wo-spa-clar')}};if(id&&id!=='null'){DB.updateWorkOrder(id,data);showToast('Chem sheet updated');}else{DB.addWorkOrder(data);showToast('Chem sheet saved');}woState={view:'list'};App.render();}
function completeStop(woId){const wo=DB.getWorkOrder(woId);if(!wo)return;const t=new Date().toTimeString().slice(0,5);saveWorkOrder(woId,{status:'completed',timeOut:t});DB.updateWorkOrder(woId,{status:'completed',timeOut:t});woState={view:'list'};Router.navigate('route');}

/* CLIENTS */
let custSearch='';
function renderCustomers(){
  const filtered=DB.customers.filter(c=>!custSearch||c.name.toLowerCase().includes(custSearch.toLowerCase())||(c.address||'').toLowerCase().includes(custSearch.toLowerCase()));
  const listHTML=filtered.length===0?`<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No clients found</div></div>`:filtered.map(c=>`<div class="list-item"><div class="list-item-avatar">${esc(initials(c.name))}</div><div class="list-item-info"><div class="list-item-name">${esc(c.name)}</div><div class="list-item-sub">${esc(c.address||'')}${c.poolSize?' · '+parseInt(c.poolSize).toLocaleString()+' gal':''}</div>${c.notes?`<div class="list-item-sub" style="color:var(--warning)">📌 ${esc(c.notes)}</div>`:''}</div>${Auth.isAdmin?`<div class="list-item-actions"><button class="btn btn-icon btn-sm" onclick="showEditCust('${esc(c.id)}')">✏️</button><button class="btn btn-icon btn-sm" style="background:var(--danger-light);color:var(--danger)" onclick="delCust('${esc(c.id)}')">🗑️</button></div>`:''}</div>`).join('');
  return`<div class="page-header"><div><div class="page-title">Clients</div><div class="page-subtitle">${DB.customers.length} properties</div></div>${Auth.isAdmin?`<button class="btn-fab" onclick="showAddCust()">+</button>`:''}</div><div class="search-bar"><span class="search-icon">🔍</span><input type="search" placeholder="Search clients…" value="${esc(custSearch)}" oninput="custSearch=this.value;App.render()"></div><div style="margin-top:8px">${listHTML}</div>`;
}
function custForm(c={}){return`<div class="form-group"><label class="form-label">Client Name *</label><input class="form-control" id="cf-name" value="${esc(c.name||'')}"></div><div class="form-group"><label class="form-label">Address</label><input class="form-control" id="cf-addr" value="${esc(c.address||'')}"></div><div class="form-row"><div class="form-group"><label class="form-label">Pool Gallons</label><input class="form-control" id="cf-gal" type="number" value="${esc(c.poolSize||'')}"></div><div class="form-group"><label class="form-label">Pool Type</label><select class="form-control" id="cf-type">${['Inground Gunite','Inground Fiberglass','Inground Vinyl','Above Ground','Commercial Gunite','Spa / Hot Tub','Other'].map(o=>`<option${(c.poolType||'')===o?' selected':''}>${o}</option>`).join('')}</select></div></div><div class="form-group"><label class="form-label">Access Notes</label><textarea class="form-control" id="cf-notes" rows="2">${esc(c.notes||'')}</textarea></div>`;}
function getCustData(){const n=document.getElementById('cf-name').value.trim();if(!n){alert('Name required.');return null;}return{name:n,address:document.getElementById('cf-addr').value.trim(),poolSize:document.getElementById('cf-gal').value.trim(),poolType:document.getElementById('cf-type').value,notes:document.getElementById('cf-notes').value.trim()};}
function showAddCust(){Modal.show('Add Client',custForm(),()=>{const d=getCustData();if(!d)return;DB.addCustomer(d);Modal.hide();App.render();showToast('Client added');});}
function showEditCust(id){const c=DB.getCustomer(id);if(!c)return;Modal.show('Edit Client',custForm(c),()=>{const d=getCustData();if(!d)return;DB.updateCustomer(id,d);Modal.hide();App.render();showToast('Updated');});}
function delCust(id){Confirm.show('Remove this client?',()=>{DB.deleteCustomer(id);App.render();showToast('Removed');});}

/* ADMIN */
let adminTab='techs';
function renderAdmin(){
  if(!Auth.isAdmin)return`<div class="empty-state"><div class="empty-icon">🔒</div><div class="empty-title">Admin only</div></div>`;
  const tabs=['techs','routes'].map(t=>`<button class="filter-tab${adminTab===t?' active':''}" onclick="adminTab='${t}';App.render()">${t==='techs'?'Technicians':'Route Setup'}</button>`).join('');
  return`<div class="page-header"><div><div class="page-title">Admin</div><div class="page-subtitle">Route &amp; Team Management</div></div></div><div class="filter-tabs">${tabs}</div>${adminTab==='techs'?renderAdminTechs():renderAdminRoutes()}`;
}
function renderAdminTechs(){
  const list=DB.technicians.map(t=>`<div class="list-item"><div class="list-item-avatar" style="background:var(--navy);color:var(--champagne)">${esc(initials(t.name))}</div><div class="list-item-info"><div class="list-item-name">${esc(t.name)}${t.isAdmin?' 👑':''}</div><div class="list-item-sub">PIN: ${esc(t.pin||'—')}</div></div><div class="list-item-actions"><button class="btn btn-icon btn-sm" onclick="showEditTech('${esc(t.id)}')">✏️</button>${!t.isAdmin?`<button class="btn btn-icon btn-sm" style="background:var(--danger-light);color:var(--danger)" onclick="delTech('${esc(t.id)}')">🗑️</button>`:''}</div></div>`).join('');
  return`<div style="margin-top:8px">${list}<div style="padding:0 16px 16px"><button class="btn btn-primary" style="width:100%;justify-content:center" onclick="showAddTech()">+ Add Technician</button></div></div>`;
}
function renderAdminRoutes(){
  const tgs=DB.technicians.filter(t=>!t.isAdmin).map(t=>{const stops=DB.routes.filter(r=>r.technicianId===t.id).sort((a,b)=>a.dayOfWeek-b.dayOfWeek||a.stopOrder-b.stopOrder);const byDay=[1,2,3,4,5,6].map(d=>{const ds=stops.filter(s=>s.dayOfWeek===d);if(!ds.length)return'';return`<div class="route-day-block"><div class="route-day-hdr">${DAY_NAMES[d]}</div>${ds.map(s=>{const cust=DB.getCustomer(s.customerId);return`<div class="route-admin-stop"><span class="route-stop-num-sm">${s.stopOrder}</span><span>${esc(cust?cust.name:'?')}</span><span class="route-type-sm">${esc(s.serviceType)}</span><button class="btn btn-icon btn-sm" style="padding:4px" onclick="delRouteStop('${esc(s.id)}')">🗑️</button></div>`;}).join('')}</div>`;}).join('');return`<div class="card" style="margin-bottom:12px"><div class="card-header"><div class="card-title">${esc(t.name)} — Route ${stops[0]?.routeNumber||'?'}</div><button class="btn btn-sm btn-primary" onclick="showAddRouteStop('${esc(t.id)}')">+ Stop</button></div><div class="card-body">${byDay||'<p style="color:var(--gray-400);font-size:13px">No stops</p>'}</div></div>`;}).join('');
  return`<div style="padding:8px 16px">${tgs}</div>`;
}
function techForm(t={}){return`<div class="form-group"><label class="form-label">Full Name *</label><input class="form-control" id="tf-name" value="${esc(t.name||'')}"></div><div class="form-row"><div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="tf-phone" type="tel" value="${esc(t.phone||'')}"></div><div class="form-group"><label class="form-label">PIN (4–6 digits)*</label><input class="form-control" id="tf-pin" type="text" inputmode="numeric" maxlength="6" placeholder="1111" value="${esc(t.pin||'')}"></div></div>`;}
function getTechData(){const n=document.getElementById('tf-name').value.trim(),p=document.getElementById('tf-pin').value.trim();if(!n){alert('Name required.');return null;}if(!p||p.length<4){alert('PIN must be 4–6 digits.');return null;}return{name:n,phone:document.getElementById('tf-phone').value.trim(),email:'',pin:p,specialty:'Cleaning & Chemicals',isAdmin:false};}
function showAddTech(){Modal.show('Add Technician',techForm(),()=>{const d=getTechData();if(!d)return;DB.addTechnician(d);Modal.hide();App.render();showToast('Added');});}
function showEditTech(id){const t=DB.getTechnician(id);if(!t)return;Modal.show('Edit Technician',techForm(t),()=>{const d=getTechData();if(!d)return;DB.updateTechnician(id,d);Modal.hide();populateLoginDropdown();App.render();showToast('Updated');});}
function delTech(id){Confirm.show('Remove this technician?',()=>{DB.deleteTechnician(id);App.render();showToast('Removed');});}
function routeStopForm(techId){const num=DB.routes.find(r=>r.technicianId===techId)?.routeNumber||'';const max=DB.routes.filter(r=>r.technicianId===techId).length+1;return`<div class="form-group"><label class="form-label">Client *</label><select class="form-control" id="rs-cust"><option value="">— Select —</option>${customerOptions('')}</select></div><div class="form-row"><div class="form-group"><label class="form-label">Day *</label><select class="form-control" id="rs-day">${[1,2,3,4,5,6].map(d=>`<option value="${d}">${DAY_NAMES[d]}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Stop #</label><input class="form-control" id="rs-stop" type="number" min="1" value="${max}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Service Type</label><select class="form-control" id="rs-type">${['Weekly Clean','Chemical Check','Chemical Treatment','Filter Clean','Equipment Check','Green Pool Treatment','Inspection'].map(s=>`<option>${s}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Route #</label><input class="form-control" id="rs-route" value="${esc(num)}"></div></div>`;}
function showAddRouteStop(techId){const tech=DB.getTechnician(techId);Modal.show(`Add Stop — ${tech?tech.name:''}`,routeStopForm(techId),()=>{const cid=document.getElementById('rs-cust').value;const day=parseInt(document.getElementById('rs-day').value);if(!cid){alert('Please select a client.');return;}DB.addRoute({technicianId:techId,customerId:cid,dayOfWeek:day,stopOrder:parseInt(document.getElementById('rs-stop').value)||1,serviceType:document.getElementById('rs-type').value,routeNumber:document.getElementById('rs-route').value.trim()});Modal.hide();App.render();showToast('Stop added');});}
function delRouteStop(id){Confirm.show('Remove this route stop?',()=>{DB.deleteRoute(id);App.render();showToast('Removed');});}

/* ── ROUTER ────────────────────────────────────────────────────── */
const Router={current:'dashboard',navigate(view){this.current=view;document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));App.render();document.getElementById('main').scrollTop=0;}};

/* ── APP CONTROLLER ────────────────────────────────────────────── */
const App={
  _afterRender:null,
  render(){
    const m=document.getElementById('main');
    switch(Router.current){
      case 'dashboard': m.innerHTML=renderDashboard();  break;
      case 'route':     m.innerHTML=renderRoute();      break;
      case 'customers': m.innerHTML=renderCustomers();  break;
      case 'logs':      m.innerHTML=renderWorkOrders(); break;
      case 'admin':     m.innerHTML=renderAdmin();      break;
    }
    if(this._afterRender){const fn=this._afterRender;this._afterRender=null;setTimeout(fn,50);}
  },
  init(){
    DB.load(); seedDemoData(); DB.load(); // seed first, then reload
    Auth.load();
    document.querySelectorAll('.nav-item').forEach(el=>el.addEventListener('click',()=>Router.navigate(el.dataset.view)));
    document.getElementById('modal-save-btn').addEventListener('click',()=>Modal.save());
    document.getElementById('modal-close-btn').addEventListener('click',()=>Modal.hide());
    document.getElementById('modal-cancel-btn').addEventListener('click',()=>Modal.hide());
    document.getElementById('modal-overlay').addEventListener('click',e=>{if(e.target===document.getElementById('modal-overlay'))Modal.hide();});
    document.getElementById('confirm-cancel-btn').addEventListener('click',()=>Confirm.hide());
    document.getElementById('confirm-overlay').addEventListener('click',e=>{if(e.target===document.getElementById('confirm-overlay'))Confirm.hide();});
    // Dropdown is pre-populated in HTML; also dynamically update in case techs changed
    populateLoginDropdown();
    if(Auth.current){showAppShell();}
  }
};
document.addEventListener('DOMContentLoaded',()=>App.init());
