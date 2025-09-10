/* ==========================================
   Cronograma de Ensayos – AlegreMente 2025
   Lógica (script.js) — JSON -> TSV -> fallback
   ========================================== */

/* ---------- Configuración ---------- */
const TZ = 'America/Bogota';

// HOY dinámico en la zona de Bogotá (evita desfases de un día)
function todayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}
const HOY = todayISO();

// Fuente preferida: JSON local/servido
const DATA_URL_JSON = 'data.json';

// Respaldo: TSV publicado de Sheets
const TSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS1NNboTYyyWcE03e4GA8oz8y79DdeFlX1HNCMM1FbzG5LJon33IM87ReTKiJdYc41179gfRWYn0EsW/pub?gid=219655054&single=true&output=tsv';

/* ---------- Fechas clave (puedes editarlas aquí) ---------- */
const OBRA = { tipo:'obra', titulo:'Obra AlegreMente 2025', fecha:'2025-10-29', estado:'confirmado' };
const FECHAS_CLAVE = [
  { tipo:'ensayo', titulo:'Ensayo General 1', fecha:'2025-09-20', estado:'confirmado' },
  { tipo:'ensayo', titulo:'Ensayo General 2', fecha:'2025-10-18', estado:'confirmado' },
  { tipo:'ensayo', titulo:'Ensayo General 3', fecha:null,          estado:'pendiente' },
  OBRA
];

/* ---------- Datos base (fallback si falla JSON/TSV) ---------- */
let SCHEDULE = [
  { centro:'Arroyo',   fecha:'2025-09-10', hora:'14:00–16:00', responsable:'Erika López',  asistentes:['Juan P.','María L.','Sofía R.','Nicolás G.'], estado:'programado', jornada:'Tarde',  area:'Música' },
  { centro:'Lucero',   fecha:'2025-09-12', hora:'09:00–10:30', responsable:'S. Gutiérrez', asistentes:['Laura C.','Mateo Q.'],                      estado:'pendiente', jornada:'Mañana', area:'Danza' },
  { centro:'Jerusalén',fecha:'2025-09-13', hora:'10:00–12:00', responsable:'T. Sarmiento', asistentes:['Samuel D.','Valentina H.','Kevin T.'],       estado:'confirmado', jornada:'Mañana', area:'Teatro' },
];

/* ---------- Paleta por centro ---------- */
const BASE_COLORS = ['#3b82f6','#8b5cf6','#14b8a6','#f59e0b','#ef4444','#22c55e','#06b6d4','#a855f7','#e11d48'];
const CENTER_COLORS = Object.create(null);

/* ---------- Utilidades ---------- */
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const esc = s => (s+'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtDate = iso => {
  if (!iso) return 'Fecha pendiente';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return 'Fecha inválida';
  return d.toLocaleDateString('es-CO', { year:'numeric', month:'long', day:'numeric', timeZone:TZ });
};
const dow = iso => new Date(iso+'T00:00:00').toLocaleDateString('es-CO',{weekday:'long', timeZone:TZ});
const diffDays = (fromIso, toIso) => {
  if (!toIso) return null;
  const a = new Date(fromIso + 'T00:00:00');
  const b = new Date(toIso  + 'T00:00:00');
  return Math.round((b - a) / (1000*60*60*24));
};

// Normalización robusta de fechas con tolerancia a dd/mm/yy, mm/dd/yyyy, etc.
function normalizeDate(s){
  if (!s) return '';
  const t = (s+'').trim();

  // ISO directo
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  // dd/mm/yyyy | mm/dd/yyyy | dd-mm-yy | etc.
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (m){
    let a = parseInt(m[1],10);
    let b = parseInt(m[2],10);
    let y = parseInt(m[3],10);
    if (m[3].length === 2) y = (y < 50 ? 2000 + y : 1900 + y);

    let day, month;
    if (a > 12 && b <= 12){ day = a; month = b; }
    else if (b > 12 && a <= 12){ day = b; month = a; }
    else { day = a; month = b; } // ambiguo => dd/mm

    const dd = String(day).padStart(2,'0');
    const mm = String(month).padStart(2,'0');
    return `${y}-${mm}-${dd}`;
  }
  return t; // dejar tal cual si no coincide
}

function joinHora(hora, hi, hf){
  if (hora && hora.trim()) return hora.trim().replace('--','–').replace('-', '–');
  if (hi || hf){
    const a = (hi||'').trim(); const b = (hf||'').trim();
    if (a && b) return a+'–'+b;
    return (a||b);
  }
  return '';
}

