'use strict';
/* Sabyx Atlas — Sabyx Labs. Local-first, no network, no tracking. */

// STATE
const TYPES = {
  Person:{i:'👤',c:'#6b9bd1'}, Organization:{i:'🏢',c:'#8a7fd1'}, Project:{i:'🚀',c:'#4fb3a5'},
  Note:{i:'📝',c:'#c9b458'}, Document:{i:'📄',c:'#8b97a8'}, Idea:{i:'💡',c:'#d19a5a'},
  Task:{i:'✅',c:'#7bb26b'}, Event:{i:'📅',c:'#d1707f'}, Finance:{i:'💰',c:'#5fa8c9'}, Custom:{i:'◆',c:'#9a9a9a'}
};
const RELS = ['owns','contains','created by','related to','depends on','manages','part of','assigned to'];
const W = 176, H = 76, NS = 'http://www.w3.org/2000/svg';
const S = {
  nodes:[], rels:[], byId:new Map(), deg:new Map(),
  settings:{theme:'dark', labels:true, anim:true, layout:'circle'},
  sel:null, focus:null, fpos:null, connectFrom:null, newId:null,
  view:{x:0,y:0,k:1}, filters:{type:'',tag:'',conn:'',from:''}
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const now = () => new Date().toISOString();
const uid = p => p + '_' + (crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const escH = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const parseTags = s => [...new Set(String(s || '').split(/[,;|]/).map(t => t.trim()).filter(Boolean))].slice(0, 20);
const svgEl = (t, a = {}, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const ICONS = {
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
  up:'<path d="M12 15V4m0 0L8 8m4-4 4 4M4 15v4h16v-4"/>', down:'<path d="M12 4v11m0 0-4-4m4 4 4-4M4 19h16"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>', x:'<path d="M6 6l12 12M18 6 6 18"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 10 18.7l1-1"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>', trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  fit:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'
};
const hydrate = root => $$('i[data-i]', root).forEach(i => { i.outerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[i.dataset.i] || ''}</svg>`; });

// DATABASE
let db;
const dbOpen = () => new Promise((res, rej) => {
  if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
  const r = indexedDB.open('sabyx-atlas', 1);
  r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('nodes', {keyPath:'id'}); d.createObjectStore('relationships', {keyPath:'id'}); d.createObjectStore('settings', {keyPath:'key'}); };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const dbTx = (stores, fn) => new Promise((res, rej) => {
  const t = db.transaction(stores, 'readwrite');
  fn(Array.isArray(stores) ? stores.map(s => t.objectStore(s)) : t.objectStore(stores));
  t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error);
});
const dbAll = s => new Promise((res, rej) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function persist(fn) { try { await fn(); return true; } catch (e) { console.error(e); toast('Could not save to local storage on this device.', 'err'); return false; } }
const saveNodes = list => persist(() => dbTx('nodes', s => list.forEach(n => s.put(n))));
const saveRels = list => persist(() => dbTx('relationships', s => list.forEach(r => s.put(r))));
const saveSettings = () => persist(() => dbTx('settings', s => s.put({key:'app', value:S.settings})));
const replaceAll = (nodes, rels) => persist(() => dbTx(['nodes','relationships'], ([a, b]) => { a.clear(); b.clear(); nodes.forEach(n => a.put(n)); rels.forEach(r => b.put(r)); }));

// NODES
function sanNode(o) {
  if (!o || typeof o.id !== 'string' || !o.id || typeof o.name !== 'string' || !o.name.trim()) return null;
  const t = typeof o.createdAt === 'string' && !isNaN(Date.parse(o.createdAt)) ? o.createdAt : now();
  return {
    id:o.id, name:o.name.trim().slice(0, 200), description:String(o.description || '').slice(0, 1000),
    type:TYPES[o.type] ? o.type : 'Custom', tags:Array.isArray(o.tags) ? parseTags(o.tags.join(',')) : [],
    date:/^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : '', x:Number.isFinite(o.x) ? o.x : null, y:Number.isFinite(o.y) ? o.y : null,
    createdAt:t, updatedAt:typeof o.updatedAt === 'string' && !isNaN(Date.parse(o.updatedAt)) ? o.updatedAt : t
  };
}
const validRel = r => r && typeof r.id === 'string' && typeof r.from === 'string' && typeof r.to === 'string' && typeof r.label === 'string' && r.label.trim();
function reindex() {
  S.byId = new Map(S.nodes.map(n => [n.id, n])); S.deg = new Map();
  for (const r of S.rels) { S.deg.set(r.from, (S.deg.get(r.from) || 0) + 1); S.deg.set(r.to, (S.deg.get(r.to) || 0) + 1); }
}
function layout(list) {
  if (!list.length) return;
  const ex = S.nodes.filter(n => n.x != null && !list.includes(n));
  const by = ex.length ? ex.reduce((m, n) => Math.max(m, n.y), -Infinity) + 150 : 0;
  if (S.settings.layout === 'grid') {
    const c = Math.ceil(Math.sqrt(list.length));
    list.forEach((n, i) => { n.x = (i % c) * 220; n.y = by + Math.floor(i / c) * 110; });
  } else {
    const R = Math.max(200, list.length * (W + 30) / (2 * Math.PI));
    list.forEach((n, i) => { const a = i / list.length * 2 * Math.PI - Math.PI / 2; n.x = R + R * Math.cos(a) - W / 2; n.y = by + R + R * Math.sin(a) - H / 2; });
  }
}
async function createNode(d) {
  const t = now(), c = viewCenter();
  const n = {id:uid('n'), name:d.name.trim(), description:d.description.trim(), type:d.type, tags:parseTags(d.tags), date:d.date || '',
    x:c.x - W / 2 + (Math.random() - .5) * 90, y:c.y - H / 2 + (Math.random() - .5) * 90, createdAt:t, updatedAt:t};
  S.nodes.push(n);
  if (!(await saveNodes([n]))) { S.nodes.pop(); return; }
  clearFilters(true); S.newId = n.id; S.sel = n.id;
  renderAll(); centerOn(n.id); toast('Node created');
  setTimeout(() => { S.newId = null; }, 600);
}
async function updateNode(n, patch) {
  Object.assign(n, patch, {updatedAt:now()});
  if (await saveNodes([n])) { toast('Changes saved'); renderAtlas(); refreshChrome(); const m = $('#dMeta'); if (m) m.innerHTML = metaHtml(n); }
}
async function deleteNode(id) {
  const n = S.byId.get(id); if (!n) return;
  const links = S.rels.filter(r => r.from === id || r.to === id);
  if (!(await ask(`Delete “${n.name}”${links.length ? ` and its ${links.length} connection(s)` : ''}? This cannot be undone.`, 'Delete'))) return;
  const ok = await persist(() => dbTx(['nodes','relationships'], ([a, b]) => { a.delete(id); links.forEach(r => b.delete(r.id)); }));
  if (!ok) return;
  S.nodes = S.nodes.filter(x => x.id !== id); S.rels = S.rels.filter(r => r.from !== id && r.to !== id);
  if (S.focus === id) setFocus(null);
  S.sel = null; renderAll(); toast('Node deleted');
}

// RELATIONSHIPS
async function createRel(from, to, label, quiet) {
  label = label.trim().slice(0, 60);
  if (!label || from === to) return null;
  if (S.rels.some(r => r.from === from && r.to === to && r.label.toLowerCase() === label.toLowerCase())) return null;
  const r = {id:uid('r'), from, to, label, createdAt:now()};
  S.rels.push(r);
  if (quiet) return r;
  if (!(await saveRels([r]))) { S.rels.pop(); return null; }
  renderAll(); toast('Relationship created'); return r;
}
async function deleteRel(id) {
  const r = S.rels.find(x => x.id === id); if (!r) return;
  const a = S.byId.get(r.from), b = S.byId.get(r.to);
  if (!(await ask(`Delete relationship “${a ? a.name : '?'} ${r.label} ${b ? b.name : '?'}”?`, 'Delete'))) return;
  if (!(await persist(() => dbTx('relationships', s => s.delete(id))))) return;
  S.rels = S.rels.filter(x => x.id !== id);
  if (S.focus) setFocus(S.focus); else renderAll();
  toast('Relationship deleted');
}
function startConnect() {
  if (!S.sel) return toast('Select a node first, then press Connect.');
  S.connectFrom = S.sel; refreshChrome();
}
function pickTarget(id) {
  const a = S.byId.get(S.connectFrom), b = S.byId.get(id);
  if (!a || !b || a === b) return;
  $('#relInfo').textContent = `${a.name} → ${b.name}`;
  $('#rSel').innerHTML = [...RELS, 'custom…'].map(r => `<option>${escH(r)}</option>`).join('');
  $('#rCustomL').hidden = true; $('#rCustom').value = '';
  $('#fRel').dataset.to = id; openDlg($('#dlgRel'));
}

// ATLAS
const world = $('#world'), svg = $('#atlas'), canvas = $('#canvas');
let edgeEls = [], nodeEls = new Map();
const P = n => (S.focus && S.fpos && S.fpos[n.id]) || n;
function visibleNodes() {
  if (S.focus && S.fpos) return S.nodes.filter(n => S.fpos[n.id]);
  const f = S.filters;
  return S.nodes.filter(n => (!f.type || n.type === f.type) && (!f.tag || n.tags.includes(f.tag)) &&
    (!f.conn || ((S.deg.get(n.id) || 0) > 0) === (f.conn === 'y')) && (!f.from || (n.date || n.createdAt.slice(0, 10)) >= f.from));
}
function renderAtlas() {
  reindex();
  const vis = visibleNodes(), ids = new Set(vis.map(n => n.id)), sel = S.sel, nb = new Set();
  world.textContent = ''; edgeEls = []; nodeEls = new Map();
  const gE = svgEl('g', {}, world), gN = svgEl('g', {}, world);
  if (sel) S.rels.forEach(r => { if (r.from === sel) nb.add(r.to); if (r.to === sel) nb.add(r.from); });
  const inView = S.rels.filter(r => ids.has(r.from) && ids.has(r.to));
  const showAll = S.settings.labels && inView.length <= 80;
  for (const r of inView) {
    const hl = sel && (r.from === sel || r.to === sel);
    const g = svgEl('g', {class:'edge' + (hl ? ' hl' : sel ? ' dim' : '')}, gE);
    const ln = svgEl('line', {class:'ln'}, g), hit = svgEl('line', {class:'hit', 'data-rid':r.id}, g);
    let lb = null;
    if (S.settings.labels && (showAll || hl)) { lb = svgEl('text', {class:'elab'}, g); lb.textContent = r.label; }
    edgeEls.push({r, ln, hit, lb});
  }
  for (const n of vis) {
    const t = TYPES[n.type], d = S.deg.get(n.id) || 0;
    const cls = 'node' + (n.id === sel ? ' sel' : '') + (sel && n.id !== sel && !nb.has(n.id) ? ' dim' : '') + (n.id === S.newId ? ' new' : '');
    const g = svgEl('g', {class:cls, 'data-id':n.id, tabindex:0, role:'button', 'aria-label':`${n.type}: ${n.name}, ${d} connection${d === 1 ? '' : 's'}`}, gN);
    svgEl('rect', {class:'card', width:W, height:H, rx:10}, g);
    svgEl('rect', {width:4, height:H - 20, x:0, y:10, rx:2, fill:t.c}, g);
    const put = (cl, x, y, txt, extra = {}) => { const e = svgEl('text', {class:cl, x, y, ...extra}, g); e.textContent = txt; };
    put('ic', 14, 29, t.i); put('nm', 38, 27, clip(n.name, 19));
    if (n.description) put('ds', 14, 47, clip(n.description, 27));
    put('ty', 14, 66, n.type.toUpperCase());
    put('ds', W - 12, 66, d ? `${d} link${d === 1 ? '' : 's'}` : '', {'text-anchor':'end'});
    nodeEls.set(n.id, g);
  }
  positionAll();
}
function positionNode(n) {
  const g = nodeEls.get(n.id), p = P(n); if (g) g.style.transform = `translate(${p.x}px,${p.y}px)`;
  for (const e of edgeEls) if (e.r.from === n.id || e.r.to === n.id) positionEdge(e);
}
function positionEdge(e) {
  const a = S.byId.get(e.r.from), b = S.byId.get(e.r.to); if (!a || !b) return;
  const pa = P(a), pb = P(b), x1 = pa.x + W / 2, y1 = pa.y + H / 2, x2 = pb.x + W / 2, y2 = pb.y + H / 2;
  for (const l of [e.ln, e.hit]) { l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2); }
  if (e.lb) { e.lb.setAttribute('x', (x1 + x2) / 2); e.lb.setAttribute('y', (y1 + y2) / 2 - 4); }
}
function positionAll() { edgeEls.forEach(positionEdge); for (const [id, g] of nodeEls) { const p = P(S.byId.get(id)); g.style.transform = `translate(${p.x}px,${p.y}px)`; } }
function applyView() {
  const v = S.view; world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
  canvas.style.backgroundPosition = `${v.x}px ${v.y}px`; canvas.style.backgroundSize = `${24 * v.k}px ${24 * v.k}px`;
}
function smooth() { if (!S.settings.anim) return; world.classList.add('smooth'); setTimeout(() => world.classList.remove('smooth'), 450); }
function viewCenter() { const r = canvas.getBoundingClientRect(), v = S.view; return {x:(r.width / 2 - v.x) / v.k, y:(r.height / 2 - v.y) / v.k}; }
function zoomAt(f, cx, cy) {
  const r = canvas.getBoundingClientRect(), v = S.view, px = cx - r.left, py = cy - r.top, nk = clamp(v.k * f, .15, 2.5);
  v.x = px - (px - v.x) * nk / v.k; v.y = py - (py - v.y) * nk / v.k; v.k = nk; applyView();
}
function zoomBtn(f) { const r = canvas.getBoundingClientRect(); smooth(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); }
function fit() {
  const r = canvas.getBoundingClientRect(), list = visibleNodes(); smooth();
  if (!list.length) { S.view = {x:r.width / 2, y:r.height / 2, k:1}; return applyView(); }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of list) { const p = P(n); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + W); y1 = Math.max(y1, p.y + H); }
  const k = clamp(Math.min((r.width - 80) / (x1 - x0), (r.height - 120) / (y1 - y0)), .15, 1.2);
  S.view = {k, x:r.width / 2 - (x0 + x1) / 2 * k, y:r.height / 2 - (y0 + y1) / 2 * k}; applyView();
}
function centerOn(id) {
  const n = S.byId.get(id); if (!n) return; const r = canvas.getBoundingClientRect(), p = P(n), k = Math.max(S.view.k, .8);
  smooth(); S.view = {k, x:r.width / 2 - (p.x + W / 2) * k, y:r.height / 2 - (p.y + H / 2) * k}; applyView();
}
function setFocus(id) {
  S.focus = id; S.fpos = null;
  if (id) {
    const nb = [...new Set(S.rels.filter(r => r.from === id || r.to === id).map(r => r.from === id ? r.to : r.from))].filter(x => S.byId.has(x));
    S.fpos = {[id]:{x:-W / 2, y:-H / 2}}; S.sel = id;
    const R = Math.max(260, nb.length * (W + 40) / (2 * Math.PI));
    nb.forEach((x, i) => { const a = i / nb.length * 2 * Math.PI - Math.PI / 2; S.fpos[x] = {x:R * Math.cos(a) - W / 2, y:R * Math.sin(a) - H / 2}; });
  }
  svg.classList.toggle('tr', !!S.settings.anim); setTimeout(() => svg.classList.remove('tr'), 500);
  renderAll(); fit();
}
function select(id, center) {
  S.sel = id; if (S.focus && id && !(S.fpos && S.fpos[id])) setFocus(null);
  renderAll(); if (center && id) centerOn(id);
}

// INTERACTION
const ptrs = new Map(); let drag = null, pan = null, pinch = null;
svg.addEventListener('pointerdown', e => {
  svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (ptrs.size === 2) { drag = pan = null; const [a, b] = [...ptrs.values()]; pinch = {d:Math.hypot(a.x - b.x, a.y - b.y), cx:(a.x + b.x) / 2, cy:(a.y + b.y) / 2}; return; }
  const g = e.target.closest('.node'), h = e.target.closest('.hit');
  if (g) { const n = S.byId.get(g.dataset.id); drag = {id:n.id, sx:e.clientX, sy:e.clientY, ox:n.x, oy:n.y, moved:false}; }
  else pan = {sx:e.clientX, sy:e.clientY, vx:S.view.x, vy:S.view.y, moved:false, rid:h ? h.dataset.rid : null};
});
svg.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    S.view.x += cx - pinch.cx; S.view.y += cy - pinch.cy; zoomAt(d / pinch.d, cx, cy); pinch = {d, cx, cy}; return;
  }
  if (drag) {
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (S.focus) return; drag.moved = true;
    const n = S.byId.get(drag.id); n.x = drag.ox + dx / S.view.k; n.y = drag.oy + dy / S.view.k; positionNode(n);
  } else if (pan) {
    const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy; if (!pan.moved && Math.hypot(dx, dy) < 4) return;
    pan.moved = true; S.view.x = pan.vx + dx; S.view.y = pan.vy + dy; applyView();
  }
});
const endPtr = e => {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  if (drag) {
    const d = drag; drag = null;
    if (d.moved) saveNodes([S.byId.get(d.id)]);
    else if (S.connectFrom) { if (d.id !== S.connectFrom) pickTarget(d.id); }
    else select(d.id);
  } else if (pan) {
    const p = pan; pan = null;
    if (!p.moved) { if (p.rid) deleteRel(p.rid); else if (S.connectFrom) { S.connectFrom = null; refreshChrome(); } else if (S.sel) select(null); }
  }
};
svg.addEventListener('pointerup', endPtr); svg.addEventListener('pointercancel', endPtr);
svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * .0015), e.clientX, e.clientY); }, {passive:false});
svg.addEventListener('keydown', e => {
  const g = e.target.closest && e.target.closest('.node');
  if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (S.connectFrom) { if (g.dataset.id !== S.connectFrom) pickTarget(g.dataset.id); } else select(g.dataset.id); }
});

// CSV
function parseCSV(t) {
  t = t.replace(/^\uFEFF/, ''); const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; r.push(f); f = ''; rows.push(r); r = []; }
    else f += c;
  }
  if (q) throw new Error('Unclosed quotation mark');
  if (f !== '' || r.length) { r.push(f); rows.push(r); }
  return rows.filter(x => x.some(v => v.trim() !== ''));
}
const csvEsc = v => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCSV = rows => rows.map(r => r.map(csvEsc).join(',')).join('\r\n');
function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], {type:mime})), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
function exportNodes() {
  download(`sabyx-atlas-nodes-${stamp()}.csv`, toCSV([['ID','Name','Type','Description','Tags','Date','CreatedAt','UpdatedAt'], ...S.nodes.map(n => [n.id, n.name, n.type, n.description, n.tags.join(';'), n.date, n.createdAt, n.updatedAt])]), 'text/csv');
  toast('Nodes exported');
}
function exportRels() {
  const nm = id => (S.byId.get(id) || {name:id}).name;
  download(`sabyx-atlas-relationships-${stamp()}.csv`, toCSV([['ID','From','Relationship','To','CreatedAt'], ...S.rels.map(r => [r.id, nm(r.from), r.label, nm(r.to), r.createdAt])]), 'text/csv');
  toast('Relationships exported');
}
async function importCSVFile(file) {
  if (!file) return;
  let rows;
  try { rows = parseCSV(await file.text()); } catch (e) { return summary('Import failed', 'This file could not be read as CSV. Check that it is a valid, complete CSV file.'); }
  if (rows.length < 1) return summary('Import failed', 'The file is empty.');
  const h = rows[0].map(x => x.trim().toLowerCase()), ix = k => h.indexOf(k), body = rows.slice(1);
  if (!body.length) return summary('Nothing to import', 'The file has a header row but no records.');
  if (ix('from') > -1 && ix('to') > -1) return importRels(body, ix);
  if (ix('name') > -1) return importNodes(body, ix);
  summary('Missing headers', 'Expected headers <b>Name,Type,Description,Tags</b> for nodes, or <b>From,Relationship,To</b> for relationships.', true);
}
async function importNodes(rows, ix) {
  const key = (n, t) => n.trim().toLowerCase() + '|' + t, seen = new Set(S.nodes.map(n => key(n.name, n.type))), ids = new Set(S.byId.keys());
  const get = (r, k) => ix(k) > -1 ? (r[ix(k)] || '').trim() : '';
  const fresh = [], issues = []; let dup = 0;
  rows.forEach((r, i) => {
    const name = get(r, 'name'); if (!name) { issues.push(`Row ${i + 2}: missing name, skipped`); return; }
    const tp = Object.keys(TYPES).find(k => k.toLowerCase() === get(r, 'type').toLowerCase()) || (get(r, 'type') ? 'Custom' : 'Note');
    if (seen.has(key(name, tp))) { dup++; return; } seen.add(key(name, tp));
    let id = get(r, 'id'); if (!id || ids.has(id)) id = uid('n'); ids.add(id);
    const date = get(r, 'date'), c = get(r, 'createdat'), u = get(r, 'updatedat');
    const t = c && !isNaN(Date.parse(c)) ? new Date(c).toISOString() : now();
    fresh.push({id, name:name.slice(0, 200), description:get(r, 'description').slice(0, 1000), type:tp, tags:parseTags(get(r, 'tags')), date:/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '', x:null, y:null, createdAt:t, updatedAt:u && !isNaN(Date.parse(u)) ? new Date(u).toISOString() : t});
  });
  layout(fresh);
  if (fresh.length) { if (!(await saveNodes(fresh))) return; S.nodes.push(...fresh); clearFilters(true); renderAll(); fit(); }
  toast(fresh.length ? 'CSV imported successfully' : 'No new records imported'); if (dup) setTimeout(() => toast(`${dup} duplicate records skipped`), 400);
  summary('Imported successfully', `<div class="big"><b>${fresh.length}</b> records added<br><b>${dup}</b> duplicate records skipped (existing records are never overwritten)</div>`, true, issues);
}
async function importRels(rows, ix) {
  const map = new Map(); S.nodes.forEach(n => { const k = n.name.toLowerCase(); if (!map.has(k)) map.set(k, n.id); });
  const find = v => S.byId.has(v) ? v : map.get(v.toLowerCase()), get = (r, k) => ix(k) > -1 ? (r[ix(k)] || '').trim() : '';
  const added = [], issues = []; let dup = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], f = get(r, 'from'), t = get(r, 'to'), l = get(r, 'relationship') || get(r, 'label') || 'related to';
    if (!f || !t) { issues.push(`Row ${i + 2}: From or To is empty`); continue; }
    const a = find(f), b = find(t);
    if (!a || !b) { issues.push(`Row ${i + 2}: node not found — ${[!a && `“${f}”`, !b && `“${t}”`].filter(Boolean).join(', ')}`); continue; }
    const rel = await createRel(a, b, l, true); if (rel) added.push(rel); else dup++;
  }
  if (added.length && !(await saveRels(added))) { S.rels = S.rels.filter(r => !added.includes(r)); return; }
  renderAll(); toast(added.length ? 'CSV imported successfully' : 'No new relationships imported');
  summary('Relationships imported', `<div class="big"><b>${added.length}</b> relationships added<br><b>${dup}</b> duplicates or self-links skipped<br><b>${issues.length}</b> rows with problems</div>`, true, issues);
}
function summary(title, msg, html, issues = []) {
  $('#sumT').textContent = title;
  $('#sumB').innerHTML = (html ? msg : escH(msg)) + (issues.length ? `<ul>${issues.slice(0, 50).map(i => `<li>${escH(i)}</li>`).join('')}${issues.length > 50 ? `<li>…and ${issues.length - 50} more</li>` : ''}</ul>` : '');
  openDlg($('#dlgSum'));
}

// JSON BACKUP
function backupJSON() {
  download(`sabyx-atlas-backup-${stamp()}.json`, JSON.stringify({version:1, exportedAt:now(), nodes:S.nodes, relationships:S.rels, settings:S.settings}, null, 2), 'application/json');
  toast('Backup created');
}
function validateBackup(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.nodes) || !Array.isArray(o.relationships)) throw new Error('bad');
  if (o.version !== 1) throw new Error('version');
  const seen = new Set(), nodes = [];
  for (const raw of o.nodes) { const n = sanNode(raw); if (n && !seen.has(n.id)) { seen.add(n.id); nodes.push(n); } }
  const rs = new Set(), rels = []; let dropped = 0;
  for (const r of o.relationships) {
    if (validRel(r) && seen.has(r.from) && seen.has(r.to) && !rs.has(r.id)) { rs.add(r.id); rels.push({id:r.id, from:r.from, to:r.to, label:r.label.trim().slice(0, 60), createdAt:typeof r.createdAt === 'string' ? r.createdAt : now()}); } else dropped++;
  }
  const s = o.settings && typeof o.settings === 'object' ? o.settings : {};
  return {nodes, rels, dropped, settings:{theme:['dark','light','system'].includes(s.theme) ? s.theme : S.settings.theme, labels:s.labels !== false, anim:s.anim !== false, layout:s.layout === 'grid' ? 'grid' : 'circle'}};
}
async function restoreFile(file) {
  if (!file) return; let data;
  try { data = validateBackup(JSON.parse(await file.text())); }
  catch (e) { return summary('Restore failed', e.message === 'version' ? 'This backup was made by an unsupported version of Sabyx Atlas.' : 'This file is not a valid Sabyx Atlas backup. Nothing was changed.'); }
  if (!(await ask(`Restoring this backup will replace your current Atlas data. (${data.nodes.length} nodes, ${data.rels.length} relationships)`, 'Restore', {label:'Back up current data first', fn:backupJSON}))) return;
  layout(data.nodes.filter(n => n.x == null));
  if (!(await replaceAll(data.nodes, data.rels))) return;
  S.nodes = data.nodes; S.rels = data.rels; Object.assign(S.settings, data.settings); await saveSettings();
  S.sel = null; S.focus = null; S.fpos = null; applySettings(); renderAll(); fit(); toast('Backup restored');
  if (data.dropped) setTimeout(() => toast(`${data.dropped} invalid relationships ignored`), 400);
}
async function clearAll() {
  if (!(await ask('Delete ALL nodes and relationships from this device? This cannot be undone.', 'Delete everything', {label:'Back up first', fn:backupJSON}))) return;
  if (!(await replaceAll([], []))) return;
  S.nodes = []; S.rels = []; S.sel = null; S.focus = null; S.fpos = null; renderAll(); fit(); toast('All data cleared');
}
async function loadDemo() {
  const ex = S.nodes.length ? S.nodes.reduce((m, n) => Math.max(m, n.y), -Infinity) + 170 : 0;
  const D = [['Sabyx Labs','Organization','Software company','company',0,0],['Sabyx Atlas','Project','Visual information mapping','product',-260,140],['Sabyx CRM','Project','Client relationship tool','product',260,140],
    ['Web Platform','Project','The Atlas web app','web',-480,300],['CSV Import','Task','Import records from CSV','feature',-260,300],['IndexedDB','Note','Local browser database','storage',-40,300],['Client Management','Project','Track clients','feature',260,300]];
  const seen = new Set(S.nodes.map(n => n.name + '|' + n.type)), t = now(), made = {};
  const fresh = D.filter(d => !seen.has(d[0] + '|' + d[1])).map(d => (made[d[0]] = {id:uid('n'), name:d[0], type:d[1], description:d[2], tags:[d[3]], date:'', x:d[4], y:d[5] + ex, createdAt:t, updatedAt:t}));
  const id = nm => (made[nm] || S.nodes.find(n => n.name === nm) || {}).id;
  const links = [['Sabyx Labs','owns','Sabyx Atlas'],['Sabyx Atlas','contains','Web Platform'],['Sabyx Labs','owns','Sabyx CRM'],['Sabyx CRM','contains','Client Management'],['Sabyx Atlas','contains','CSV Import'],['Sabyx Atlas','contains','IndexedDB']];
  if (fresh.length) { if (!(await saveNodes(fresh))) return; S.nodes.push(...fresh); }
  const rs = []; for (const [a, l, b] of links) { const r = id(a) && id(b) && await createRel(id(a), id(b), l, true); if (r) rs.push(r); }
  if (rs.length) await saveRels(rs);
  clearFilters(true); renderAll(); fit(); toast('Demo Atlas loaded');
}

// SEARCH
let palIdx = 0, palRes = [];
function searchAll(q) {
  q = q.trim().toLowerCase(); if (!q) return S.nodes.slice(0, 12).map(n => ({n}));
  const out = new Map();
  for (const n of S.nodes) {
    const nm = n.name.toLowerCase(); let s = 0;
    if (nm === q) s = 5; else if (nm.startsWith(q)) s = 4; else if (nm.includes(q)) s = 3;
    else if (n.type.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q))) s = 2; else if (n.description.toLowerCase().includes(q)) s = 1;
    if (s) out.set(n.id, {n, s});
  }
  for (const r of S.rels) if (r.label.toLowerCase().includes(q)) for (const id of [r.from, r.to]) { const n = S.byId.get(id); if (n && !out.has(id)) out.set(id, {n, s:.5, note:`via “${r.label}”`}); }
  return [...out.values()].sort((a, b) => b.s - a.s).slice(0, 30);
}
function renderPal() {
  palRes = searchAll($('#pIn').value); palIdx = clamp(palIdx, 0, Math.max(0, palRes.length - 1));
  $('#pRes').innerHTML = palRes.length ? palRes.map((r, i) => `<button class="pi${i === palIdx ? ' act' : ''}" role="option" data-i="${i}" aria-selected="${i === palIdx}"><span>${TYPES[r.n.type].i}</span><span>${escH(clip(r.n.name, 40))}</span><small>${escH(r.note || r.n.type)}</small></button>`).join('') : '<p class="mut" style="padding:10px">No matches.</p>';
}
function openPalette() { $('#pIn').value = ''; palIdx = 0; renderPal(); openDlg($('#dlgPal')); $('#pIn').focus(); }
function goResult(i) {
  const r = palRes[i]; if (!r) return; $('#dlgPal').close();
  if (!visibleNodes().includes(r.n)) clearFilters(true);
  select(r.n.id, true);
}

// FILTERS
function clearFilters(quiet) {
  S.filters = {type:'', tag:'', conn:'', from:''}; if (!quiet) { renderAll(); fit(); }
}
function syncFilterUI() {
  const f = S.filters, tags = [...new Set(S.nodes.flatMap(n => n.tags))].sort();
  $('#fTag').innerHTML = '<option value="">All tags</option>' + tags.map(t => `<option>${escH(t)}</option>`).join(''); $('#fTag').value = tags.includes(f.tag) ? f.tag : '';
  $('#fType').value = f.type; $('#fConn').value = f.conn; $('#fDate').value = f.from;
  const on = f.type || f.tag || f.conn || f.from; $('#fClear').hidden = !on;
  $('#fCount').textContent = on ? `${visibleNodes().length} of ${S.nodes.length} shown` : '';
  $$('.nb[data-type]').forEach(b => b.classList.toggle('act', b.dataset.type === f.type));
}

// UI
function toast(msg, kind) {
  const t = document.createElement('div'); t.className = 'toast' + (kind ? ' ' + kind : ''); t.textContent = msg; $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
const openDlg = d => { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); };
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d && d.id !== 'dlgConf') d.close(); }));
$$('[data-close]').forEach(b => b.addEventListener('click', () => { b.closest('dialog').close(); if (b.closest('#dlgRel')) { S.connectFrom = null; refreshChrome(); } }));
function ask(msg, ok = 'Confirm', alt) {
  return new Promise(res => {
    const d = $('#dlgConf'); $('#cMsg').textContent = msg; $('#cOk').textContent = ok;
    const a = $('#cAlt'); a.hidden = !alt; if (alt) { a.textContent = alt.label; a.onclick = alt.fn; }
    d.returnValue = ''; d.onclose = () => res(d.returnValue === 'ok'); openDlg(d);
  });
}
const metaHtml = n => `ID ${escH(n.id)}<br>Created ${new Date(n.createdAt).toLocaleString()}<br>Updated ${new Date(n.updatedAt).toLocaleString()}`;
function renderDetail() {
  const n = S.byId.get(S.sel), d = $('#detail');
  if (!n) { d.hidden = true; d.innerHTML = ''; return; }
  const cons = S.rels.filter(r => r.from === n.id || r.to === n.id);
  d.hidden = false;
  d.innerHTML = `<div class="dh"><h2>${TYPES[n.type].i} Details</h2><button class="ib" data-a="close" aria-label="Close details"><i data-i="x"></i></button></div>
  <div class="db"><label>Name<input id="dName" maxlength="120"></label>
  <label>Description<textarea id="dDesc" rows="3" maxlength="1000"></textarea></label>
  <label>Type<select id="dType">${Object.keys(TYPES).map(t => `<option>${t}</option>`).join('')}</select></label>
  <label>Tags <span>comma separated</span><input id="dTags"></label>
  <label>Date<input type="date" id="dDate"></label>
  <p class="meta" id="dMeta">${metaHtml(n)}</p>
  <h3>Connections (${cons.length})</h3>
  <ul class="cons">${cons.map(r => { const out = r.from === n.id, o = S.byId.get(out ? r.to : r.from); return `<li title="${out ? 'Outgoing' : 'Incoming'}"><span aria-hidden="true">${out ? '→' : '←'}</span><em>${escH(r.label)}</em><button class="lk" data-nid="${escH(o ? o.id : '')}">${escH(o ? o.name : '(missing)')}</button><button class="ib sm" data-rid="${escH(r.id)}" aria-label="Delete relationship"><i data-i="trash"></i></button></li>`; }).join('') || '<li class="mut">No connections yet.</li>'}</ul>
  <div class="acts2"><button class="btn" data-a="connect">Connect</button><button class="btn" data-a="focus">${S.focus ? 'Exit focus' : 'Focus'}</button><button class="btn danger" data-a="delete">Delete</button></div></div>`;
  $('#dName').value = n.name; $('#dDesc').value = n.description; $('#dType').value = n.type; $('#dTags').value = n.tags.join(', '); $('#dDate').value = n.date;
  hydrate(d);
}
function refreshChrome() {
  const N = S.nodes.length, cnt = t => S.nodes.filter(n => n.type === t).length;
  $('#stats').innerHTML = [[N,'Nodes'],[S.rels.length,'Connections'],[cnt('Project'),'Projects'],[cnt('Person'),'People'],[cnt('Organization'),'Orgs']].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  $('#stats').hidden = !N; $('#empty').hidden = N > 0; $('#fbar').hidden = !N;
  const b = $('#banner'), from = S.byId.get(S.connectFrom);
  if (from) { b.hidden = false; b.innerHTML = `<span>Select a node to connect from “${escH(clip(from.name, 24))}”</span><button class="btn" id="bCancel">Cancel</button>`; }
  else if (S.focus) { b.hidden = false; b.innerHTML = `<span>Focus mode — “${escH(clip((S.byId.get(S.focus) || {name:''}).name, 24))}”</span><button class="btn" id="bCancel">Exit</button>`; }
  else b.hidden = true;
  $('#tFocus').classList.toggle('on', !!S.focus); $('#tConn').classList.toggle('on', !!S.connectFrom);
  syncFilterUI();
}
function renderAll() { renderAtlas(); renderDetail(); refreshChrome(); }
function applySettings() {
  const s = S.settings; let t = s.theme; if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = t; document.documentElement.classList.toggle('noanim', !s.anim);
  $('#metaTheme').content = t === 'light' ? '#f4f5f8' : '#0e1116';
  try { localStorage.setItem('atlas-theme', s.theme); } catch (e) {}
}
function openSettings() {
  const s = S.settings; $(`input[name=theme][value=${s.theme}]`).checked = true; $('#sLabels').checked = s.labels; $('#sAnim').checked = s.anim; $('#sLayout').value = s.layout; openDlg($('#dlgSet'));
}
function closeNav() { $('#side').classList.remove('open'); $('#backdrop').classList.remove('show'); }

// PWA
let installEvt = null;
function registerSW() {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#bInstall').hidden = false; });
window.addEventListener('appinstalled', () => { $('#bInstall').hidden = true; toast('Sabyx Atlas installed'); });

// EVENTS
function bindEvents() {
  $('#bMenu').onclick = () => { $('#side').classList.add('open'); $('#backdrop').classList.add('show'); };
  $('#backdrop').onclick = closeNav;
  const addNode = () => { $('#fNode').reset(); openDlg($('#dlgNode')); $('#fNode').name.focus(); };
  $('#bAdd').onclick = $('#eAdd').onclick = addNode;
  $('#bSearch').onclick = openPalette;
  $('#bImport').onclick = $('#eImport').onclick = $('#xImport').onclick = () => { $('#dlgData').close(); $('#fileCsv').click(); };
  $('#bExport').onclick = () => openDlg($('#dlgData'));
  $('#bSettings').onclick = openSettings;
  $('#eDemo').onclick = loadDemo; $('#xDemo').onclick = () => { $('#dlgData').close(); loadDemo(); };
  $('#xNodes').onclick = exportNodes; $('#xRels').onclick = exportRels; $('#xJson').onclick = backupJSON;
  $('#xRestore').onclick = () => { $('#dlgData').close(); $('#fileJson').click(); };
  $('#fileCsv').onchange = e => { importCSVFile(e.target.files[0]); e.target.value = ''; };
  $('#fileJson').onchange = e => { restoreFile(e.target.files[0]); e.target.value = ''; };
  $('#sData').onclick = () => { $('#dlgSet').close(); openDlg($('#dlgData')); };
  $('#sClear').onclick = () => { $('#dlgSet').close(); clearAll(); };
  $('#bInstall').onclick = async () => { if (installEvt) { installEvt.prompt(); installEvt = null; $('#bInstall').hidden = true; } };
  $('#fNode').onsubmit = e => {
    e.preventDefault(); const f = e.target, name = f.name.value.trim(); if (!name) return f.name.focus();
    createNode({name, description:f.description.value, type:f.type.value, tags:f.tags.value, date:f.date.value}); $('#dlgNode').close();
  };
  $('#nType').innerHTML = Object.keys(TYPES).map(t => `<option>${t}</option>`).join('');
  $('#fType').innerHTML += Object.keys(TYPES).map(t => `<option>${t}</option>`).join('');
  $('#rSel').onchange = e => { $('#rCustomL').hidden = e.target.value !== 'custom…'; if (!$('#rCustomL').hidden) $('#rCustom').focus(); };
  $('#fRel').onsubmit = async e => {
    e.preventDefault(); let l = $('#rSel').value; if (l === 'custom…') l = $('#rCustom').value.trim(); if (!l) return $('#rCustom').focus();
    const from = S.connectFrom, to = e.target.dataset.to; $('#dlgRel').close(); S.connectFrom = null;
    const r = await createRel(from, to, l); if (!r) { toast('That relationship already exists.'); refreshChrome(); }
  };
  $$('input[name=theme]').forEach(r => r.onchange = () => { S.settings.theme = r.value; applySettings(); saveSettings(); });
  $('#sLabels').onchange = e => { S.settings.labels = e.target.checked; saveSettings(); renderAtlas(); };
  $('#sAnim').onchange = e => { S.settings.anim = e.target.checked; applySettings(); saveSettings(); };
  $('#sLayout').onchange = e => { S.settings.layout = e.target.value; saveSettings(); };
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => S.settings.theme === 'system' && applySettings());

  $('.side').onclick = e => {
    const b = e.target.closest('.nb'); if (!b) return;
    if (b.dataset.act) ({atlas:() => { clearFilters(true); setFocus(null); S.sel = null; S.connectFrom = null; renderAll(); fit(); }, import:() => $('#fileCsv').click(), data:() => openDlg($('#dlgData')), backup:backupJSON, restore:() => $('#fileJson').click(), settings:openSettings})[b.dataset.act]();
    else { S.filters.type = b.dataset.type; if (S.focus) setFocus(null); else { renderAll(); fit(); } }
    closeNav();
  };
  $('#fType').onchange = e => { S.filters.type = e.target.value; renderAll(); fit(); };
  $('#fTag').onchange = e => { S.filters.tag = e.target.value; renderAll(); fit(); };
  $('#fConn').onchange = e => { S.filters.conn = e.target.value; renderAll(); fit(); };
  $('#fDate').onchange = e => { S.filters.from = e.target.value; renderAll(); fit(); };
  $('#fClear').onclick = () => clearFilters();
  $('#tIn').onclick = () => zoomBtn(1.3); $('#tOut').onclick = () => zoomBtn(1 / 1.3); $('#tFit').onclick = fit;
  $('#tConn').onclick = () => S.connectFrom ? (S.connectFrom = null, refreshChrome()) : startConnect();
  $('#tFocus').onclick = () => S.focus ? setFocus(null) : S.sel ? setFocus(S.sel) : toast('Select a node to focus on it.');
  $('#banner').onclick = e => { if (e.target.id === 'bCancel') { if (S.connectFrom) S.connectFrom = null; else setFocus(null); refreshChrome(); } };

  const d = $('#detail');
  d.addEventListener('change', e => {
    const n = S.byId.get(S.sel); if (!n) return; const v = e.target.value;
    if (e.target.id === 'dName') { if (!v.trim()) { e.target.value = n.name; return toast('Name cannot be empty.', 'err'); } updateNode(n, {name:v.trim()}); }
    else if (e.target.id === 'dDesc') updateNode(n, {description:v.trim()});
    else if (e.target.id === 'dType') updateNode(n, {type:v});
    else if (e.target.id === 'dTags') updateNode(n, {tags:parseTags(v)});
    else if (e.target.id === 'dDate') updateNode(n, {date:v});
  });
  d.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rid) return deleteRel(b.dataset.rid);
    if (b.dataset.nid) return select(b.dataset.nid, true);
    ({close:() => select(null), connect:startConnect, focus:() => S.focus ? setFocus(null) : setFocus(S.sel), delete:() => deleteNode(S.sel)})[b.dataset.a]?.();
  });
  $('#pIn').oninput = () => { palIdx = 0; renderPal(); };
  $('#pIn').onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); palIdx = clamp(palIdx + (e.key === 'ArrowDown' ? 1 : -1), 0, palRes.length - 1); renderPal(); $('.pi.act')?.scrollIntoView({block:'nearest'}); }
    else if (e.key === 'Enter') { e.preventDefault(); goResult(palIdx); }
  };
  $('#pRes').onclick = e => { const b = e.target.closest('.pi'); if (b) goResult(+b.dataset.i); };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const p = $('#dlgPal'); p.open ? p.close() : openPalette(); return; }
    if (document.querySelector('dialog[open]')) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === 'Escape') { if (S.connectFrom) { S.connectFrom = null; refreshChrome(); } else if (S.focus) setFocus(null); else if (S.sel) select(null); closeNav(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel && !typing) { e.preventDefault(); deleteNode(S.sel); }
  });
  new ResizeObserver(() => applyView()).observe(canvas);
}
async function init() {
  hydrate(document); bindEvents();
  try {
    db = await dbOpen();
    const [ns, rs, st] = await Promise.all([dbAll('nodes'), dbAll('relationships'), dbAll('settings')]);
    S.nodes = ns.map(sanNode).filter(Boolean); layout(S.nodes.filter(n => n.x == null));
    const ids = new Set(S.nodes.map(n => n.id)); S.rels = rs.filter(r => validRel(r) && ids.has(r.from) && ids.has(r.to));
    const a = st.find(x => x.key === 'app'); if (a && a.value) Object.assign(S.settings, a.value);
  } catch (e) {
    console.error(e); $('#empty').hidden = false; $('#empty h1').textContent = 'Local storage is unavailable.';
    $('#empty p').textContent = 'Sabyx Atlas needs IndexedDB. Try a current browser and leave private browsing mode.'; $('.row', $('#empty')).hidden = true; return;
  }
  applySettings(); renderAll(); fit(); registerSW();
}
init();
