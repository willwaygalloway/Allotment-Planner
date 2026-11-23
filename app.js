/* Allotment Planner (simple). Everything runs in the browser; the plan is saved in this browser
   and, if you like, in a plan file you keep (Save plan file / Open plan file). */
(function(){
"use strict";
const KEY = "allotment-simple:plan", APP = "allotment-simple";
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CROP = Object.fromEntries(CROPS.map(c => [c.id, c]));
const RS = (window.REALSEEDS && window.REALSEEDS.varieties) || [];
const RSBASE = (window.REALSEEDS && window.REALSEEDS.base) || "https://realseeds.co.uk/";
const LETTER = "ABCDEFGHIJKLMNOP";
const SIZES = [["6 × 4 ft", 1.8, 1.2], ["8 × 4 ft", 2.4, 1.2], ["10 × 4 ft", 3.0, 1.2], ["12 × 4 ft", 3.6, 1.2]];
const r1 = n => Math.round(n * 10) / 10;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const plural = (n, w, ws) => n + " " + (n === 1 ? w : (ws || w + "s"));

/* ---------- dates (ISO yyyy-mm-dd) ---------- */
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = s => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + Math.round(n)); return iso(d); };
const addWeeks = (s, n) => addDays(s, n * 7);
const monday = s => { const d = parse(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const fmt = s => { const d = parse(s); return d ? d.getDate() + " " + MON[d.getMonth()] : "—"; };
const fmtY = s => { const d = parse(s); return d ? d.getDate() + " " + MON[d.getMonth()] + (d.getFullYear() !== P.year ? " " + d.getFullYear() : "") : "—"; };
const fmtLong = s => { const d = parse(s); return d ? d.getDate() + " " + MONTH[d.getMonth()] + " " + d.getFullYear() : ""; };
const monthOf = s => parse(s).getMonth() + 1;
const maxD = (a, b) => a > b ? a : b;
let today = iso(new Date()), thisWeek = monday(today);

/* ---------- regions (rough average frost dates; local knowledge beats them) ---------- */
const REGIONS = [
  ["cornwall", "Cornwall, Scilly & mild coasts", "03-25", "11-25"],
  ["south", "South & South West England", "04-20", "11-01"],
  ["southeast", "London & South East England", "04-15", "11-05"],
  ["wales", "Wales", "05-01", "10-25"],
  ["midlands", "Midlands & East of England", "05-05", "10-20"],
  ["north", "North of England", "05-12", "10-15"],
  ["ni", "Northern Ireland", "05-01", "10-20"],
  ["scotland", "Scotland, lowlands", "05-18", "10-10"],
  ["highlands", "Scotland, highlands & hills", "06-01", "10-01"],
  ["custom", "Somewhere else: I'll type my dates", "05-01", "10-20"]
];
const REF_LF = "05-01", REF_FF = "10-25"; /* roughly where Huw Richards and Real Seeds garden (zone 8, west Wales) */

/* ---------- the plan ---------- */
let P = null, UNDO = [], view = "todo", gardenMonth = null, W = null;
function planYear(){ const d = new Date(); return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear(); }
function blank(){ const y = planYear(); return {app:APP, v:2, name:"My plot", region:"", lf:y + "-" + REF_LF, ff:y + "-" + REF_FF, year:y, people:2, sections:[], beds:[], plants:[], updated:""}; }
/* older plans: put beds in a section, turn "whole bed" into a run of parts */
function upgrade(d){
  if(!d) return d;
  d.sections = d.sections || []; d.people = d.people || 2;
  if(!d.sections.length && d.beds.length) d.sections.push({id:"s1", name:"Section 1"});
  d.beds.forEach(b => { if(!b.section || !d.sections.some(s => s.id === b.section)) b.section = d.sections[0].id; });
  d.plants.forEach(p => { const b = d.beds.find(x => x.id === p.bed); if(p.part === -1){ p.part = 0; p.span = b ? b.parts : 1; } if(!p.span) p.span = 1; });
  d.v = 2; return d;
}
function load(){ try{ const d = JSON.parse(localStorage.getItem(KEY) || "null"); if(d && d.app === APP) return upgrade(d); }catch(e){} return null; }
function save(){ P.updated = new Date().toISOString(); try{ localStorage.setItem(KEY, JSON.stringify(P)); }catch(e){} saveLinkedSoon(); showSaved(); }
function change(fn, msg){ UNDO.push(JSON.stringify(P)); if(UNDO.length > 40) UNDO.shift(); fn(); save(); render(); if(msg) toast(msg, true); }
function undo(){ if(!UNDO.length) return; P = JSON.parse(UNDO.pop()); save(); render(); toast("Undone"); }
function showSaved(){ const el = $("#saved"); if(el) el.textContent = LINK.handle && LINK.ok ? "Saved to " + LINK.name : "Saved on this device"; }

/* ---------- crop timings ---------- */
const isTransplanted = c => !!(c.huw && c.huw.tp) && c.how !== "direct";
const tpWeeks = c => c.huw && c.huw.tp ? (c.huw.tp[0] + c.huw.tp[1]) / 2 : 0;
function shiftDays(c, month){
  const y = P.year, cl = n => clamp(n, -35, 35);
  if(month <= 7){ const d = cl(daysBetween(y + "-" + REF_LF, P.lf)); return c.tender ? d : d / 2; }
  return cl(daysBetween(y + "-" + REF_FF, P.ff)) / -2;
}
function sowBase(p){ const c = CROP[p.crop]; const y = P.year + (p.yr || 0); const day = p.half === "b" ? 22 : 8; return monday(addDays(y + "-" + pad(p.month) + "-" + pad(day), shiftDays(c, p.month))); }
const STAGES = ["sow","plant","harvest","clear"];
function stagesOf(c){ return isTransplanted(c) ? STAGES : ["sow","harvest","clear"]; }
/* the four dates: from what's been done, what you fixed, or the guide */
function datesOf(p){
  const c = CROP[p.crop], ks = stagesOf(c), fixed = Object.assign({}, p.dates || {}, p.done || {});
  const gaps = isTransplanted(c) ? [tpWeeks(c), c.th, c.hw] : [c.th, c.hw];
  let ai = ks.findIndex(k => fixed[k]); const out = {};
  if(ai < 0){ ai = 0; out.sow = sowBase(p); } else out[ks[ai]] = fixed[ks[ai]];
  for(let i = ai + 1; i < ks.length; i++) out[ks[i]] = fixed[ks[i]] || monday(addWeeks(out[ks[i-1]], gaps[i-1]));
  for(let i = ai - 1; i >= 0; i--) out[ks[i]] = monday(addWeeks(out[ks[i+1]], -gaps[i]));
  out.waited = false;
  const bed = bedById(p.bed), covered = c.cover || (bed && bed.cover);
  if(c.tender && !covered && !fixed.plant && !fixed.harvest && !fixed.clear){
    const key = ks.includes("plant") ? "plant" : "sow";
    if(out[key] < P.lf && !(fixed.sow && key === "sow")){ const shift = daysBetween(out[key], monday(addDays(P.lf, 6))); for(let i = ks.indexOf(key); i < ks.length; i++) if(!fixed[ks[i]]) out[ks[i]] = addDays(out[ks[i]], shift); out.waited = true; }
  }
  out.in = out.plant || out.sow;
  return out;
}
function checks(p){
  const c = CROP[p.crop], d = datesOf(p), out = [];
  if(!(p.dates && p.dates.sow) && !c.huw.sow.includes(p.month) && !(c.rs && halfIn(c.rs.sow + "," + c.rs.maybe, p.month))) out.push(["warn", "Unusual month to sow " + c.name.toLowerCase()]);
  const hm = monthOf(d.harvest);
  if(!c.huw.har.includes(hm) && !(c.rs && halfIn(c.rs.har + "," + c.rs.store, hm))) out.push(["warn", "Picking starts in " + MON[hm - 1] + ", outside the usual harvest months"]);
  if(c.tender && !c.cover && !(bedById(p.bed) || {}).cover && d.in < P.lf && !(p.done || {})[d.plant ? "plant" : "sow"]) out.push(["bad", "Goes out before your last frost (" + fmt(P.lf) + ")"]);
  const cl = clashes(p); if(cl.length) out.push(["bad", "Overlaps " + cl.map(q => CROP[q.crop].name).join(", ")]);
  return out;
}
/* Real Seeds calendar: "3a-5b,9b" style half-month ranges */
function halves(spec){ const set = new Set(); String(spec || "").split(",").map(s => s.trim()).filter(Boolean).forEach(r => { const [a, b] = r.split("-"); const h = x => (parseInt(x) - 1) * 2 + (/b$/.test(x) ? 1 : 0); const s = h(a), e = b ? h(b) : (/[ab]$/.test(a) ? s : s + 1); let i = s; for(let n = 0; n < 24; n++){ set.add(i); if(i === e) break; i = (i + 1) % 24; } }); return set; }
const halfIn = (spec, m) => { const s = halves(spec); return s.has((m - 1) * 2) || s.has((m - 1) * 2 + 1); };
function nextSowMonth(c, from){
  const m0 = from || parse(today).getMonth() + 1, ord = m => (m - m0 + 12) % 12;
  let cands = c.huw.sow.filter(m => !c.rs || halfIn(c.rs.sow, m)); if(!cands.length) cands = c.huw.sow.slice();
  if(!c.tender && !c.cover){ const out = cands.filter(m => !c.huw.cov.includes(m)); if(out.length) cands = out; }
  return cands.sort((a, b) => ord(a) - ord(b))[0];
}
function yrFor(c, m){ const now = new Date(); return (m >= 9 && !c.huw.sow.some(x => x < 9) && now.getMonth() + 1 >= 9 && now.getMonth() + 1 <= m && now.getFullYear() < P.year) ? -1 : 0; }
function newPlant(cropId, month, yr){ const c = CROP[cropId]; const m = month || nextSowMonth(c); return {id:uid("p"), crop:cropId, month:m, half:"a", yr:yr == null ? yrFor(c, m) : yr, bed:"", part:0, span:1, auto:true, variety:"", dates:{}, done:{}}; }

/* ---------- how much to grow (from the 2026 "How much food" sheet) ---------- */
const BUFFER = 1.2;
function density(c){ const row = c.sp >= 25 ? c.sp : 30; return 1e4 / (c.sp * row); }
function defaultAmount(c){ return {pw:c.eat[1], weeks:c.eat[2], por:Math.round(c.eat[0] * (P.people || 2) / 2 / 10) * 10 || c.eat[0]}; }
/* kg wanted, the space it needs, and how many sowings to spread it over */
function amountPlan(c, a){
  const kg = a.por * a.pw * a.weeks / 1000 * BUFFER;
  const y = c.eat[3] || 2;
  let sowings = 1;
  if(c.succ) sowings = clamp(Math.ceil(a.weeks / Math.max(1, c.hw)), 1, c.sowings || 3);
  const area = kg / y, each = area / sowings;
  const fresh = sowings * c.hw, stored = c.keep ? Math.round(c.keep * 4.3) : 0;
  return {kg, area, each, sowings, plants:Math.max(1, Math.round(each * density(c))), covers:Math.min(a.weeks, fresh + stored), fresh, stored};
}

/* ---------- beds & space ---------- */
const bedById = id => P.beds.find(b => b.id === id);
const sectionById = id => P.sections.find(s => s.id === id);
const partArea = b => b.len * b.wid / b.parts;
function parts(p){ const b = bedById(p.bed); if(!b) return []; const s = clamp(p.part || 0, 0, b.parts - 1), n = clamp(p.span || 1, 1, b.parts - s); return Array.from({length:n}, (_, i) => s + i); }
function span(p){ const d = datesOf(p); return [d.in, d.clear]; }
function overlaps(p){ if(!p.bed) return []; const [a, z] = span(p), mine = parts(p); return P.plants.filter(q => q.id !== p.id && q.bed === p.bed && parts(q).some(x => mine.includes(x)) && (() => { const [b, y] = span(q); return a < y && b < z; })()); }
function peakArea(p, ov){ const [a] = span(p); const pts = [a].concat(ov.map(q => span(q)[0]).filter(x => x > a)); return Math.max(...pts.map(t => p.area + ov.filter(q => { const [b, y] = span(q); return b <= t && t < y; }).reduce((s, q) => s + q.area, 0))); }
/* small sowings (a few lettuces, a row of radish) can share one part if their areas add up */
function clashes(p){ const ov = overlaps(p); if(!ov.length) return ov; const b = bedById(p.bed);
  if((p.span || 1) === 1 && p.area && ov.every(q => (q.span || 1) === 1 && q.area && q.part === p.part) && peakArea(p, ov) <= partArea(b) * 1.05) return [];
  return ov; }
function fits(p){ return !!bedById(p.bed) && !clashes(p).length; }
/* find free parts for a planting: enough area if we know how much is needed */
function findSpace(p, area){
  let best = null;
  for(const b of P.beds){
    const pa = partArea(b) || 1; const need = area ? clamp(Math.ceil(area / pa - 0.2), 1, b.parts) : 1;
    for(let n = need; n >= 1; n--){
      for(let s = 0; s + n <= b.parts; s++){ const t = Object.assign({}, p, {bed:b.id, part:s, span:n}); if(area && n === 1 && area < pa * 0.6) t.area = r1(area); if(!fits(t)) continue; const shared = n === 1 && t.area && overlaps(t).length; const got = shared ? area : n * pa; const score = area ? (got >= area * 0.8 ? 1000 - Math.abs(got - area) : got) : 1000 - s; if(!best || score > best.score) best = {bed:b.id, part:s, span:n, got, score}; break; }
      if(best && best.bed === b.id) break;
    }
  }
  return best ? {bed:best.bed, part:best.part, span:best.span, got:best.got} : {bed:"", part:0, span:1, got:0};
}
/* place a planting; if it needs more room than one free run, split it across beds */
function placeAll(p, area){
  const out = []; let left = area || 0, q = p;
  for(let i = 0; i < 4; i++){
    const s = findSpace(q, left); Object.assign(q, {bed:s.bed, part:s.part, span:s.span}); delete q.auto;
    q.area = area ? r1(Math.min(left, s.got || left)) : q.area; out.push(q);
    if(!s.bed || !area || s.got >= left * 0.8) break;
    left -= s.got; q = Object.assign(JSON.parse(JSON.stringify(p)), {id:uid("p"), done:{}}); P.plants.push(q);
  }
  return out;
}
function whereText(p){ const b = bedById(p.bed); if(!b) return "No space yet"; const ps = parts(p); if(b.parts === 1 || ps.length === b.parts) return b.name + (b.parts > 1 ? " (whole bed)" : ""); return b.name + ", part" + (ps.length > 1 ? "s " + LETTER[ps[0]] + "–" + LETTER[ps[ps.length - 1]] : " " + LETTER[ps[0]]); }
function cropsAt(b, part, date){ return P.plants.filter(p => p.bed === b.id && parts(p).includes(part) && (() => { const [a, z] = span(p); return a <= date && date < z; })()); }
function cropAt(b, part, date){ return cropsAt(b, part, date)[0]; }
function sectionPrefix(sec){ const m = /(\d+)/.exec(sec.name); return m ? m[1] : String(P.sections.indexOf(sec) + 1); }
function nextBedName(sec){ const pre = sectionPrefix(sec); const used = new Set(P.beds.map(b => b.name)); for(let i = 0; i < LETTER.length; i++){ const n = pre + LETTER[i]; if(!used.has(n)) return n; } return pre + "-" + (P.beds.length + 1); }
function addSection(){ const n = P.sections.length + 1; const sec = {id:uid("s"), name:"Section " + n}; P.sections.push(sec); for(let i = 0; i < 4; i++) addBed(sec); return sec; }
function addBed(sec, like){ const last = like || P.beds.filter(b => b.section === sec.id).slice(-1)[0]; const b = {id:uid("b"), section:sec.id, name:nextBedName(sec), len:last ? last.len : 1.8, wid:last ? last.wid : 1.2, parts:last ? last.parts : 2, cover:false}; P.beds.push(b); return b; }
const bedsIn = sec => P.beds.filter(b => b.section === sec.id);
const totalArea = () => P.beds.reduce((a, b) => a + b.len * b.wid, 0);

/* ---------- jobs ---------- */
function jobsOf(p){
  const c = CROP[p.crop], d = datesOf(p), placed = !!bedById(p.bed), where = placed ? whereText(p) : "no space chosen yet", v = p.variety ? " (" + p.variety + ")" : "", inW = placed ? " in " + where : "";
  const under = c.huw.cov.includes(monthOf(d.sow)) || c.cover || c.tender;
  const sowWord = {module:"Sow " + c.name + v + " in modules", pot:"Sow " + c.name + v + " in pots", direct:"Sow " + c.name + v + inW, sets:(isTransplanted(c) ? "Start " + c.name + v + " in modules" : "Plant " + c.name + v + inW)}[c.how];
  const nextSow = c.succ ? P.plants.filter(q => q.crop === p.crop && q.id !== p.id && datesOf(q).sow > d.sow).map(q => datesOf(q).sow).sort()[0] : null;
  const out = [{key:"sow", date:d.sow, kind:c.how === "sets" && !isTransplanted(c) ? "plant" : "sow", text:sowWord, meta:(isTransplanted(c) ? (under ? "under cover" + (c.tender ? ", with warmth" : "") : "outside or under cover") + " · ready to plant in about " + Math.round(tpWeeks(c)) + " weeks" : where) + (nextSow ? " · next sowing " + fmt(nextSow) : "")}];
  if(d.plant) out.push({key:"plant", date:d.plant, kind:"plant", text:"Plant out " + c.name + v, meta:where + (under ? " · harden off for a week first" : "") + (d.waited ? " · waits for the last frost" : "")});
  out.push({key:"harvest", date:d.harvest, kind:"harvest", text:"Start picking " + c.name + v, meta:where});
  const follow = c.follows.filter(id => CROP[id]).map(id => CROP[id].name.toLowerCase()).slice(0, 2);
  out.push({key:"clear", date:d.clear, kind:"clear", text:"Clear " + c.name + v, meta:where + " is free" + (follow.length ? " · " + follow.join(" or ") + " follow well" : "")});
  return out.map(j => Object.assign(j, {p, week:monday(j.date), done:!!(p.done || {})[j.key]}));
}
const allJobs = () => P.plants.flatMap(jobsOf);
const RANK = {sow:1, plant:2, harvest:3, clear:4};
const byDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : RANK[a.kind] - RANK[b.kind];

/* ---------- rendering ---------- */
function render(){
  today = iso(new Date()); thisWeek = monday(today);
  $$(".nav button, #gear").forEach(b => b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false"));
  $("#plan-name").textContent = P.name || "My plot";
  const main = $("#main");
  main.innerHTML = view === "garden" ? viewGarden() : view === "crops" ? viewCrops() : view === "cal" ? viewCalendar() : view === "more" ? viewMore() : viewTodo();
  showSaved(); linkBanner();
}
function viewTodo(){
  if(!P.plants.length) return '<div class="card empty"><h2>Nothing planned yet</h2><p>Add the crops you like to eat and the planner will tell you when to sow, plant and pick them.</p><button class="btn primary big" data-act="add">Add a crop</button></div>';
  const jobs = allJobs(); const lfw = Math.round(daysBetween(today, P.lf) / 7);
  const late = jobs.filter(j => !j.done && j.week < thisWeek && j.week >= addWeeks(thisWeek, -6)).sort(byDate);
  const now = jobs.filter(j => j.week === thisWeek).sort(byDate);
  const soon = [1, 2, 3].map(i => ({w:addWeeks(thisWeek, i), list:jobs.filter(j => j.week === addWeeks(thisWeek, i)).sort(byDate)}));
  const next = jobs.filter(j => !j.done && j.week > addWeeks(thisWeek, 3)).sort(byDate)[0];
  const li = j => '<li class="job' + (j.done ? " done" : "") + '"><input type="checkbox" id="j-' + j.p.id + "-" + j.key + '" data-job="' + j.p.id + '" data-key="' + j.key + '"' + (j.done ? " checked" : "") + '><label for="j-' + j.p.id + "-" + j.key + '"><b><span class="kind ' + j.kind + '">' + {sow:"Sow", plant:"Plant", harvest:"Pick", clear:"Clear"}[j.kind] + "</span>" + esc(j.text) + '</b><span class="meta">' + esc(j.meta) + (j.week !== thisWeek ? " · week of " + fmt(j.week) : "") + "</span></label></li>";
  return '<div class="hero"><div><p class="eyebrow">This week</p><h1>Week of ' + fmt(thisWeek) + '</h1></div><p class="small muted">' + (lfw > 0 ? lfw + " week" + (lfw === 1 ? "" : "s") + " to your last frost (" + fmt(P.lf) + ")" : "Past your last frost") + "</p></div>" +
    (late.length ? '<div class="card"><div class="card-h"><h3>Still to do</h3><span class="small muted">from the last few weeks</span></div><ul class="jobs">' + late.map(li).join("") + "</ul></div>" : "") +
    '<div class="card"><div class="card-h"><h3>To do this week</h3></div>' + (now.length ? '<ul class="jobs">' + now.map(li).join("") + "</ul>" : '<p class="muted">Nothing this week.' + (next ? " Next up: " + esc(next.text.toLowerCase()) + ", week of " + fmt(next.week) + "." : "") + "</p>") + '<p class="small muted" style="margin-top:10px">Tick a job when you do it. If you’re early or late, the rest of that crop’s dates move to match.</p></div>' +
    '<div class="card"><div class="card-h"><h3>Coming up</h3><button class="btn small" data-act="nav" data-view="cal">Full calendar</button></div>' + soon.map(s => '<p class="week-h">Week of ' + fmt(s.w) + "</p>" + (s.list.length ? '<ul class="jobs">' + s.list.map(li).join("") + "</ul>" : '<p class="small muted">Nothing planned.</p>')).join("") + "</div>";
}
function seasonMonths(){ const out = []; for(let i = 0; i < 15; i++){ const m = (9 + i) % 12, y = P.year - 1 + Math.floor((9 + i) / 12); out.push({y, m, d:y + "-" + pad(m + 1) + "-15"}); } return out; }
function bedCard(b, sel, x, ms){
  const n = b.parts; const at = Array.from({length:n}, (_, i) => cropAt(b, i, sel));
  const tiles = Array.from({length:n}, (_, i) => { const p = at[i]; if(p && i > 0 && at[i-1] === p) return ""; let w = 1; while(p && i + w < n && at[i + w] === p) w++; if(!p) return '<button class="part free" data-act="part" data-bed="' + b.id + '" data-part="' + i + '"><span class="letter">' + (n > 1 ? LETTER[i] : "") + "</span>Free<small>+ add</small></button>"; const c = CROP[p.crop], d = datesOf(p); const picking = sel >= d.harvest; const also = Array.from(new Set(cropsAt(b, i, sel).filter(q => q !== p).map(q => CROP[q.crop].name))).filter(n => n !== c.name); return '<button class="part fam-' + c.fam + (picking ? " picking" : "") + '" style="flex-grow:' + w + '" data-act="edit" data-id="' + p.id + '"><span class="letter">' + (n > 1 ? LETTER[i] + (w > 1 ? "–" + LETTER[i + w - 1] : "") : "") + "</span><b>" + esc(c.name) + (also.length ? " + " + esc(also.join(" + ")) : "") + "</b><small>" + (picking ? "picking" : sel < d.in ? "in trays" : "growing") + "</small></button>"; }).join("");
  const strips = Array.from({length:n}, (_, i) => '<div class="strip-row"><span>' + (n > 1 ? LETTER[i] : "") + '</span><div class="track">' + P.plants.filter(p => p.bed === b.id && parts(p).includes(i)).map(p => { const [s, e] = span(p); const c = CROP[p.crop]; return '<i class="fam-' + c.fam + '" style="left:' + x(s) + "%;width:" + Math.max(1, x(e) - x(s)) + '%" title="' + esc(c.name + ": " + fmt(s) + " to " + fmtY(e)) + '"></i>'; }).join("") + '<span class="now" style="left:' + x(sel) + '%"></span></div></div>').join("");
  return '<div class="bed"><div class="bed-h"><h3>' + esc(b.name) + '</h3><span class="small muted">' + b.len + " × " + b.wid + " m" + (b.cover ? " · under cover" : "") + '</span></div><div class="plot' + (n >= 4 ? " many" : "") + '">' + tiles + '</div><div class="strip">' + strips + '</div><div class="months">' + ms.map(m => "<span>" + MON[m.m][0] + "</span>").join("") + "</div></div>";
}
function viewGarden(){
  if(!P.beds.length) return '<div class="card empty"><h2>No beds yet</h2><p>Set up your sections and beds.</p><button class="btn primary big" data-act="beds-edit">Set up beds</button></div>';
  const ms = seasonMonths(); const cur = gardenMonth || (today.slice(0, 7) + "-15"); const sel = ms.find(x => x.d === cur) ? cur : ms[3].d;
  const a = ms[0].y + "-10-01", z = (P.year + 1) + "-01-01", total = daysBetween(a, z); const x = s => clamp(daysBetween(a, s) / total * 100, 0, 100);
  return '<div class="hero"><div><p class="eyebrow">Your beds</p><h1>' + MONTH[parse(sel).getMonth()] + " " + parse(sel).getFullYear() + '</h1></div><div class="row no-print"><button class="btn small" data-act="beds-edit">Edit beds</button><button class="btn small" data-act="print">Print</button></div></div>' +
    '<div class="scroll-x no-print" style="margin-bottom:16px" id="months">' + ms.map(m => '<button class="chip" data-act="month" data-d="' + m.d + '" aria-pressed="' + (m.d === sel) + '">' + MON[m.m] + (m.m === 0 || m === ms[0] ? " ’" + String(m.y).slice(2) : "") + "</button>").join("") + "</div>" +
    P.sections.map(sec => { const bs = bedsIn(sec); if(!bs.length) return ""; return '<h2 class="section-h">' + esc(sec.name) + '</h2><div class="beds">' + bs.map(b => bedCard(b, sel, x, ms)).join("") + "</div>"; }).join("") +
    '<p class="small muted" style="margin-top:14px">Tap a free space to see what would fit there, or a crop to change it. Striped means it’s ready to pick. The bars under each bed show its whole season.</p>';
}
function viewCrops(){
  const ps = P.plants.slice().sort((a, b) => a.crop === b.crop ? (datesOf(a).sow < datesOf(b).sow ? -1 : 1) : CROP[a.crop].name.localeCompare(CROP[b.crop].name));
  const groups = []; ps.forEach(p => { const g = groups[groups.length - 1]; if(g && g.crop === p.crop) g.list.push(p); else groups.push({crop:p.crop, list:[p]}); });
  const unplaced = ps.filter(p => !bedById(p.bed)).length;
  return '<div class="hero"><div><p class="eyebrow">Your crops</p><h1>What you’re growing</h1></div><button class="btn primary" data-act="add">+ Add a crop</button></div>' +
    (unplaced ? '<p class="note warn" style="margin-bottom:14px">' + plural(unplaced, "sowing") + ' ha' + (unplaced === 1 ? "s" : "ve") + ' no space yet. Add a bed in <button class="btn small" data-act="beds-edit">Edit beds</button>, or open it and pick a space.</p>' : "") +
    (groups.length ? groups.map(g => { const c = CROP[g.crop]; const canMore = c.succ && g.list.length < (c.sowings || 3);
      return '<div class="card crop-group" style="--fam:var(--fam-' + c.fam + ')"><div class="card-h"><h3><span class="dot fam-' + c.fam + '"></span>' + esc(c.name) + '</h3><span class="small muted">' + plural(g.list.length, "sowing") + "</span></div>" +
        '<ul class="plist">' + g.list.map(p => { const d = datesOf(p), ch = checks(p); return '<li><button class="pcard" data-act="edit" data-id="' + p.id + '"><b>' + (p.variety ? esc(p.variety) : "Sowing " + (g.list.indexOf(p) + 1)) + "</b>" + ch.map(x => '<span class="flag' + (x[0] === "bad" ? " bad" : "") + '">' + esc(x[0] === "bad" ? "Check" : "Note") + "</span>").slice(0, 1).join("") + '<span class="small muted" style="display:block">' + esc(whereText(p)) + (p.area ? " · " + p.area + " m²" : "") + '</span><span class="when">Sow ' + fmt(d.sow) + (d.plant ? " · plant " + fmt(d.plant) : "") + " · pick " + fmtY(d.harvest) + " · clear " + fmtY(d.clear) + "</span></button></li>"; }).join("") + "</ul>" +
        (canMore ? '<p class="note small" style="margin-top:10px">Sow little and often: another sowing in about ' + c.succ + ' weeks keeps ' + esc(c.name.toLowerCase()) + ' coming. <button class="btn small" data-act="again" data-id="' + g.list[g.list.length - 1].id + '">Add the next sowing</button></p>' : "") + "</div>"; }).join("")
      : '<div class="card empty"><p>No crops yet.</p><button class="btn primary big" data-act="add">Add a crop</button></div>');
}
/* ---------- printable calendar ---------- */
function viewCalendar(){
  const y = P.year, ps = P.plants.slice().sort((a, b) => datesOf(a).sow < datesOf(b).sow ? -1 : 1);
  const hIdx = s => { const d = parse(s); if(d.getFullYear() < y) return -1; if(d.getFullYear() > y) return 24; return d.getMonth() * 2 + (d.getDate() > 15 ? 1 : 0); };
  const rows = ps.map(p => { const c = CROP[p.crop], d = datesOf(p); const s = hIdx(d.sow), pl = d.plant ? hIdx(d.plant) : null, h = hIdx(d.harvest), e = hIdx(d.clear), i0 = pl == null ? s : pl;
    const cells = Array.from({length:24}, (_, i) => { let cls = "", t = ""; if(i >= i0 && i < h) cls = "g"; if(i >= h && i <= Math.min(23, e)) cls = "h"; if(i === s){ cls += " s"; t = "S"; } if(pl != null && i === pl){ cls += " p"; t = "P"; } return '<td class="' + cls.trim() + '">' + t + "</td>"; }).join("");
    return '<tr data-act="edit" data-id="' + p.id + '"><th><span class="dot fam-' + c.fam + '"></span>' + esc(c.name) + (p.variety ? ' <small>' + esc(p.variety) + "</small>" : "") + '<small class="where">' + esc(bedById(p.bed) ? whereText(p) : "no space yet") + "</small></th>" + cells + "</tr>"; }).join("");
  const sowW = c => c.how === "sets" ? (isTransplanted(c) ? "Start " + c.name + " in modules" : "Plant " + c.name) : "Sow " + c.name;
  const byMonth = [{m:"Autumn " + (y - 1), i:-1}].concat(MONTH.map((m, i) => ({m, i}))).map(({m, i}) => { const items = []; ps.forEach(p => { const c = CROP[p.crop], d = datesOf(p); const inM = s => s && (i < 0 ? parse(s).getFullYear() === y - 1 : parse(s).getFullYear() === y && parse(s).getMonth() === i); if(inM(d.sow)) items.push(["sow", sowW(c), d.sow]); if(inM(d.plant)) items.push(["plant", "Plant out " + c.name, d.plant]); if(inM(d.harvest)) items.push(["harvest", "Start picking " + c.name, d.harvest]); }); items.sort((a, b) => a[2] < b[2] ? -1 : 1); const seen = new Set(); return {m, items:items.filter(it => { const k = it[1] + it[2]; return !seen.has(k) && seen.add(k); })}; });
  return '<div class="hero"><div><p class="eyebrow">' + y + ' at a glance</p><h1>Sowing calendar</h1></div><button class="btn primary no-print" data-act="print">Print</button></div>' +
    (ps.length ? '<div class="card cal-card"><div class="cal-wrap"><table class="year"><thead><tr><th></th>' + MON.map(m => '<th colspan="2">' + m + "</th>").join("") + "</tr></thead><tbody>" + rows + '</tbody></table></div><div class="legend"><span><i class="lg s"></i>S sow</span><span><i class="lg p"></i>P plant out</span><span><i class="lg g"></i>growing</span><span><i class="lg h"></i>picking</span><span class="no-print">Tap a row to change it.</span></div></div>' +
      '<div class="months-list">' + byMonth.filter(x => x.items.length).map(x => '<div class="card mcard"><h3>' + x.m + '</h3><ul>' + x.items.map(it => '<li><span class="kind ' + it[0] + '">' + {sow:"Sow", plant:"Plant", harvest:"Pick"}[it[0]] + "</span>" + esc(it[1]) + ' <span class="muted small">' + fmt(it[2]) + "</span></li>").join("") + "</ul></div>").join("") + "</div>"
      : '<div class="card empty"><p>Add some crops to see your calendar.</p><button class="btn primary big" data-act="add">Add a crop</button></div>');
}
function viewMore(){
  const reg = REGIONS.find(r => r[0] === P.region);
  return '<div class="hero"><div><p class="eyebrow">Settings</p><h1>Your plot</h1></div></div>' +
    '<div class="card"><h3>Plan</h3><div class="grid2" style="margin-top:10px"><div class="field"><label for="s-name">Name</label><input type="text" id="s-name" value="' + esc(P.name) + '"></div><div class="field"><label for="s-year">Growing year</label><input type="number" id="s-year" value="' + P.year + '"></div></div></div>' +
    '<div class="card"><h3>Frost dates</h3><p class="small muted" style="margin:4px 0 10px">' + (reg ? esc(reg[1]) + ". " : "") + 'Sowing times come from Huw Richards’ and Real Seeds’ calendars (west Wales, last frost about 1 May) and move earlier or later with your frost dates.</p><div class="grid2"><div class="field"><label for="s-lf">Last spring frost (average)</label><input type="date" id="s-lf" value="' + P.lf + '"></div><div class="field"><label for="s-ff">First autumn frost (average)</label><input type="date" id="s-ff" value="' + P.ff + '"></div></div><button class="btn small" data-act="region">Pick my area instead</button></div>' +
    '<div class="card"><div class="card-h"><h3>Sections &amp; beds</h3><button class="btn small" data-act="beds-edit">Edit beds</button></div><p class="small">' + plural(P.sections.length, "section") + ", " + plural(P.beds.length, "bed") + ", " + r1(totalArea()) + " m² in all.</p></div>" +
    '<div class="card"><h3>Keep your plan safe</h3><p class="small" style="margin:6px 0 12px">Your plan saves itself in this browser. To use it on another device, or to keep a copy, save a plan file and open it there.' + (window.showSaveFilePicker ? " On this computer you can also link a file so every change is saved into it." : "") + '</p><div class="row"><button class="btn" data-act="file-save">Save plan file</button><button class="btn" data-act="file-open">Open plan file</button>' + (window.showSaveFilePicker ? '<button class="btn" data-act="file-link">' + (LINK.handle ? "Linked: " + esc(LINK.name) : "Link a plan file") + "</button>" : "") + '</div></div>' +
    '<div class="card"><h3>Calendar &amp; printing</h3><p class="small" style="margin:6px 0 12px">Print your sowing calendar, or add every job to your phone’s calendar.</p><div class="row"><button class="btn" data-act="nav" data-view="cal">Sowing calendar</button><button class="btn" data-act="ics">Add jobs to my calendar</button></div></div>' +
    '<div class="card"><h3>Start again</h3><div class="row" style="margin-top:10px"><button class="btn" data-act="setup" data-step="1">Run the setup again</button><button class="btn" data-act="example">Load Huw’s one-bed example</button><button class="btn danger" data-act="reset">Clear everything</button></div></div>' +
    '<div class="card"><h3>Where the advice comes from</h3><p class="small" style="margin-top:6px">Sowing and harvest months: Huw Richards’ <i>Master Vegetable Sowing List</i> and the one-bed example from <i>Productive Planting Plan 2.0</i>, and the <a href="https://realseeds.co.uk/Printablesowing.html" target="_blank" rel="noopener">Real Seeds sowing calendar</a>. Succession sowing: <a href="https://www.charlesdowding.co.uk/lessons/succession-and-rotation" target="_blank" rel="noopener">Charles Dowding</a> and the <a href="https://www.rhs.org.uk/advice/profile?PID=730" target="_blank" rel="noopener">RHS</a>. Easy crops: <a href="https://www.which.co.uk/reviews/grow-your-own/article/growing-vegetables/the-five-easiest-vegetables-to-grow" target="_blank" rel="noopener">Which? Gardening</a>. Varieties: the <a href="https://realseeds.co.uk/" target="_blank" rel="noopener">Real Seeds catalogue</a>' + (window.REALSEEDS ? ", last checked " + esc(fmtLong(window.REALSEEDS.updated)) : "") + '. Amounts follow a “how much food do we eat” sheet: portion × meals a week × weeks, plus 20%, divided by a typical yield.</p><p class="small" style="margin-top:8px">Want more (nursery trays, versions)? Try the <a href="full/">advanced planner</a>. It keeps its own, separate plan.</p></div>';
}

/* ---------- sheets ---------- */
function sheet(title, body, foot, wide){ const old = $("#sheet"); if(old) old.remove(); const w = document.createElement("div"); w.className = "sheet-wrap"; w.id = "sheet"; w.innerHTML = '<div class="scrim" data-act="close"></div><div class="sheet' + (wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-labelledby="sheet-t"><div class="sheet-h"><h2 id="sheet-t">' + esc(title) + '</h2><button class="btn small ghost" data-act="close">Close</button></div><div id="sheet-body">' + body + "</div>" + (foot ? '<div class="foot">' + foot + "</div>" : "") + "</div>"; document.body.appendChild(w); document.body.style.overflow = "hidden"; const h = $("#sheet-t"); h.tabIndex = -1; h.focus(); }
function closeSheet(){ const s = $("#sheet"); if(s) s.remove(); document.body.style.overflow = ""; ED = null; }
let ED = null;
const varietiesOf = id => RS.filter(v => v.crop === id);
function varietySelect(id, cropId, value){
  const vs = varietiesOf(cropId); const known = vs.some(v => v.name === value);
  return '<select id="' + id + '" data-variety="' + cropId + '"><option value="">Not sure yet</option>' + (vs.length ? '<optgroup label="From Real Seeds">' + vs.map(v => '<option value="' + esc(v.name) + '"' + (v.name === value ? " selected" : "") + ">" + esc(v.name + (v.tag ? " · " + v.tag.toLowerCase() : "") + (v.organic ? " · organic" : "")) + "</option>").join("") + "</optgroup>" : "") + (value && !known ? '<option value="' + esc(value) + '" selected>' + esc(value) + "</option>" : "") + '<option value="__other">Another variety…</option></select>';
}
function levelTiles(act, selected){
  return LEVELS.map(L => { const cs = CROPS.filter(c => c.level === L[0]).sort((a, b) => a.name.localeCompare(b.name)); return '<div class="level"><h3>' + esc(L[1]) + '</h3><p class="small muted" style="margin:2px 0 8px">' + esc(L[2]) + '</p><div class="tiles">' + cs.map(c => '<button class="tile" data-act="' + act + '" data-crop="' + c.id + '" data-q="' + esc((c.name + " " + FAMILIES[c.fam]).toLowerCase()) + '" aria-pressed="' + !!(selected && selected[c.id]) + '"><span class="dot fam-' + c.fam + '"></span>' + esc(c.name) + "</button>").join("") + "</div></div>"; }).join("");
}

/* pick a crop (from the + button or a free space) */
function pickCrop(opts){
  opts = opts || {};
  ED = {type:"pick", opts};
  const fit = opts.gap ? fillers(opts.gap) : null;
  sheet(opts.gap ? "What could go here?" : "Add a crop",
    (opts.gap ? '<p class="note" style="margin-bottom:14px">' + esc(opts.gapText) + "</p>" + (fit.length ? '<p class="label" style="margin-bottom:8px">These fit the gap</p><div class="tiles" style="margin-bottom:18px">' + fit.map(f => '<button class="tile" data-act="pick" data-crop="' + f.c.id + '" data-month="' + f.month + '" data-yr="' + f.yr + '"><span class="dot fam-' + f.c.fam + '"></span><span>' + esc(f.c.name) + '<small class="muted" style="display:block;font-weight:400">' + (f.follows ? "follows well · " : "") + "sow " + MON[f.month - 1] + ", clear " + fmt(f.clear) + "</small></span></button>").join("") + "</div>" : '<p class="muted" style="margin-bottom:14px">Nothing in the guide fits this gap neatly. A green manure or a mulch keeps the soil covered.</p>') + '<p class="label" style="margin-bottom:8px">Or choose any crop</p>' : "") +
    '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="e.g. beans, kale, squash" autocomplete="off"></div>' + levelTiles("pick"), null, true);
}
function fillers(g){
  const before = P.plants.filter(p => p.bed === g.bed && parts(p).includes(g.part) && span(p)[1] <= g.from).sort((a, b) => span(b)[1] < span(a)[1] ? -1 : 1)[0];
  const likes = before ? CROP[before.crop].follows : [];
  const out = [];
  for(const c of CROPS) for(const yr of [-1, 0, 1]) for(const m of c.huw.sow){ if(yr === -1 && m < 9) continue; const t = {crop:c.id, month:m, yr, half:"a", bed:g.bed, part:g.part, span:1}; const d = datesOf(t); if(d.in >= g.from && d.clear <= g.to && daysBetween(g.from, d.in) <= 42){ const f = likes.includes(c.id); out.push({c, month:m, yr, clear:d.clear, follows:f, idle:daysBetween(g.from, d.in) + daysBetween(d.clear, g.to) / 20 - (f ? 30 : 0) - (c.level === "easy" ? 5 : 0)}); break; } }
  const seen = new Set(); return out.sort((a, b) => a.idle - b.idle).filter(f => !seen.has(f.c.id) && seen.add(f.c.id)).slice(0, 8);
}
/* the crop page: guide, variety, how much, when, where */
function cropSheet(p, isNew){
  const c = CROP[p.crop]; ED = {type:"crop", p:JSON.parse(JSON.stringify(p)), isNew, amt:defaultAmount(c)};
  const vs = varietiesOf(c.id);
  const months = c.huw.sow.slice().sort((a, b) => ((a - 9 + 12) % 12) - ((b - 9 + 12) % 12));
  sheet(c.name,
    calHTML(c) + '<p class="small" style="margin:12px 0 4px">' + esc(c.tip) + "</p>" + (c.timing ? '<p class="small muted" style="margin-bottom:12px">' + esc(c.timing) + "</p>" : '<div style="height:10px"></div>') +
    '<div class="field"><label for="c-var">Variety</label>' + varietySelect("c-var", c.id, p.variety || "") + '<input type="text" id="c-var-other" placeholder="Type the variety" hidden>' + (vs.length ? '<span class="small muted">' + vs.length + ' from <a href="' + esc(RSBASE + vs[0].page) + '" target="_blank" rel="noopener">Real Seeds</a></span>' : "") + "</div>" +
    (isNew ? '<p class="label">How much do you want?</p>' + amountControls("c", c, ED.amt) + '<p class="small" id="c-amount" style="margin:4px 0 14px"></p>' : "") +
    '<p class="label">When will you sow' + (isNew && c.succ ? " the first batch" : "") + '?</p><div class="chips" style="margin:8px 0 6px" id="mchips">' + months.map(m => '<button class="chip" data-act="m" data-m="' + m + '" aria-pressed="' + (p.month === m) + '">' + MON[m - 1] + (c.huw.cov.includes(m) ? " <small>under cover</small>" : "") + "</button>").join("") + "</div>" +
    '<div class="chips" style="margin-bottom:14px"><button class="chip" data-act="half" data-h="a" aria-pressed="' + (p.half !== "b") + '">Early in the month</button><button class="chip" data-act="half" data-h="b" aria-pressed="' + (p.half === "b") + '">Later in the month</button></div>' +
    '<div id="preview"></div>' +
    '<div class="field"><label for="c-where">Where</label><select id="c-where">' + whereOptions(p) + "</select></div>" +
    (isNew ? "" : '<details style="margin:10px 0"><summary class="label" style="cursor:pointer">Change a date or mark progress</summary><div class="grid2" style="margin-top:10px">' + stagesOf(c).map(k => '<div class="field"><label for="d-' + k + '">' + {sow:"Sow", plant:"Plant out", harvest:"Start picking", clear:"Clear"}[k] + (p.done && p.done[k] ? " (done)" : "") + '</label><input type="date" id="d-' + k + '" data-date="' + k + '" value="' + ((p.done || {})[k] || (p.dates || {})[k] || "") + '"></div>').join("") + '</div><p class="small muted">Leave a date blank to let the planner work it out. A date you type here stays put, and the later ones follow from it.</p></details>'),
    (isNew ? "" : '<button class="btn danger" data-act="del">Remove</button>' + (c.succ ? '<button class="btn" data-act="again" data-id="' + p.id + '">Sow again</button>' : "")) + '<span style="flex:1"></span><button class="btn primary" data-act="save-crop">' + (isNew ? "Add to my plan" : "Save") + "</button>", true);
  preview();
}
function amountControls(pre, c, a){
  const chip = (k, v, label) => '<button class="chip" data-act="amt" data-pre="' + pre + '" data-crop="' + c.id + '" data-k="' + k + '" data-v="' + v + '" aria-pressed="' + (a[k] === v) + '">' + label + "</button>";
  const seasonWeeks = Math.min(c.eat[2], c.hw * (c.sowings || 1) + (c.keep ? Math.round(c.keep * 4.3) : 0)) || c.hw;
  return '<div class="amount"><div><span class="small muted">Meals a week</span><div class="chips">' + [0.5, 1, 2, 3].map(v => chip("pw", v, v === 0.5 ? "½" : String(v))).join("") + '</div></div>' +
    '<div><span class="small muted">For how long</span><div class="chips">' + [[Math.max(2, Math.min(6, c.hw)), "A few weeks"], [seasonWeeks, "While it’s in season"], [c.eat[2] > seasonWeeks ? c.eat[2] : Math.min(52, seasonWeeks + 8), c.keep ? "As long as it stores" : "As long as possible"]].filter((x, i, arr) => arr.findIndex(y => y[0] === x[0]) === i).map(x => chip("weeks", x[0], x[1] + " <small>" + x[0] + " wks</small>")).join("") + '</div></div>' +
    '<div class="field" style="margin:0"><label class="small muted" for="' + pre + '-por-' + c.id + '" style="font-weight:400">Portion per meal (g)</label><input type="number" min="5" step="10" id="' + pre + '-por-' + c.id + '" data-por="' + c.id + '" data-pre="' + pre + '" value="' + a.por + '" style="max-width:120px"></div></div>';
}
function amountText(c, a){
  const r = amountPlan(c, a);
  let t = "About " + r1(r.kg) + " kg, which needs about " + r1(r.area) + " m²" + (r.plants ? " (" + plural(r.plants, "plant") + (r.sowings > 1 ? " each time" : "") + ")" : "") + ".";
  if(r.sowings > 1) t += " Sow " + r.sowings + " times, " + c.succ + " weeks apart, so there’s always some to pick.";
  if(r.covers < a.weeks) t += " One crop gives about " + r.covers + " weeks of eating" + (c.keep ? " including storage" : "") + ", not " + a.weeks + ".";
  return t;
}
function whereOptions(p){ let h = '<option value="auto"' + (!p.bed ? " selected" : "") + ">Find a space for me</option>"; P.sections.forEach(sec => { h += '<optgroup label="' + esc(sec.name) + '">'; bedsIn(sec).forEach(b => { for(let i = 0; i < b.parts; i++) h += '<option value="' + b.id + ":" + i + ':1"' + (p.bed === b.id && p.part === i && (p.span || 1) === 1 ? " selected" : "") + ">" + esc(b.name) + (b.parts > 1 ? ", part " + LETTER[i] : "") + "</option>"; if(b.parts > 1) h += '<option value="' + b.id + ':0:' + b.parts + '"' + (p.bed === b.id && p.span === b.parts ? " selected" : "") + ">" + esc(b.name) + ", whole bed</option>"; if(p.bed === b.id && p.span > 1 && p.span < b.parts) h += '<option value="' + b.id + ":" + p.part + ":" + p.span + '" selected>' + esc(whereText(p)) + "</option>"; }); h += "</optgroup>"; }); return h; }
function readCropForm(){
  const p = ED.p; const w = $("#c-where").value;
  if(w === "auto"){ p.bed = ""; p.part = 0; p.span = 1; p.auto = true; } else { const [b, i, n] = w.split(":"); p.bed = b; p.part = +i; p.span = +n || 1; p.auto = false; }
  const sv = $("#c-var").value; p.variety = sv === "__other" ? $("#c-var-other").value.trim() : sv;
  $$("[data-date]").forEach(el => { const k = el.dataset.date; if((p.done || {})[k]){ if(el.value) p.done[k] = el.value; else delete p.done[k]; } else { p.dates = p.dates || {}; if(el.value) p.dates[k] = el.value; else delete p.dates[k]; } });
  return p;
}
function preview(){
  const p = readCropForm(); const c = CROP[p.crop]; const t = Object.assign({}, p);
  const r = ED.isNew ? amountPlan(c, ED.amt) : null;
  if(p.auto) Object.assign(t, findSpace(t, r ? r.each : 0));
  const d = datesOf(t), ch = checks(t);
  if($("#c-amount")) $("#c-amount").textContent = amountText(c, ED.amt);
  $("#preview").innerHTML = '<div class="dates"><div><small>Sow</small><b>' + fmtY(d.sow) + "</b></div>" + (d.plant ? "<div><small>Plant out</small><b>" + fmtY(d.plant) + "</b></div>" : "<div><small>Plant out</small><b>sown in place</b></div>") + "<div><small>Start picking</small><b>" + fmtY(d.harvest) + "</b></div><div><small>Space free</small><b>" + fmtY(d.clear) + "</b></div></div>" +
    (p.auto ? '<p class="small muted" style="margin-bottom:10px">' + (t.bed ? "Space found: " + esc(whereText(t)) : "No free space at that time: it will wait in your list until you make room.") + "</p>" : "") +
    (d.waited ? '<p class="note frost small" style="margin-bottom:10px">' + esc(c.name) + " is tender, so planting waits until after your last frost (" + fmt(P.lf) + ").</p>" : "") +
    ch.map(x => '<p class="note ' + (x[0] === "bad" ? "warn" : "") + ' small" style="margin-bottom:8px">' + esc(x[1]) + "</p>").join("");
}
function calHTML(c){
  const row = (label, cells) => '<span class="src">' + label + "</span>" + cells.join("");
  const huwSow = m => c.huw.sow.includes(m) ? (c.huw.cov.includes(m) ? "sc" : "s") : "", huwHar = m => c.huw.har.includes(m) ? "h" : "";
  const cellH = (a, b) => '<span class="c"><i class="' + a + '"></i><i class="' + b + '"></i></span>';
  const huw = [], huwH = [], rs = [], rsH = [];
  for(let m = 1; m <= 12; m++){ huw.push(cellH(huwSow(m), huwSow(m))); huwH.push(cellH(huwHar(m), huwHar(m))); }
  if(c.rs){ const s = halves(c.rs.sow), sm = halves(c.rs.maybe), h = halves(c.rs.har), hs = halves(c.rs.store); for(let m = 0; m < 12; m++){ const k = i => s.has(i) ? "s" : sm.has(i) ? "sm" : ""; const kh = i => h.has(i) ? "h" : hs.has(i) ? "hm" : ""; rs.push(cellH(k(m * 2), k(m * 2 + 1))); rsH.push(cellH(kh(m * 2), kh(m * 2 + 1))); } }
  return '<div class="cal" aria-label="Sowing and harvesting months"><span></span>' + MON.map(m => '<span class="m">' + m[0] + "</span>").join("") + row("Huw: sow", huw) + row("Huw: pick", huwH) + (c.rs ? row("Real Seeds: sow", rs) + row("Real Seeds: pick", rsH) : "") + '</div><div class="legend"><span><i style="background:#2B6643"></i>sow under cover</span><span><i style="background:#4FBF6A"></i>sow</span><span><i style="background:#BCE6C6"></i>also possible</span><span><i style="background:#4FA8D8"></i>pick</span>' + (c.rs && c.rs.store ? '<span><i style="background:#BEDDF0"></i>from store</span>' : "") + "</div>";
}
/* the first sowing plus its follow-on sowings, all as suggested (not fixed) dates */
function sowingsFor(p, n){
  const c = CROP[p.crop], list = [p]; const first = datesOf(p).sow;
  for(let i = 1; i < n; i++){ const s = addWeeks(first, c.succ * i); const m = monthOf(s); if(!c.huw.sow.includes(m) && !(c.rs && halfIn(c.rs.sow + "," + c.rs.maybe, m))) break; const q = JSON.parse(JSON.stringify(p)); q.id = uid("p"); q.month = m; q.half = parse(s).getDate() > 15 ? "b" : "a"; q.yr = parse(s).getFullYear() - P.year; q.dates = {}; q.done = {}; list.push(q); }
  return list;
}
function saveCrop(){
  const p = readCropForm(); const isNew = ED.isNew; const c = CROP[p.crop];
  let n = 1;
  change(() => {
    if(!isNew){ delete p.auto; const i = P.plants.findIndex(x => x.id === p.id); P.plants[i] = p; return; }
    const r = amountPlan(c, ED.amt); p.amount = ED.amt;
    const list = sowingsFor(p, r.sowings); n = list.length;
    list.forEach(q => { P.plants.push(q); if(q.auto) placeAll(q, r.each); else { delete q.auto; q.area = r1(r.each); } });
  }, isNew ? c.name + " added" + (n > 1 ? " (" + n + " sowings)" : "") : "Saved");
  closeSheet();
}

/* ---------- beds editor (setup step and Edit beds) ---------- */
function bedsEditorHTML(){
  return P.sections.map((sec, si) => { const bs = bedsIn(sec);
    return '<div class="card section-card" data-sec="' + sec.id + '"><div class="sec-top"><div class="field" style="margin:0;flex:1"><label for="sec-' + sec.id + '">Section name</label><input type="text" id="sec-' + sec.id + '" data-secname="' + sec.id + '" value="' + esc(sec.name) + '"></div>' + (P.sections.length > 1 ? '<button class="btn small ghost danger" data-act="sec-del" data-sec="' + sec.id + '">Remove section</button>' : "") + "</div>" +
      '<p class="label" style="margin:12px 0 6px">Make every bed in this section</p><div class="chips">' + SIZES.map(s => '<button class="chip" data-act="sec-size" data-sec="' + sec.id + '" data-l="' + s[1] + '" data-w="' + s[2] + '" aria-pressed="' + (bs.length > 0 && bs.every(b => b.len === s[1] && b.wid === s[2])) + '">' + s[0] + " <small>" + s[1] + " × " + s[2] + " m</small></button>").join("") + "</div>" +
      '<div class="chips" style="margin-top:8px"><span class="small muted" style="align-self:center">Split each bed into</span>' + [1, 2, 3, 4].map(n => '<button class="chip" data-act="sec-parts" data-sec="' + sec.id + '" data-n="' + n + '" aria-pressed="' + (bs.length > 0 && bs.every(b => b.parts === n)) + '">' + (n === 1 ? "Whole bed" : n + " parts") + "</button>").join("") + "</div>" +
      '<div class="bed-list">' + bs.map(b => '<div class="bed-row" data-bed="' + b.id + '"><input type="text" aria-label="Bed name" data-bf="name" value="' + esc(b.name) + '" class="bn"><label class="dim"><input type="number" step="0.1" min="0.2" data-bf="len" value="' + b.len + '" aria-label="' + esc(b.name) + ' length in metres"> × <input type="number" step="0.1" min="0.2" data-bf="wid" value="' + b.wid + '" aria-label="' + esc(b.name) + ' width in metres"> m</label><select data-bf="parts" aria-label="' + esc(b.name) + ' parts">' + [1,2,3,4,6,8].map(n => '<option value="' + n + '"' + (b.parts === n ? " selected" : "") + ">" + (n === 1 ? "whole" : n + " parts") + "</option>").join("") + '</select><select data-bf="cover" aria-label="' + esc(b.name) + ' type"><option value="0">outdoors</option><option value="1"' + (b.cover ? " selected" : "") + '>under cover</option></select><button class="btn small ghost" data-act="bed-copy" data-bed="' + b.id + '" title="Give every bed in this section this size">Copy to all</button><button class="btn small ghost danger" data-act="bed-del" data-bed="' + b.id + '" aria-label="Remove ' + esc(b.name) + '">×</button></div>').join("") + "</div>" +
      '<button class="btn small" data-act="bed-add" data-sec="' + sec.id + '">+ Add a bed (' + esc(nextBedName(sec)) + ")</button></div>"; }).join("") +
    '<button class="btn" data-act="sec-add">+ Add a section</button><p class="small muted" style="margin-top:10px">' + plural(P.beds.length, "bed") + ", " + r1(totalArea()) + ' m² in all. 6 × 4 ft (1.8 × 1.2 m) is the usual raised bed; splitting a bed into parts lets you grow different crops side by side.</p>';
}
function refreshBedsEditor(){ const el = $("#beds-editor"); if(el){ const y = $("#sheet .sheet").scrollTop; el.innerHTML = bedsEditorHTML(); $("#sheet .sheet").scrollTop = y; } }
function openBedsEditor(){ ED = {type:"beds"}; if(!P.sections.length) addSection(); sheet("Sections & beds", '<div id="beds-editor">' + bedsEditorHTML() + "</div>", '<button class="btn primary" data-act="beds-done">Done</button>', true); }

/* ---------- setup ---------- */
const STEPS_N = 6;
function setup(step){
  W = W || {picks:{}};
  const bar = '<div class="steps">' + Array.from({length:STEPS_N}, (_, i) => '<i class="' + (i <= step ? "on" : "") + '"></i>').join("") + "</div>";
  if(step === 0) return sheet("Welcome", bar + '<p style="margin-bottom:18px">This planner works out when to sow, plant and pick each crop, how much to grow, and where it goes. Setting up takes about five minutes.</p><div style="display:grid;gap:10px"><button class="btn primary big" data-act="setup" data-step="1">Set up my plot</button><button class="btn big" data-act="example">Show me an example first</button><button class="btn big" data-act="file-open">Open a plan file</button></div><p class="small muted" style="margin-top:14px">The example is Huw Richards’ one-bed plan: one bed, two halves, six crops in a year.</p>');
  if(step === 1) return sheet("Where do you grow?", bar + '<p style="margin-bottom:12px">This sets your frost dates, which move every sowing date earlier or later.</p><div class="region-list">' + REGIONS.map(r => '<button class="chip" data-act="region-pick" data-r="' + r[0] + '" aria-pressed="' + (P.region === r[0]) + '"><span>' + esc(r[1]) + "</span>" + (r[0] !== "custom" ? "<small>last frost ~" + fmt(P.year + "-" + r[2]) + "</small>" : "") + "</button>").join("") + "</div>");
  if(step === 2){ if(!P.sections.length) addSection(); save(); ED = {type:"beds"}; return sheet("Your plot", bar + '<p style="margin-bottom:12px">Group your beds into sections, the way they’re laid out on the plot: Section 1 has beds 1A, 1B, 1C…, Section 2 has 2A, 2B… Pick a size for a whole section at once, then change any bed that’s different.</p><div id="beds-editor">' + bedsEditorHTML() + "</div>", '<button class="btn" data-act="setup" data-step="1">Back</button><span style="flex:1"></span><button class="btn primary" data-act="setup" data-step="3">Next</button>', true); }
  if(step === 3){ ED = {type:"setup-crops"}; return sheet("What would you like to grow?", bar + '<p style="margin-bottom:8px">Tap the crops you want. If you’re new to this, pick mostly from the first group.</p><div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="e.g. beans, kale, squash" autocomplete="off"></div>' + levelTiles("toggle", W.picks) + '<div id="picked"></div>', '<button class="btn" data-act="setup" data-step="2">Back</button><span style="flex:1"></span><button class="btn primary" data-act="to-amounts">Next</button>', true), renderPicked(); }
  if(step === 4){ ED = {type:"amounts"}; return sheet("How much do you eat?", bar + '<p style="margin-bottom:10px">This decides how much space each crop gets and how many times to sow it. Rough guesses are fine.</p><div class="field"><span class="label">How many people do you cook for?</span><div class="chips">' + [1, 2, 3, 4, 5, 6].map(n => '<button class="chip" data-act="people" data-n="' + n + '" aria-pressed="' + ((P.people || 2) === n) + '">' + n + (n === 6 ? "+" : "") + "</button>").join("") + '</div></div><div id="amounts">' + amountsHTML() + '</div><div class="note" id="space-sum" style="position:sticky;bottom:64px;margin-top:10px"></div>', '<button class="btn" data-act="setup" data-step="3">Back</button><span style="flex:1"></span><button class="btn primary" data-act="to-review">Next</button>', true), spaceSummary(); }
  if(step === 5) return review(bar);
}
function renderPicked(){
  const el = $("#picked"); if(!el) return; const ids = Object.keys(W.picks);
  el.innerHTML = ids.length ? '<h3 style="margin:18px 0 8px">Your choices</h3><p class="small muted" style="margin-bottom:8px">Pick a variety now if you know it, or leave it for later.</p><div class="picked">' + ids.map(id => { const c = CROP[id]; return '<div class="pick-row"><span class="dot fam-' + c.fam + '"></span><b>' + esc(c.name) + "</b>" + varietySelect("pv-" + id, id, W.picks[id].variety || "") + '<input type="text" id="pv-other-' + id + '" data-pvother="' + id + '" placeholder="Type the variety" value="' + esc(W.picks[id].other || "") + '"' + (W.picks[id].variety === "__other" ? "" : " hidden") + '><button class="btn small ghost" data-act="unpick" data-crop="' + id + '" aria-label="Remove ' + esc(c.name) + '">×</button></div>'; }).join("") + "</div>" : "";
}
function amountsHTML(){
  return Object.keys(W.picks).map(id => { const c = CROP[id], pk = W.picks[id]; pk.amt = pk.amt || defaultAmount(c); const v = pk.variety === "__other" ? pk.other : pk.variety;
    return '<div class="card amount-card" data-crop="' + id + '"><div class="card-h"><h3><span class="dot fam-' + c.fam + '"></span>' + esc(c.name) + (v ? ' <small class="muted">' + esc(v) + "</small>" : "") + "</h3></div>" + amountControls("w", c, pk.amt) + '<p class="small amount-out" id="ao-' + id + '">' + esc(amountText(c, pk.amt)) + "</p>" + (c.timing ? '<p class="small muted">' + esc(c.timing) + "</p>" : "") + "</div>"; }).join("") || '<p class="muted">Go back and pick some crops first.</p>';
}
function spaceSummary(){
  const el = $("#space-sum"); if(!el) return;
  const need = Object.keys(W.picks).reduce((a, id) => a + amountPlan(CROP[id], W.picks[id].amt || defaultAmount(CROP[id])).area, 0), have = totalArea();
  el.className = "note" + (need > have * 1.6 ? " warn" : "");
  el.innerHTML = "<b>Space needed: about " + r1(need) + " m².</b> Your beds: " + r1(have) + " m². " + (need <= have ? "That fits." : need <= have * 1.6 ? "Beds are reused through the year, so this may still fit; the next step shows exactly." : "That’s a lot more than you have. Eat a little less of the space-hungry crops (potatoes, squash, onions), or add beds.");
}
function buildPlan(){
  /* tentative placement on a copy so the review can be undone */
  const ids = Object.keys(W.picks).sort((a, b) => amountPlan(CROP[b], W.picks[b].amt).each - amountPlan(CROP[a], W.picks[a].amt).each);
  ids.forEach(id => { const c = CROP[id], pk = W.picks[id]; const r = amountPlan(c, pk.amt); const p = newPlant(id); p.variety = pk.variety === "__other" ? (pk.other || "") : (pk.variety || ""); p.amount = pk.amt; sowingsFor(p, r.sowings).forEach(q => { P.plants.push(q); placeAll(q, r.each); }); });
}
function review(bar){
  W.before = W.before || JSON.stringify(P);
  P = JSON.parse(W.before); buildPlan();
  const unplaced = P.plants.filter(p => !bedById(p.bed));
  const body = bar + '<p style="margin-bottom:12px">Here’s where everything goes. Crops share beds through the year: when one is cleared, the next goes in.</p>' +
    P.sections.map(sec => '<h3 style="margin:14px 0 6px">' + esc(sec.name) + "</h3>" + bedsIn(sec).map(b => { const ps = P.plants.filter(p => p.bed === b.id).sort((a, c) => span(a)[0] < span(c)[0] ? -1 : 1); return '<div class="rev-bed"><b>' + esc(b.name) + "</b>" + (ps.length ? ps.map(p => '<span class="rev-item"><span class="dot fam-' + CROP[p.crop].fam + '"></span>' + esc(CROP[p.crop].name) + ' <small class="muted">' + (b.parts > 1 ? (parts(p).length === b.parts ? "whole bed" : "part " + parts(p).map(i => LETTER[i]).join("")) + ", " : "") + fmt(span(p)[0]) + "–" + fmtY(span(p)[1]) + "</small></span>").join("") : '<span class="muted small">free all year</span>') + "</div>"; }).join("")).join("") +
    (unplaced.length ? '<p class="note warn" style="margin-top:12px">' + plural(unplaced.length, "sowing") + " didn’t fit: " + esc(Array.from(new Set(unplaced.map(p => CROP[p.crop].name))).join(", ")) + ". Go back and eat a little less of something, or add beds. Or carry on: they’ll wait in your list.</p>" : '<p class="note" style="margin-top:12px">Everything fits.</p>');
  sheet("Your plan", body, '<button class="btn" data-act="back-amounts">Back</button><span style="flex:1"></span><button class="btn primary" data-act="finish">Start my plan</button>', true);
}
function finishSetup(){ P.setupDone = true; UNDO.push(W.before); save(); W = null; closeSheet(); view = "todo"; render(); toast("Your plan is ready. Check the calendar for the year at a glance.", true); }
function example(){
  const y = P.year; if(!P.sections.length) P.sections.push({id:uid("s"), name:"Section 1"});
  const b = {id:uid("b"), section:P.sections[0].id, name:"Huw’s one-bed plan", len:2.4, wid:1.2, parts:2, cover:false};
  const mk = (crop, part, dates) => ({id:uid("p"), crop, part, span:1, bed:b.id, month:monthOf(dates.sow || dates.plant), half:"a", yr:0, variety:"", dates, done:{}});
  change(() => {
    P.beds.push(b);
    P.plants.push(mk("radish", 0, {sow:y + "-03-08", clear:y + "-05-24"}), mk("bean-bush", 0, {sow:y + "-04-26", plant:y + "-06-01", clear:y + "-08-30"}), mk("spinach", 0, {sow:y + "-08-02", plant:y + "-09-06", clear:y + "-12-20"}), mk("lettuce", 1, {sow:y + "-03-01", plant:y + "-04-05", clear:y + "-06-14"}), mk("beetroot", 1, {sow:y + "-06-21", clear:y + "-10-25"}), Object.assign(mk("garlic", 1, {sow:y + "-11-08", clear:(y + 1) + "-07-04"}), {month:11}));
    P.setupDone = true; if(!P.region) P.region = "wales";
  }, null);
  W = null; closeSheet(); view = "garden"; gardenMonth = y + "-04-15"; render();
  toast("Huw’s one-bed plan added. Tap a crop to see why it goes there.");
}

/* ---------- files ---------- */
const LINK = {handle:null, name:"", ok:false};
function planFile(){ return new Blob([JSON.stringify(P, null, 1)], {type:"application/json"}); }
async function deliver(blob, name){
  const f = new File([blob], name, {type:blob.type});
  if(matchMedia("(pointer:coarse)").matches && navigator.canShare && navigator.canShare({files:[f]})){ try{ await navigator.share({files:[f]}); return; }catch(e){ if(e.name === "AbortError") return; } }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function openFile(){ const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json"; inp.onchange = async () => { const f = inp.files[0]; if(!f) return; let d; try{ d = JSON.parse(await f.text()); }catch(e){ d = null; } let msg = "Opened " + f.name;
  if(d && d.app === "allotment-planner"){ const r = fromAdvanced(d); d = r.plan; msg = "Brought in " + r.n + " crops from the advanced planner" + (r.skipped.length ? " (left out: " + r.skipped.join(", ") + ")" : ""); }
  if(!d || d.app !== APP){ toast("That file isn’t a plan from this planner"); return; }
  UNDO.push(JSON.stringify(P)); P = upgrade(d); P.setupDone = true; W = null; save(); closeSheet(); view = "todo"; render(); toast(msg, true); }; inp.click(); }
const FROM_LIB = {"broad-beans":"bean-broad","peas":"peas","french-beans":"bean-bush","runner-beans":"bean-runner","lettuce":"lettuce","lambs-lettuce":"lettuce","spinach":"spinach","chard":"chard","rocket":"rocket","oriental-leaves":"mustards","pak-choi":"pak-choi","chicory":"chicory","onions":"onions-seed","onions-ow":"onions-seed","onion-sets":"onions-sets","onion-sets-autumn":"onions-sets","shallots":"shallots","spring-onions":"spring-onion","leeks":"leeks","garlic":"garlic","cabbage":"cabbage-summer","cauliflower":"cauliflower","calabrese":"calabrese","psb":"psb-early","sprouts":"sprouts","flower-sprouts":"sprouts","kale":"kale","cavolo-nero":"kale","kohlrabi":"kohlrabi","turnip":"turnips","swede":"swede","radish":"radish","beetroot":"beetroot","carrots":"carrots","parsnips":"parsnips","salsify":"salsify","scorzonera":"salsify","celeriac":"celeriac","celery":"celery","fennel":"fennel","potato-first":"potato-early","potato-second":"potato-second","potato-main":"potato-main","tomatoes":"tomatoes","peppers":"peppers","chillies":"peppers","aubergine":"aubergine","courgette":"courgettes","cucumber":"cucumbers","melon":"cucumbers","squash":"squash-winter","pumpkin":"squash-winter","sweetcorn":"sweetcorn","oca":"oca","basil":"basil","parsley":"parsley","coriander":"coriander","dill":"dill"};
function fromAdvanced(d){
  const s = d.settings || {}, y = +(s.lastFrost || "").slice(0, 4) || planYear();
  const plan = {app:APP, v:2, name:(d.meta && d.meta.name) || "My plot", region:"custom", lf:s.lastFrost || y + "-" + REF_LF, ff:s.firstFrost || y + "-" + REF_FF, year:y, people:2, sections:[], beds:[], plants:[], setupDone:true};
  const beds = Object.values(d.beds || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  beds.forEach(b => { const g = b.group || "Section 1"; let sec = plan.sections.find(x => x.name === g); if(!sec){ sec = {id:"s" + (plan.sections.length + 1), name:g}; plan.sections.push(sec); } plan.beds.push({id:b.id, section:sec.id, name:b.name, len:+b.length || 1, wid:+b.width || 1, parts:Math.max(1, Math.min(8, +b.strips || 1)), cover:b.type === "cover"}); });
  const skipped = new Set(); let n = 0;
  Object.values(d.plantings || {}).forEach(p => {
    const c = (d.crops || {})[p.crop] || {}; const id = FROM_LIB[c.lib || p.crop]; if(!id){ skipped.add(c.name || p.label || p.crop); return; }
    const b = (d.beds || {})[p.bed], parts = b ? Math.max(1, Math.min(8, +b.strips || 1)) : 1, strips = b ? Math.max(1, +b.strips || 1) : 1;
    const a = b ? Math.min(parts - 1, Math.floor((+p.s1 - 1) * parts / strips)) : 0, z = b ? Math.min(parts - 1, Math.floor((+p.s2 - 1) * parts / strips)) : 0;
    const dates = {}, done = {}; const map = {sow:"sow", plant:"plantOut", harvest:"harvestFrom", clear:"clearBy"};
    Object.entries(map).forEach(([k, v]) => { if(p[v]){ if((p.done || {})[k === "plant" ? "plantOut" : k]) done[k] = p[v]; else dates[k] = p[v]; } });
    if(!CROP[id].huw.tp || CROP[id].how === "direct"){ delete dates.plant; delete done.plant; }
    const variety = (/\(([^)]+)\)/.exec(c.name || "") || [])[1] || "";
    const first = p.sow || p.plantOut || p.clearBy;
    plan.plants.push({id:p.id, crop:id, month:first ? monthOf(first) : 3, half:"a", yr:first ? +first.slice(0, 4) - y : 0, bed:b ? b.id : "", part:a, span:z - a + 1, variety, dates, done, note:p.notes || ""}); n++;
  });
  return {plan, n, skipped:Array.from(skipped)};
}
function idb(){ return new Promise((res, rej) => { const r = indexedDB.open(APP, 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kv(k, v){ try{ const db = await idb(); return await new Promise(res => { const tx = db.transaction("kv", v === undefined ? "readonly" : "readwrite"); const st = tx.objectStore("kv"); const q = v === undefined ? st.get(k) : v === null ? st.delete(k) : st.put(v, k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }catch(e){ return undefined; } }
async function linkFile(){ try{ const h = await window.showSaveFilePicker({suggestedName:"allotment-plan.json", types:[{description:"Plan file", accept:{"application/json":[".json"]}}]}); LINK.handle = h; LINK.name = h.name; LINK.ok = true; await kv("link", h); await writeLinked(); render(); toast("Every change now saves into " + h.name); }catch(e){ if(e.name !== "AbortError") toast("Couldn’t link that file"); } }
let lT = 0; function saveLinkedSoon(){ if(LINK.handle && LINK.ok){ clearTimeout(lT); lT = setTimeout(writeLinked, 500); } }
async function writeLinked(){ try{ const w = await LINK.handle.createWritable(); await w.write(JSON.stringify(P, null, 1)); await w.close(); }catch(e){ LINK.ok = false; linkBanner(); } }
async function restoreLink(){ if(!window.showSaveFilePicker) return; const h = await kv("link"); if(!h || !h.queryPermission) return; LINK.handle = h; LINK.name = h.name; LINK.ok = (await h.queryPermission({mode:"readwrite"})) === "granted"; if(LINK.ok){ try{ const d = JSON.parse(await (await h.getFile()).text()); if(d.app === APP && (d.updated || "") > (P.updated || "")){ P = upgrade(d); try{ localStorage.setItem(KEY, JSON.stringify(P)); }catch(e){} } }catch(e){} } }
function linkBanner(){ const el = $("#link-banner"); if(!el) return; el.hidden = !(LINK.handle && !LINK.ok); }
async function reconnect(){ try{ LINK.ok = (await LINK.handle.requestPermission({mode:"readwrite"})) === "granted"; }catch(e){} if(LINK.ok){ await writeLinked(); toast("Saving to " + LINK.name + " again"); } render(); }
function ics(){
  const st = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"), e = s => String(s).replace(/[\\;,]/g, m => "\\" + m);
  const L = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Allotment planner//EN","X-WR-CALNAME:" + e(P.name + " jobs")];
  allJobs().filter(j => !j.done && j.date >= addWeeks(thisWeek, -1)).forEach(j => { const d = j.week.replace(/-/g, ""); L.push("BEGIN:VEVENT","UID:" + j.p.id + "-" + j.key + "@allotment-planner","DTSTAMP:" + st,"DTSTART;VALUE=DATE:" + d,"DTEND;VALUE=DATE:" + addDays(j.week, 1).replace(/-/g, ""),"SUMMARY:" + e(j.text + " (this week)"),"DESCRIPTION:" + e(j.meta),"TRANSP:TRANSPARENT","END:VEVENT"); });
  L.push("END:VCALENDAR"); deliver(new Blob([L.join("\r\n")], {type:"text/calendar"}), "allotment jobs.ics");
}

/* ---------- toast ---------- */
let tT = 0;
function toast(msg, canUndo){ let el = $("#toast"); if(!el){ el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); } el.innerHTML = "<span>" + esc(msg) + "</span>" + (canUndo && UNDO.length ? '<button data-act="undo">Undo</button>' : ""); el.hidden = false; clearTimeout(tT); tT = setTimeout(() => el.hidden = true, 5000); }
function confirmTwice(el, text){ if(el.dataset.armed) return true; el.dataset.armed = "1"; const t = el.textContent; el.textContent = text || "Tap again to confirm"; setTimeout(() => { delete el.dataset.armed; el.textContent = t; }, 4000); return false; }

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act],[data-view]"); if(!el) return;
  if(el.tagName === "A") return;
  const a = el.dataset.act || (el.dataset.view ? "nav" : "");
  const inSetup = !!W && !P.setupDone;
  const A = {
    nav: () => { view = el.dataset.view; closeSheet(); render(); scrollTo(0, 0); },
    close: () => { closeSheet(); if(W && !P.setupDone && W.before){ P = JSON.parse(W.before); save(); } render(); },
    undo,
    add: () => pickCrop(),
    pick: () => { const p = newPlant(el.dataset.crop, el.dataset.month ? +el.dataset.month : null, el.dataset.yr != null ? +el.dataset.yr : null); if(ED && ED.opts && ED.opts.gap){ p.bed = ED.opts.gap.bed; p.part = ED.opts.gap.part; p.span = 1; p.auto = false; } cropSheet(p, true); },
    edit: () => { const p = P.plants.find(x => x.id === el.dataset.id); if(p) cropSheet(p, false); },
    m: () => { ED.p.month = +el.dataset.m; ED.p.yr = yrFor(CROP[ED.p.crop], ED.p.month); ED.p.dates = {}; $$("#mchips .chip").forEach(b => b.setAttribute("aria-pressed", b === el)); $$("[data-date]").forEach(i => { if(!(ED.p.done || {})[i.dataset.date]) i.value = ""; }); preview(); },
    half: () => { ED.p.half = el.dataset.h; $$('[data-act="half"]').forEach(b => b.setAttribute("aria-pressed", b === el)); preview(); },
    amt: () => { const id = el.dataset.crop, k = el.dataset.k, v = +el.dataset.v; const amt = el.dataset.pre === "c" ? ED.amt : W.picks[id].amt; amt[k] = v; $$('[data-act="amt"][data-crop="' + id + '"][data-k="' + k + '"][data-pre="' + el.dataset.pre + '"]').forEach(b => b.setAttribute("aria-pressed", b === el)); if(el.dataset.pre === "c") preview(); else { $("#ao-" + id).textContent = amountText(CROP[id], amt); spaceSummary(); } },
    "save-crop": saveCrop,
    del: () => { const id = ED.p.id, n = CROP[ED.p.crop].name; closeSheet(); change(() => { P.plants = P.plants.filter(p => p.id !== id); }, n + " removed"); },
    again: () => { const src = P.plants.find(x => x.id === el.dataset.id) || (ED && ED.p); const c = CROP[src.crop]; const s = addWeeks(datesOf(src).sow, c.succ || 4); const q = newPlant(src.crop, monthOf(s), parse(s).getFullYear() - P.year); q.half = parse(s).getDate() > 15 ? "b" : "a"; q.variety = src.variety || ""; q.amount = src.amount; change(() => { P.plants.push(q); placeAll(q, src.area || 0); }, "Next sowing of " + c.name.toLowerCase() + " added for " + fmt(datesOf(q).sow)); closeSheet(); },
    part: () => { const b = bedById(el.dataset.bed), i = +el.dataset.part; const sel = gardenMonth || today.slice(0, 7) + "-15"; const prev = P.plants.filter(p => p.bed === b.id && parts(p).includes(i) && span(p)[1] <= sel).map(span).map(s => s[1]).sort().pop() || monday(addDays(sel, -14)); const nextP = P.plants.filter(p => p.bed === b.id && parts(p).includes(i) && span(p)[0] > sel).map(span).map(s => s[0]).sort()[0] || (P.year + 1) + "-03-01"; const from = maxD(prev, thisWeek); pickCrop({gap:{bed:b.id, part:i, from, to:nextP}, gapText:b.name + (b.parts > 1 ? ", part " + LETTER[i] : "") + " is free from " + fmtY(from) + " until " + fmtY(nextP) + "."}); },
    month: () => { gardenMonth = el.dataset.d; render(); },
    print: () => window.print(),
    region: () => { W = W || {picks:{}}; setup(1); },
    "region-pick": () => { const r = REGIONS.find(x => x[0] === el.dataset.r); P.region = r[0]; if(r[0] !== "custom"){ P.lf = P.year + "-" + r[2]; P.ff = P.year + "-" + r[3]; } save(); if(inSetup || (W && W.running)) setup(2); else { closeSheet(); render(); toast(r[0] === "custom" ? "Type your frost dates below" : "Frost dates set for " + r[1]); } },
    setup: () => { W = W || {picks:{}}; if(+el.dataset.step === 1 && P.setupDone){ W = {picks:{}, running:true}; } setup(+el.dataset.step); },
    toggle: () => { const id = el.dataset.crop; if(W.picks[id]) delete W.picks[id]; else W.picks[id] = {variety:""}; el.setAttribute("aria-pressed", !!W.picks[id]); renderPicked(); },
    unpick: () => { delete W.picks[el.dataset.crop]; const t = $('.tile[data-crop="' + el.dataset.crop + '"]'); if(t) t.setAttribute("aria-pressed", "false"); renderPicked(); },
    "to-amounts": () => { if(!Object.keys(W.picks).length){ toast("Pick at least one crop"); return; } setup(4); },
    "to-review": () => { W.before = null; setup(5); },
    "back-amounts": () => { P = JSON.parse(W.before); W.before = null; setup(4); },
    people: () => { P.people = +el.dataset.n; Object.keys(W.picks).forEach(id => { W.picks[id].amt = defaultAmount(CROP[id]); }); $$('[data-act="people"]').forEach(b => b.setAttribute("aria-pressed", b === el)); $("#amounts").innerHTML = amountsHTML(); spaceSummary(); },
    finish: finishSetup, example,
    "beds-edit": openBedsEditor,
    "beds-done": () => { closeSheet(); render(); },
    "sec-add": () => { addSection(); save(); refreshBedsEditor(); },
    "sec-del": () => { if(!confirmTwice(el, "Tap again to remove")) return; const id = el.dataset.sec; const gone = P.beds.filter(b => b.section === id).map(b => b.id); P.sections = P.sections.filter(s => s.id !== id); P.beds = P.beds.filter(b => b.section !== id); P.plants.forEach(p => { if(gone.includes(p.bed)) p.bed = ""; }); save(); refreshBedsEditor(); },
    "sec-size": () => { bedsIn(sectionById(el.dataset.sec)).forEach(b => { b.len = +el.dataset.l; b.wid = +el.dataset.w; }); save(); refreshBedsEditor(); },
    "sec-parts": () => { bedsIn(sectionById(el.dataset.sec)).forEach(b => { b.parts = +el.dataset.n; }); P.plants.forEach(p => { const b = bedById(p.bed); if(b && p.part >= b.parts){ p.part = 0; p.span = 1; } }); save(); refreshBedsEditor(); },
    "bed-add": () => { addBed(sectionById(el.dataset.sec)); save(); refreshBedsEditor(); },
    "bed-copy": () => { const src = bedById(el.dataset.bed); bedsIn(sectionById(src.section)).forEach(b => { b.len = src.len; b.wid = src.wid; b.parts = src.parts; }); save(); refreshBedsEditor(); toast("Every bed in " + sectionById(src.section).name + " is now " + src.len + " × " + src.wid + " m"); },
    "bed-del": () => { const id = el.dataset.bed; P.beds = P.beds.filter(b => b.id !== id); P.plants.forEach(p => { if(p.bed === id) p.bed = ""; }); save(); refreshBedsEditor(); },
    "file-save": () => deliver(planFile(), "allotment-plan.json"), "file-open": openFile, "file-link": linkFile, reconnect,
    ics,
    reset: () => { if(!confirmTwice(el, "Tap again to clear everything")) return; UNDO.push(JSON.stringify(P)); P = blank(); W = {picks:{}}; save(); render(); setup(0); }
  };
  if(A[a]){ e.preventDefault(); A[a](); }
});
document.addEventListener("change", e => {
  const t = e.target;
  if(t.dataset.job){ const p = P.plants.find(x => x.id === t.dataset.job), k = t.dataset.key; const d = datesOf(p); change(() => { p.done = p.done || {}; if(t.checked){ const planned = d[k]; p.done[k] = monday(planned) === thisWeek ? planned : today; const ks = stagesOf(CROP[p.crop]); ks.slice(0, ks.indexOf(k)).forEach(x => { if(!p.done[x]) p.done[x] = d[x] < today ? d[x] : today; }); } else delete p.done[k]; }, t.checked ? "Done" : "Unticked"); return; }
  if(t.dataset.bf){ const b = bedById(t.closest("[data-bed]").dataset.bed); const f = t.dataset.bf; b[f] = f === "name" ? t.value.trim() || b.name : f === "cover" ? t.value === "1" : +t.value || b[f]; save(); if(f === "parts") refreshBedsEditor(); return; }
  if(t.dataset.secname){ const s = sectionById(t.dataset.secname); s.name = t.value.trim() || s.name; save(); return; }
  if(t.dataset.variety){ const id = t.dataset.variety; if(t.id === "c-var"){ $("#c-var-other").hidden = t.value !== "__other"; return; } W.picks[id].variety = t.value; const o = $("#pv-other-" + id); if(o) o.hidden = t.value !== "__other"; return; }
  if(t.dataset.pvother){ W.picks[t.dataset.pvother].other = t.value.trim(); return; }
  if(t.dataset.por){ const id = t.dataset.por; const v = Math.max(5, +t.value || 0); if(t.dataset.pre === "c"){ ED.amt.por = v; preview(); } else { W.picks[id].amt.por = v; $("#ao-" + id).textContent = amountText(CROP[id], W.picks[id].amt); spaceSummary(); } return; }
  if(t.id === "s-name"){ change(() => P.name = t.value.trim() || "My plot", "Saved"); return; }
  if(t.id === "s-year"){ const y = +t.value; if(y > 2000){ change(() => { const dy = y - P.year; P.year = y; P.lf = (+P.lf.slice(0, 4) + dy) + P.lf.slice(4); P.ff = (+P.ff.slice(0, 4) + dy) + P.ff.slice(4); }, "Plan moved to " + y); } return; }
  if(t.id === "s-lf" || t.id === "s-ff"){ if(t.value) change(() => { P[t.id === "s-lf" ? "lf" : "ff"] = t.value; }, "Frost date saved: sowing dates updated"); return; }
  if(ED && ED.type === "crop" && t.closest("#sheet")) preview();
});
document.addEventListener("input", e => {
  if(e.target.id === "q"){ const q = e.target.value.trim().toLowerCase(); $$("#sheet .tile[data-q]").forEach(t => t.hidden = q && !t.dataset.q.includes(q)); $$("#sheet .level").forEach(l => l.hidden = !$$(".tile", l).some(t => !t.hidden)); }
});
document.addEventListener("keydown", e => { if(e.key === "Escape" && $("#sheet")) closeSheet(); if((e.metaKey || e.ctrlKey) && e.key === "z" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)){ e.preventDefault(); undo(); } });

/* ---------- start ---------- */
(async function(){
  P = load() || blank();
  await restoreLink();
  render();
  if(!P.setupDone){ W = {picks:{}}; setup(0); }
  window.__plan = {get P(){ return P; }, datesOf, checks, fillers, amountPlan, CROP};
})();
})();