function colorFor(centro){
  if (!CENTER_COLORS[centro]){
    const keys = Object.keys(CENTER_COLORS);
    CENTER_COLORS[centro] = BASE_COLORS[keys.length % BASE_COLORS.length];
  }
  return CENTER_COLORS[centro];
}

function normalizeHeader(h){
  return (h||'').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // quita acentos
    .replace(/\s+/g,'').trim();
}
function anyOf(arr, names){
  const canon = arr.map(normalizeHeader);
  for (const n of names.map(normalizeHeader)){
    const i = canon.indexOf(n);
    if (i !== -1) return i;
  }
  return -1;
}
function normalizeEstado(s){
  const v = (s||'').toString().toLowerCase();
  if (/confirmad/.test(v)) return 'confirmado';
  if (/pendient/.test(v))  return 'pendiente';
  if (/programad/.test(v) || /agendad/.test(v)) return 'programado';
  return v || '';
}

/* ========================================================
   FECHAS CLAVE
   ======================================================== */
function renderFechasClave(){
  const arr = [...FECHAS_CLAVE].sort((x,y)=>{
    if (!x.fecha && !y.fecha) return 0;
    if (!x.fecha) return 1;
    if (!y.fecha) return -1;
    return x.fecha.localeCompare(y.fecha);
  });

  setText('countConfirmados', arr.filter(x=>x.estado==='confirmado').length);
  setText('countPendientes',  arr.filter(x=>x.estado==='pendiente').length);
  setText('obraFechaTxt', fmtDate(OBRA.fecha));
  setText('kObraDOW', cap(dow(OBRA.fecha)));
  setText('kFaltan', Math.max(0, diffDays(HOY, OBRA.fecha)));

  const proximo = arr.find(x => x.fecha && x.fecha >= HOY);
  setText('kProximo', proximo ? fmtDate(proximo.fecha) : '—');

  const list = byId('listaFechas'); list.innerHTML = '';
  arr.forEach(f=>{
    const faltan = f.fecha ? diffDays(HOY, f.fecha) : null;
    const ribbonCls = f.estado==='pendiente' ? 'pending' : '';
    const icon = f.tipo === 'obra' ? '🎭' : '🎬';
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      ${f.estado!=='programado' ? `<div class="ribbon ${ribbonCls}">${cap(f.estado)}</div>` : ''}
      <div class="date">${fmtDate(f.fecha)}</div>
      <div>
        <div class="label"><b>${esc(f.titulo)}</b></div>
        <div class="tags">
          <span class="tag ${f.estado==='confirmado'?'ok':(f.estado==='pendiente'?'pending':'')}">${esc(f.estado)}</span>
          ${
            f.fecha
              ? (f.fecha >= HOY
                  ? `<span class="tag">faltan ${faltan} días</span>` 
                  : `<span class="tag">pasó hace ${Math.abs(faltan)} días</span>`)
              : `<span class="tag">fecha pendiente</span>`
          }
        </div>
      </div>
      <div style="text-align:right">${icon}</div>
    `;
    list.appendChild(el);
  });

  const hoyFmt = fmtDate(HOY);
  setText('hoyHeader', hoyFmt);
  setText('hoyTxt', hoyFmt);

  // Progress ring (placeholder)
  const ring = byId('ringProgress');
  if (ring) ring.setAttribute('stroke-dasharray', `0 100`);

  renderTimeline();
}

function renderTimeline(){
  // Aunque el CSS oculta .marks, mantenemos la lógica por si luego se desea mostrar.
  const row = byId('marks'); if (!row) return;
  row.innerHTML = '';
  const total = Math.max(1, diffDays(HOY, OBRA.fecha));

  const start = document.createElement('div'); start.className='mark today'; start.style.left='0%'; row.appendChild(start);

  FECHAS_CLAVE.forEach(f=>{
    if (!f.fecha) return;
    const pos = Math.max(0, Math.min(1, diffDays(HOY, f.fecha)/total));
    const m = document.createElement('div');
    m.className = 'mark'; m.style.left = (pos*100)+'%';
    m.title = `${f.titulo} · ${fmtDate(f.fecha)}`;
    row.appendChild(m);
  });

  const end = document.createElement('div'); end.className='mark'; end.style.left='100%'; row.appendChild(end);
  setText('lblStart','Hoy'); setText('lblEnd','Obra');
}

/* ========================================================
   MINI CALENDARIO
   ======================================================== */
const calDows = ['L','M','M','J','V','S','D'];
let calAnchor = new Date(HOY + 'T00:00:00');

function drawCalendar(){
  setText('calTitle', cap(calAnchor.toLocaleDateString('es-CO',{month:'long', year:'numeric', timeZone:TZ})));

  const dows = byId('calDows'); dows.innerHTML='';
  calDows.forEach(d=>{ const c=document.createElement('div'); c.className='cal-dow'; c.textContent=d; dows.appendChild(c); });

  const grid = byId('calGrid'); grid.innerHTML='';
  const first = new Date(calAnchor.getFullYear(), calAnchor.getMonth(), 1);
  const startIdx = (first.getDay()+6)%7; // lunes=0
  const daysInMonth = new Date(calAnchor.getFullYear(), calAnchor.getMonth()+1, 0).getDate();
  const prevMonthDays = new Date(calAnchor.getFullYear(), calAnchor.getMonth(), 0).getDate();

  for(let i=0;i<startIdx;i++){
    const n = prevMonthDays - startIdx + i + 1;
    grid.appendChild(calendarCell(new Date(calAnchor.getFullYear(), calAnchor.getMonth()-1, n), true));
  }
  for(let d=1; d<=daysInMonth; d++){
    grid.appendChild(calendarCell(new Date(calAnchor.getFullYear(), calAnchor.getMonth(), d), false));
  }
  while(grid.children.length < 42){
    const n = grid.children.length - (startIdx + daysInMonth) + 1;
    grid.appendChild(calendarCell(new Date(calAnchor.getFullYear(), calAnchor.getMonth()+1, n), true));
  }
}
function calendarCell(dateObj, dim){
  const iso = dateObj.toISOString().slice(0,10);
  const cell = document.createElement('div');
  cell.className = 'cal-cell' + (dim?' dim':''), cell.textContent = dateObj.getDate();
  if (FECHAS_CLAVE.some(f=>f.fecha===iso)) cell.classList.add('has');
  if (iso===HOY) cell.classList.add('active');
  cell.onclick = ()=>{
    setValue('fDesde', iso);
    setValue('fHasta', iso);
    renderTabla(); 
    updateSummaryChips();
  };
  return cell;
}

/* ========================================================
   Carga de datos (JSON -> TSV -> fallback)
   ======================================================== */
async function loadSchedule(){
  // 1) JSON (preferido)
  try{
    const r = await fetch(DATA_URL_JSON, {cache:'no-store'});
    if (r.ok){
      const json = await r.json();
      const rows = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
      const parsed = parseFromJSON(rows);
      if (parsed.length){ SCHEDULE = parsed; return; }
    }
  }catch(e){ console.warn('No se pudo cargar data.json', e); }

  // 2) TSV (respaldo)
  try{
    const resp = await fetch(TSV_URL, { cache: 'no-store' });
    const text = await resp.text();
    const rows = parseTSV(text);
    if (rows && rows.length){ SCHEDULE = rows; return; }
  }catch(e){
    console.warn('No se pudo cargar el TSV, usando datos base.', e);
  }
}

// Adaptador JSON
function parseFromJSON(rows){
  const out = [];
  for (const raw of rows){
    if (!raw) continue;
    const centro = (raw.centro ?? raw.sede ?? '').toString().trim();
    const fecha  = normalizeDate(raw.fecha ?? raw.fecha_evento ?? raw.fechaevento ?? '');
    const hora   = joinHora(raw.hora ?? '', raw.hora_inicio ?? '', raw.hora_fin ?? '');
    const responsable = (raw.responsable ?? raw.docente ?? raw.lider ?? raw['líder'] ?? '').toString().trim();
    const estado = normalizeEstado(raw.estado ?? raw.status ?? '');
    const jornada= (raw.jornada ?? raw.turno ?? '').toString().trim();
    const area   = (raw.area ?? raw['área'] ?? raw.categoria ?? raw['categoría'] ?? '').toString().trim();

    let asistentes = [];
    if (Array.isArray(raw.asistentes)) asistentes = raw.asistentes.map(s=>String(s).trim()).filter(Boolean);
    else if (raw.asistentes) asistentes = String(raw.asistentes).split(/[;,]/).map(s=>s.trim()).filter(Boolean);

    if (!centro && !fecha && !hora) continue; // fila vacía
    out.push({ centro, fecha, hora, responsable, estado, jornada, area, asistentes });
  }
  return out;
}

// Parser TSV compatible con cabeceras variadas
function parseTSV(text){
  const clean = (text||'').replace(/^\uFEFF/, '').trim();
  if (!clean) return null;
  const lines = clean.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;

  const headersRaw = lines[0].split('\t');
  const iCentro = anyOf(headersRaw, ['centro','sede']);
  const iFecha  = anyOf(headersRaw, ['fecha','date','fechaevento']);
  const iHora   = anyOf(headersRaw, ['hora','horario']);
  const iHI     = anyOf(headersRaw, ['hora_inicio','inicio']);
  const iHF     = anyOf(headersRaw, ['hora_fin','fin']);
  const iResp   = anyOf(headersRaw, ['responsable','docente','lider','líder']);
  const iEstado = anyOf(headersRaw, ['estado','status']);
  const iJor    = anyOf(headersRaw, ['jornada','turno']);
  const iArea   = anyOf(headersRaw, ['area','área','categoria','categoría']);
  const iAsis   = anyOf(headersRaw, ['asistentes','participantes','chicos','alumnos','niños','ninos']);

  const out = [];
  for (let r=1; r<lines.length; r++){
    const cols = lines[r].split('\t');
    const centro = (cols[iCentro]||'').trim();
    const fecha  = normalizeDate((cols[iFecha]||'').trim());
    const hora   = joinHora((cols[iHora]||''), (cols[iHI]||''), (cols[iHF]||''));
    const responsable = (cols[iResp]||'').trim();
    const estado = normalizeEstado((cols[iEstado]||'').trim());
    const jornada = (cols[iJor]||'').trim();
    const area = (cols[iArea]||'').trim();
    const asistentesStr = (cols[iAsis]||'').trim();
    const asistentes = asistentesStr ? asistentesStr.split(/[;,]/).map(s=>s.trim()).filter(Boolean) : [];

    if (!centro && !fecha && !hora) continue;
    out.push({ centro, fecha, hora, responsable, estado, jornada, area, asistentes });
  }
  return out;
}

/* ========================================================
   Programación por Centros (TABLA)
   ======================================================== */
function hydrateFilters(){
  // Centros
  const select = byId('fCentro');
  const centers = Array.from(new Set(SCHEDULE.map(r=>r.centro).filter(Boolean))).sort();
  select.innerHTML = '<option value="">Todos los centros</option>';
  centers.forEach(c=>{
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c;
    select.appendChild(opt);
    colorFor(c);
  });
  // Áreas
  const selArea = byId('fArea');
  const areas = Array.from(new Set(SCHEDULE.map(r=>r.area).filter(Boolean))).sort();
  selArea.innerHTML = '<option value="">Todas las áreas</option>';
  areas.forEach(a=>{ const o=document.createElement('option'); o.value=a; o.textContent=a; selArea.appendChild(o); });
}

// Filtra por defecto SOLO PRÓXIMOS (fecha >= HOY) + filtros UI
function filteredRows(){
  const centro = getValue('fCentro') || '';
  const desde  = getValue('fDesde')  || '';
  const hasta  = getValue('fHasta')  || '';
  const estado = getValue('fEstado') || '';
  const area   = getValue('fArea')   || '';

  let rows = SCHEDULE.slice();

  // 1) Solo próximos
  rows = rows.filter(r => (r.fecha || '') >= HOY);

  // 2) Filtros UI
  if (centro) rows = rows.filter(r=> r.centro === centro);
  if (estado) rows = rows.filter(r=> r.estado === estado);
  if (area)   rows = rows.filter(r=> (r.area||'') === area);
  if (desde)  rows = rows.filter(r=> (r.fecha||'') >= desde);
  if (hasta)  rows = rows.filter(r=> (r.fecha||'') <= hasta);

  rows.sort((a,b)=> (a.fecha||'').localeCompare(b.fecha||'') || (a.centro||'').localeCompare(b.centro||''));
  return rows;
}

/* Render chips de asistentes: muestra hasta 3 y “+N” (title con lista completa) */
function renderAsistentesChips(asistentes){
  const list = Array.isArray(asistentes) ? asistentes : [];
  if (list.length === 0) return '<span class="meta">—</span>';
  const show = list.slice(0,3);
  const more = list.length - show.length;
  const chips = show.map(n=>`<span class="attendee">${esc(n)}</span>`).join(' ');
  const morePill = more>0 ? ` <span class="attendee more" title="${esc(list.join(', '))}">+${more}</span>` : '';
  return `<div class="attendees">${chips}${morePill}</div>`;
}

function renderTabla(){
  const body = byId('tbodyCentros'); 
  body.innerHTML = '';
  const rows = filteredRows();

  rows.forEach(r=>{
    const color = colorFor(r.centro || '—');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge" style="border-color:${color};color:${color};background:#fff">${esc(r.centro||'')}</span></td>
      <td>${fmtDate(r.fecha||'')}</td>
      <td>${esc(r.hora||'')}</td>
      <td>${esc(r.responsable||'')}</td>
      <td>${renderAsistentesChips(r.asistentes)}</td>
      <td class="state ${esc(r.estado||'')}">${cap(r.estado||'')}</td>
      <td>${esc(r.jornada||'')}</td>
      <td>${esc(r.area||'')}</td>
    `;
    body.appendChild(tr);
  });

  // Fallback JS (por si el navegador no soporta :has() en CSS):
  toggleNoEventsMessage(rows.length === 0);
}

/* Resumen de filtros (chips) */
function updateSummaryChips(){
  const box   = byId('summaryChips');
  const centro= getValue('fCentro');
  const desde = getValue('fDesde');
  const hasta = getValue('fHasta');
  const estado= getValue('fEstado');
  const area  = getValue('fArea');
  const chips = [];
  if (centro) chips.push(`<span class="chip">${esc(centro)}</span>`);
  if (estado) chips.push(`<span class="chip">${esc(cap(estado))}</span>`);
  if (area)   chips.push(`<span class="chip">Área: ${esc(area)}</span>`);
  if (desde || hasta) chips.push(`<span class="chip">Rango: ${esc(desde||'—')} → ${esc(hasta||'—')}</span>`);
  chips.push('<button class="viewbtn" id="sumClear">Limpiar</button>');
  box.innerHTML = chips.join(' ');
  const btn = byId('sumClear');
  if (btn) btn.onclick = ()=>{
    setValue('fCentro',''); setValue('fDesde',''); setValue('fHasta',''); setValue('fEstado',''); setValue('fArea','');
    renderTabla(); updateSummaryChips();
  };
}

/* ---------- Mensaje “No hay eventos hoy.” (fallback JS) ---------- */
function toggleNoEventsMessage(show){
  const wrap = byId('viewTabla');
  if (!wrap) return;
  let msg = wrap.querySelector('.no-events-msg');
  if (show){
    if (!msg){
      msg = document.createElement('div');
      msg.className = 'no-events-msg';
      msg.setAttribute('aria-live','polite');
      msg.style.display = 'flex';
      msg.style.alignItems = 'center';
      msg.style.justifyContent = 'center';
      msg.style.padding = '40px';
      msg.style.color = 'var(--muted)';
      msg.style.fontSize = '14px';
      msg.textContent = 'No hay eventos hoy.';
      wrap.appendChild(msg);
    }
  }else if (msg){
    msg.remove();
  }
}

/* ========================================================
   Eventos UI
   ======================================================== */
function wireUI(){
  onClick('btnPrint', ()=>window.print());

  // Auto-filtrado: al cambiar cualquier filtro se renderiza de una vez
  const auto = ()=>{ renderTabla(); updateSummaryChips(); };
  ['fCentro','fDesde','fHasta','fEstado','fArea']
    .map(id => byId(id))
    .forEach(el => { if (el) el.addEventListener('change', auto); });

  // Botón Limpiar (barra)
  onClick('btnLimpiar', ()=>{ 
    setValue('fCentro',''); setValue('fDesde',''); setValue('fHasta',''); setValue('fEstado',''); setValue('fArea',''); 
    renderTabla(); updateSummaryChips(); 
  });

  onClick('calPrev', ()=>{ calAnchor.setMonth(calAnchor.getMonth()-1); drawCalendar(); });
  onClick('calNext', ()=>{ calAnchor.setMonth(calAnchor.getMonth()+1); drawCalendar(); });
}

/* ========================================================
   Init
   ======================================================== */
(async function init(){
  // Carga de datos con preferencia JSON
  await loadSchedule();

  // Paleta por centro (pre-cálculo)
  Array.from(new Set(SCHEDULE.map(r=>r.centro))).forEach(colorFor);

  // UI
  hydrateFilters();
  renderFechasClave();
  drawCalendar();
  renderTabla();
  updateSummaryChips();
  wireUI();

  // “Hoy es …” en header y pie ya se renderiza dentro de renderFechasClave()
})();

/* ---------- Helpers DOM ---------- */
function byId(id){ return document.getElementById(id); }
function setText(id, txt){ const el = byId(id); if (el) el.textContent = txt; }
function setValue(id, val){ const el = byId(id); if (el) el.value = val; }
function getValue(id){ const el = byId(id); return el ? el.value : ''; }
function onClick(id, fn){ const el = byId(id); if (el) el.onclick = fn; }

