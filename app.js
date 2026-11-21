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
const LETTER = "ABCDEFGH";

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
const monthOf = s => parse(s).getMonth() + 1;
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
let P = null, UNDO = [], view = "todo", gardenMonth = null;
function planYear(){ const d = new Date(); return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear(); }
function blank(){ const y = planYear(); return {app:APP, v:1, name:"My plot", region:"", lf:y + "-" + REF_LF, ff:y + "-" + REF_FF, year:y, beds:[], plants:[], updated:""}; }
function load(){ try{ const d = JSON.parse(localStorage.getItem(KEY) || "null"); if(d && d.app === APP) return d; }catch(e){} return null; }
function save(){ P.updated = new Date().toISOString(); try{ localStorage.setItem(KEY, JSON.stringify(P)); }catch(e){} saveLinkedSoon(); showSaved(); }
function change(fn, msg){ UNDO.push(JSON.stringify(P)); if(UNDO.length > 40) UNDO.shift(); fn(); save(); render(); if(msg) toast(msg, true); }
function undo(){ if(!UNDO.length) return; P = JSON.parse(UNDO.pop()); save(); render(); toast("Undone"); }
function showSaved(){ const el = $("#saved"); if(el) el.textContent = LINK.handle && LINK.ok ? "Saved to " + LINK.name : "Saved on this device"; }

/* ---------- crop timings ---------- */
const isTransplanted = c => !!(c.huw && c.huw.tp) && c.how !== "direct";
const tpWeeks = c => c.huw && c.huw.tp ? (c.huw.tp[0] + c.huw.tp[1]) / 2 : 0;
function shiftDays(c, month){
  const y = P.year, cl = n => Math.max(-35, Math.min(35, n));
  if(month <= 7){ const d = cl(daysBetween(y + "-" + REF_LF, P.lf)); return c.tender ? d : d / 2; }
  return cl(daysBetween(y + "-" + REF_FF, P.ff)) / -2; /* earlier autumn frosts: sow autumn crops a little earlier */
}
function sowBase(p){ const c = CROP[p.crop]; const y = P.year + (p.yr || 0); const day = p.half === "b" ? 22 : 8; return monday(addDays(y + "-" + pad(p.month) + "-" + pad(day), shiftDays(c, p.month))); }
const STAGES = ["sow","plant","harvest","clear"];
function stagesOf(c){ return isTransplanted(c) ? STAGES : ["sow","harvest","clear"]; }
/* work out the four dates: from what's been done, what you fixed, or the guide */
function datesOf(p){
  const c = CROP[p.crop], ks = stagesOf(c), fixed = Object.assign({}, p.dates || {}, p.done || {});
  const gaps = isTransplanted(c) ? [tpWeeks(c), c.th, c.hw] : [c.th, c.hw];
  let ai = ks.findIndex(k => fixed[k]); const out = {};
  if(ai < 0){ ai = 0; out.sow = sowBase(p); } else out[ks[ai]] = fixed[ks[ai]];
  for(let i = ai + 1; i < ks.length; i++) out[ks[i]] = fixed[ks[i]] || monday(addWeeks(out[ks[i-1]], gaps[i-1]));
  for(let i = ai - 1; i >= 0; i--) out[ks[i]] = monday(addWeeks(out[ks[i+1]], -gaps[i]));
  /* tender plants wait for the last frost unless they're under cover */
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

/* ---------- space ---------- */
const bedById = id => P.beds.find(b => b.id === id);
function parts(p){ const b = bedById(p.bed); if(!b) return []; return p.part === -1 || p.part == null ? Array.from({length:b.parts}, (_, i) => i) : [p.part]; }
function span(p){ const d = datesOf(p); return [d.in, d.clear]; }
function clashes(p){ if(!p.bed) return []; const [a, z] = span(p), mine = parts(p); return P.plants.filter(q => q.id !== p.id && q.bed === p.bed && parts(q).some(x => mine.includes(x)) && (() => { const [b, y] = span(q); return a < y && b < z; })()); }
function fits(p){ return !!bedById(p.bed) && !clashes(p).length; }
function findSpace(p){ for(const b of P.beds) for(let i = 0; i < b.parts; i++){ const t = Object.assign({}, p, {bed:b.id, part:i}); if(fits(t)) return {bed:b.id, part:i}; } return {bed:"", part:0}; }
function whereText(p){ const b = bedById(p.bed); if(!b) return "No space yet"; return b.name + (b.parts > 1 ? (p.part === -1 ? " (whole bed)" : ", part " + LETTER[p.part]) : ""); }
function cropAt(b, part, date){ return P.plants.find(p => p.bed === b.id && parts(p).includes(part) && (() => { const [a, z] = span(p); return a <= date && date < z; })()); }

/* ---------- jobs ---------- */
function jobsOf(p){
  const c = CROP[p.crop], d = datesOf(p), placed = !!bedById(p.bed), where = placed ? whereText(p) : "no space chosen yet", v = p.variety ? " (" + p.variety + ")" : "", inW = placed ? " in " + where : "";
  const under = c.huw.cov.includes(monthOf(d.sow)) || c.cover || c.tender;
  const sowWord = {module:"Sow " + c.name + v + " in modules", pot:"Sow " + c.name + v + " in pots", direct:"Sow " + c.name + v + inW, sets:(isTransplanted(c) ? "Start " + c.name + v + " in modules" : "Plant " + c.name + v + inW)}[c.how];
  const out = [{key:"sow", date:d.sow, kind:c.how === "sets" && !isTransplanted(c) ? "plant" : "sow", text:sowWord, meta:isTransplanted(c) ? (under ? "under cover" + (c.tender ? ", with warmth" : "") : "outside or under cover") + " · ready to plant in about " + Math.round(tpWeeks(c)) + " weeks" : where}];
  if(d.plant) out.push({key:"plant", date:d.plant, kind:"plant", text:"Plant out " + c.name + v, meta:where + (under ? " · harden off for a week first" : "") + (d.waited ? " · waits for the last frost" : "")});
  out.push({key:"harvest", date:d.harvest, kind:"harvest", text:"Start picking " + c.name + v, meta:where});
  out.push({key:"clear", date:d.clear, kind:"clear", text:"Clear " + c.name + v, meta:where + " is free for the next crop"});
  return out.map(j => Object.assign(j, {p, week:monday(j.date), done:!!(p.done || {})[j.key]}));
}
const allJobs = () => P.plants.flatMap(jobsOf);
const RANK = {sow:1, plant:2, harvest:3, clear:4};

/* ---------- rendering ---------- */
function render(){
  today = iso(new Date()); thisWeek = monday(today);
  $$(".nav button").forEach(b => b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false"));
  $("#plan-name").textContent = P.name || "My plot";
  const main = $("#main");
  main.innerHTML = view === "garden" ? viewGarden() : view === "crops" ? viewCrops() : view === "more" ? viewMore() : viewTodo();
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
    '<div class="card"><div class="card-h"><h3>Coming up</h3></div>' + soon.map(s => '<p class="week-h">Week of ' + fmt(s.w) + "</p>" + (s.list.length ? '<ul class="jobs">' + s.list.map(li).join("") + "</ul>" : '<p class="small muted">Nothing planned.</p>')).join("") + "</div>";
}
const byDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : RANK[a.kind] - RANK[b.kind];
function seasonMonths(){ const out = []; for(let i = 0; i < 15; i++){ const m = (9 + i) % 12, y = P.year - 1 + Math.floor((9 + i) / 12); out.push({y, m, d:y + "-" + pad(m + 1) + "-15"}); } return out; }
function viewGarden(){
  if(!P.beds.length) return '<div class="card empty"><h2>No beds yet</h2><p>Add your beds or growing spaces under Settings.</p><button class="btn primary big" data-act="nav" data-view="more">Add a bed</button></div>';
  const ms = seasonMonths(); const cur = gardenMonth || (today.slice(0, 7) + "-15"); const sel = ms.find(x => x.d === cur) ? cur : ms[3].d;
  const a = ms[0].y + "-10-01", z = (P.year + 1) + "-01-01", total = daysBetween(a, z); const x = s => Math.max(0, Math.min(100, daysBetween(a, s) / total * 100));
  return '<div class="hero"><div><p class="eyebrow">Your beds</p><h1>' + MONTH[parse(sel).getMonth()] + " " + parse(sel).getFullYear() + '</h1></div><button class="btn small no-print" data-act="print">Print</button></div>' +
    '<div class="scroll-x no-print" style="margin-bottom:16px" id="months">' + ms.map(m => '<button class="chip" data-act="month" data-d="' + m.d + '" aria-pressed="' + (m.d === sel) + '">' + MON[m.m] + (m.m === 0 || m === ms[0] ? " ’" + String(m.y).slice(2) : "") + "</button>").join("") + "</div>" +
    '<div class="beds">' + P.beds.map(b => { const n = b.parts;
      const at = Array.from({length:n}, (_, i) => cropAt(b, i, sel));
      const tiles = Array.from({length:n}, (_, i) => { const p = at[i]; if(p && i > 0 && at[i-1] === p) return ""; let w = 1; while(p && i + w < n && at[i + w] === p) w++; if(!p) return '<button class="part free" data-act="part" data-bed="' + b.id + '" data-part="' + i + '"><span class="letter">' + (n > 1 ? LETTER[i] : "") + "</span>Free<small>+ add</small></button>"; const c = CROP[p.crop], d = datesOf(p); const picking = sel >= d.harvest; return '<button class="part fam-' + c.fam + (picking ? " picking" : "") + '" style="flex-grow:' + w + '" data-act="edit" data-id="' + p.id + '"><span class="letter">' + (n > 1 ? LETTER[i] + (w > 1 ? "–" + LETTER[i + w - 1] : "") : "") + "</span><b>" + esc(c.name) + "</b><small>" + (picking ? "picking" : sel < d.in ? "in trays" : "growing") + "</small></button>"; }).join("");
      const strips = Array.from({length:n}, (_, i) => '<div class="strip-row"><span>' + (n > 1 ? LETTER[i] : "") + '</span><div class="track">' + P.plants.filter(p => p.bed === b.id && parts(p).includes(i)).map(p => { const [s, e] = span(p); const c = CROP[p.crop]; return '<i class="fam-' + c.fam + '" style="left:' + x(s) + "%;width:" + Math.max(1, x(e) - x(s)) + '%" title="' + esc(c.name + ": " + fmt(s) + " to " + fmtY(e)) + '"></i>'; }).join("") + '<span class="now" style="left:' + x(sel) + '%"></span></div></div>').join("");
      return '<div class="bed"><div class="bed-h"><h3>' + esc(b.name) + '</h3><span class="small muted">' + b.len + " × " + b.wid + " m" + (b.cover ? " · under cover" : "") + '</span></div><div class="plot' + (n >= 4 ? " many" : "") + '">' + tiles + '</div><div class="strip">' + strips + '</div><div class="months">' + ms.map(m => "<span>" + MON[m.m][0] + "</span>").join("") + "</div></div>"; }).join("") + "</div>" +
    '<p class="small muted" style="margin-top:14px">Tap a free space to see what would fit there, or a crop to change it. Striped means it’s ready to pick. The bars under each bed show its whole season.</p>';
}
function viewCrops(){
  const ps = P.plants.slice().sort((a, b) => datesOf(a).sow < datesOf(b).sow ? -1 : 1);
  return '<div class="hero"><div><p class="eyebrow">Your crops</p><h1>What you’re growing</h1></div><button class="btn primary" data-act="add">+ Add a crop</button></div>' +
    (ps.some(p => !bedById(p.bed)) ? '<p class="note warn" style="margin-bottom:14px">' + ps.filter(p => !bedById(p.bed)).length + ' of your crops have no space yet. Add a bed or split a bed into more parts in <button class="btn small" data-act="nav" data-view="more">Settings</button>, or open a crop and pick a space for it.</p>' : "") +
    (ps.length ? '<ul class="plist">' + ps.map(p => { const c = CROP[p.crop], d = datesOf(p), ch = checks(p);
      return '<li><button class="pcard" style="--fam:var(--fam-' + c.fam + ')" data-act="edit" data-id="' + p.id + '"><b>' + esc(c.name) + "</b>" + (p.variety ? ' <span class="muted">' + esc(p.variety) + "</span>" : "") + ch.map(x => '<span class="flag' + (x[0] === "bad" ? " bad" : "") + '">' + esc(x[0] === "bad" ? "Check" : "Note") + "</span>").slice(0, 1).join("") + '<span class="small muted" style="display:block">' + esc(whereText(p)) + '</span><span class="when">Sow ' + fmt(d.sow) + (d.plant ? " · plant " + fmt(d.plant) : "") + " · pick " + fmtY(d.harvest) + " · clear " + fmtY(d.clear) + "</span></button></li>"; }).join("") + "</ul>"
      : '<div class="card empty"><p>No crops yet.</p><button class="btn primary big" data-act="add">Add a crop</button></div>');
}
function viewMore(){
  const reg = REGIONS.find(r => r[0] === P.region);
  return '<div class="hero"><div><p class="eyebrow">Settings</p><h1>Your plot</h1></div></div>' +
    '<div class="card"><h3>Plan</h3><div class="grid2" style="margin-top:10px"><div class="field"><label for="s-name">Name</label><input type="text" id="s-name" value="' + esc(P.name) + '"></div><div class="field"><label for="s-year">Growing year</label><input type="number" id="s-year" value="' + P.year + '"></div></div></div>' +
    '<div class="card"><h3>Frost dates</h3><p class="small muted" style="margin:4px 0 10px">' + (reg ? esc(reg[1]) + ". " : "") + 'Sowing times come from Huw Richards’ and Real Seeds’ calendars (west Wales, last frost about 1 May) and move earlier or later with your frost dates.</p><div class="grid2"><div class="field"><label for="s-lf">Last spring frost (average)</label><input type="date" id="s-lf" value="' + P.lf + '"></div><div class="field"><label for="s-ff">First autumn frost (average)</label><input type="date" id="s-ff" value="' + P.ff + '"></div></div><button class="btn small" data-act="region">Pick my area instead</button></div>' +
    '<div class="card"><div class="card-h"><h3>Beds</h3><button class="btn small" data-act="bed-add">+ Add a bed</button></div>' + (P.beds.length ? P.beds.map(bedRow).join("") : '<p class="muted">No beds yet.</p>') + '<p class="small muted">Split a bed into parts to grow different crops side by side, as in Huw’s one-bed plan (two halves).</p></div>' +
    '<div class="card"><h3>Keep your plan safe</h3><p class="small" style="margin:6px 0 12px">Your plan saves itself in this browser. To use it on another device, or to keep a copy, save a plan file and open it there.' + (window.showSaveFilePicker ? " On this computer you can also link a file so every change is saved into it." : "") + '</p><div class="row"><button class="btn" data-act="file-save">Save plan file</button><button class="btn" data-act="file-open">Open plan file</button>' + (window.showSaveFilePicker ? '<button class="btn" data-act="file-link">' + (LINK.handle ? "Linked: " + esc(LINK.name) : "Link a plan file") + "</button>" : "") + '</div></div>' +
    '<div class="card"><h3>Calendar &amp; printing</h3><p class="small" style="margin:6px 0 12px">Add every job to your phone’s calendar, or print your beds.</p><div class="row"><button class="btn" data-act="ics">Add jobs to my calendar</button><button class="btn" data-act="nav" data-view="garden">Print beds</button></div></div>' +
    '<div class="card"><h3>Start again</h3><div class="row" style="margin-top:10px"><button class="btn" data-act="example">Load Huw’s one-bed example</button><button class="btn danger" data-act="reset">Clear everything</button></div></div>' +
    '<div class="card"><h3>Where the advice comes from</h3><p class="small" style="margin-top:6px">Sowing and harvest months: Huw Richards’ <i>Master Vegetable Sowing List</i> and the one-bed example from <i>Productive Planting Plan 2.0</i>, and the <a href="https://realseeds.co.uk/Printablesowing.html" target="_blank" rel="noopener">Real Seeds sowing calendar</a>. Varieties: the <a href="https://realseeds.co.uk/" target="_blank" rel="noopener">Real Seeds catalogue</a>' + (window.REALSEEDS ? ", last checked " + esc(fmtLong(window.REALSEEDS.updated)) : "") + '. Growing times are typical figures; your varieties and weather decide the day.</p><p class="small" style="margin-top:8px">Want more (nursery trays, quantities, versions)? Try the <a href="full/">advanced planner</a>. It keeps its own, separate plan.</p></div>';
}
const fmtLong = s => { const d = parse(s); return d ? d.getDate() + " " + MONTH[d.getMonth()] + " " + d.getFullYear() : ""; };
function bedRow(b){ return '<div class="bed-edit" data-bed="' + b.id + '"><div class="field"><label for="b-n-' + b.id + '">Name</label><input type="text" id="b-n-' + b.id + '" data-bf="name" value="' + esc(b.name) + '"></div><div class="field"><label for="b-l-' + b.id + '">Length (m)</label><input type="number" step="0.1" min="0.2" id="b-l-' + b.id + '" data-bf="len" value="' + b.len + '"></div><div class="field"><label for="b-w-' + b.id + '">Width (m)</label><input type="number" step="0.1" min="0.2" id="b-w-' + b.id + '" data-bf="wid" value="' + b.wid + '"></div><div class="field"><label for="b-p-' + b.id + '">Split into</label><select id="b-p-' + b.id + '" data-bf="parts">' + [1,2,3,4,6,8].map(n => '<option value="' + n + '"' + (b.parts === n ? " selected" : "") + ">" + (n === 1 ? "1 (whole bed)" : n + " parts") + "</option>").join("") + '</select></div><div class="field"><label for="b-c-' + b.id + '">Type</label><select id="b-c-' + b.id + '" data-bf="cover"><option value="0"' + (b.cover ? "" : " selected") + '>Outdoors</option><option value="1"' + (b.cover ? " selected" : "") + '>Greenhouse / polytunnel</option></select></div><button class="btn small ghost danger" data-act="bed-del" data-bed="' + b.id + '" aria-label="Remove ' + esc(b.name) + '">Remove</button></div>'; }

/* ---------- sheets ---------- */
function sheet(title, body, foot){ const old = $("#sheet"); if(old) old.remove(); const w = document.createElement("div"); w.className = "sheet-wrap"; w.id = "sheet"; w.innerHTML = '<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t"><div class="sheet-h"><h2 id="sheet-t">' + esc(title) + '</h2><button class="btn small ghost" data-act="close">Close</button></div><div id="sheet-body">' + body + "</div>" + (foot ? '<div class="foot">' + foot + "</div>" : "") + "</div>"; document.body.appendChild(w); document.body.style.overflow = "hidden"; const h = $("#sheet-t"); h.tabIndex = -1; h.focus(); }
function closeSheet(){ const s = $("#sheet"); if(s) s.remove(); document.body.style.overflow = ""; ED = null; }
let ED = null;

/* pick a crop */
function pickCrop(opts){
  opts = opts || {};
  ED = {type:"pick", opts};
  const tiles = list => list.map(c => '<button class="tile" data-act="pick" data-crop="' + c.id + '" data-q="' + esc((c.name + " " + FAMILIES[c.fam]).toLowerCase()) + '"><span class="dot fam-' + c.fam + '"></span>' + esc(c.name) + "</button>").join("");
  const fit = opts.gap ? fillers(opts.gap) : null;
  sheet(opts.gap ? "What could go here?" : "Add a crop",
    (opts.gap ? '<p class="note" style="margin-bottom:14px">' + esc(opts.gapText) + "</p>" + (fit.length ? '<p class="label" style="margin-bottom:8px">These fit the gap</p><div class="tiles" style="margin-bottom:18px">' + fit.map(f => '<button class="tile" data-act="pick" data-crop="' + f.c.id + '" data-month="' + f.month + '" data-yr="' + f.yr + '"><span class="dot fam-' + f.c.fam + '"></span><span>' + esc(f.c.name) + '<small class="muted" style="display:block;font-weight:400">sow ' + MON[f.month - 1] + ", clear " + fmt(f.clear) + "</small></span></button>").join("") + "</div>" : '<p class="muted" style="margin-bottom:14px">Nothing in the guide fits this gap neatly. A green manure or a mulch keeps the soil covered.</p>') + '<p class="label" style="margin-bottom:8px">Or choose any crop</p>' : "") +
    '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="e.g. beans, kale, squash" autocomplete="off"></div>' +
    (opts.gap ? "" : '<p class="label" style="margin-bottom:8px">Popular</p><div class="tiles" style="margin-bottom:18px" data-group="pop">' + tiles(POPULAR.map(id => CROP[id])) + '</div><p class="label" style="margin-bottom:8px">Everything</p>') +
    '<div class="tiles">' + tiles(CROPS.slice().sort((a, b) => a.name.localeCompare(b.name))) + "</div>");
}
function fillers(g){
  const out = [];
  for(const c of CROPS) for(const yr of [-1, 0, 1]) for(const m of c.huw.sow){ if(yr === -1 && m < 9) continue; const t = {crop:c.id, month:m, yr, half:"a", bed:g.bed, part:g.part}; const d = datesOf(t); if(d.in >= g.from && d.clear <= g.to && daysBetween(g.from, d.in) <= 42){ out.push({c, month:m, yr:t.yr, clear:d.clear, idle:daysBetween(g.from, d.in) + daysBetween(d.clear, g.to) / 20}); break; } }
  const seen = new Set(); return out.sort((a, b) => a.idle - b.idle).filter(f => !seen.has(f.c.id) && seen.add(f.c.id)).slice(0, 8);
}
/* the crop page: guide + when + where + variety */
function cropSheet(p, isNew){
  const c = CROP[p.crop]; ED = {type:"crop", p:JSON.parse(JSON.stringify(p)), isNew};
  const vars = RS.filter(v => v.crop === c.id);
  const months = c.huw.sow.slice().sort((a, b) => ((a - 9 + 12) % 12) - ((b - 9 + 12) % 12));
  sheet(c.name,
    calHTML(c) + '<p class="small" style="margin:12px 0 16px">' + esc(c.tip) + "</p>" +
    '<p class="label">When will you sow?</p><div class="chips" style="margin:8px 0 6px" id="mchips">' + months.map(m => '<button class="chip" data-act="m" data-m="' + m + '" aria-pressed="' + (p.month === m) + '">' + MON[m - 1] + (c.huw.cov.includes(m) ? " <small>under cover</small>" : "") + "</button>").join("") + "</div>" +
    '<div class="chips" style="margin-bottom:14px"><button class="chip" data-act="half" data-h="a" aria-pressed="' + (p.half !== "b") + '">Early in the month</button><button class="chip" data-act="half" data-h="b" aria-pressed="' + (p.half === "b") + '">Later in the month</button></div>' +
    '<div id="preview"></div>' +
    '<div class="grid2"><div class="field"><label for="c-where">Where</label><select id="c-where">' + whereOptions(p) + '</select></div>' +
    '<div class="field"><label for="c-var">Variety (optional)</label><input type="text" id="c-var" list="c-vars" value="' + esc(p.variety || "") + '" placeholder="' + (vars.length ? "Choose or type a variety" : "Type a variety") + '"><datalist id="c-vars">' + vars.map(v => '<option value="' + esc(v.name) + '">' + esc((v.seeds || "") + (v.organic ? ", organic" : "")) + "</option>").join("") + "</datalist></div></div>" +
    (c.succ && isNew ? '<div class="field"><label for="c-again">Sow again for a longer picking season</label><select id="c-again"><option value="1">Just this sowing</option>' + [2,3,4].map(n => '<option value="' + n + '">' + n + " sowings, " + c.succ + " weeks apart</option>").join("") + "</select></div>" : "") +
    (vars.length ? '<details style="margin-bottom:10px"><summary class="label" style="cursor:pointer">' + vars.length + " varieties from Real Seeds</summary>" + '<ul class="vlist" style="margin-top:8px">' + vars.map(v => '<li><span><b>' + esc(v.name) + "</b>" + (v.tag ? ' <span class="small muted">' + esc(v.tag.toLowerCase()) + "</span>" : "") + '</span><span class="small muted" style="white-space:nowrap">' + esc(v.seeds || "") + (v.organic ? " · organic" : "") + ' · <a href="' + esc((window.REALSEEDS.base || "https://realseeds.co.uk/") + v.page) + '" target="_blank" rel="noopener">view</a></span></li>').join("") + "</ul></details>" : "") +
    (isNew ? "" : '<details style="margin:10px 0"><summary class="label" style="cursor:pointer">Change a date or mark progress</summary><div class="grid2" style="margin-top:10px">' + stagesOf(c).map(k => '<div class="field"><label for="d-' + k + '">' + {sow:"Sow", plant:"Plant out", harvest:"Start picking", clear:"Clear"}[k] + (p.done && p.done[k] ? " (done)" : "") + '</label><input type="date" id="d-' + k + '" data-date="' + k + '" value="' + ((p.done || {})[k] || (p.dates || {})[k] || "") + '"></div>').join("") + '</div><p class="small muted">Leave a date blank to let the planner work it out. A date you type here stays put, and the later ones follow from it.</p></details>'),
    (isNew ? "" : '<button class="btn danger" data-act="del">Remove</button><button class="btn" data-act="again">Sow again</button>') + '<span style="flex:1"></span><button class="btn primary" data-act="save-crop">' + (isNew ? "Add to my plan" : "Save") + "</button>");
  preview();
}
function whereOptions(p){ let h = '<option value="auto"' + (!p.bed ? " selected" : "") + ">Find a space for me</option>"; P.beds.forEach(b => { h += '<optgroup label="' + esc(b.name) + '">'; for(let i = 0; i < b.parts; i++) h += '<option value="' + b.id + ":" + i + '"' + (p.bed === b.id && p.part === i ? " selected" : "") + ">" + esc(b.name) + (b.parts > 1 ? ", part " + LETTER[i] : "") + "</option>"; if(b.parts > 1) h += '<option value="' + b.id + ':-1"' + (p.bed === b.id && p.part === -1 ? " selected" : "") + ">" + esc(b.name) + ", whole bed</option>"; h += "</optgroup>"; }); return h; }
function readCropForm(){ const p = ED.p; const w = $("#c-where").value; if(w === "auto"){ p.bed = ""; p.part = 0; p.auto = true; } else { const [b, i] = w.split(":"); p.bed = b; p.part = +i; p.auto = false; } p.variety = $("#c-var").value.trim(); $$("[data-date]").forEach(el => { const k = el.dataset.date; if((p.done || {})[k]){ if(el.value) p.done[k] = el.value; else delete p.done[k]; } else { p.dates = p.dates || {}; if(el.value) p.dates[k] = el.value; else delete p.dates[k]; } }); return p; }
function preview(){
  const p = readCropForm(); const t = Object.assign({}, p); if(p.auto) Object.assign(t, findSpace(t));
  const d = datesOf(t), c = CROP[p.crop], ch = checks(t);
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
/* the default sowing month: the next month both calendars agree on, outdoors where that's possible */
function nextSowMonth(c){
  const m0 = parse(today).getMonth() + 1, ord = m => (m - m0 + 12) % 12;
  let cands = c.huw.sow.filter(m => !c.rs || halfIn(c.rs.sow, m)); if(!cands.length) cands = c.huw.sow.slice();
  if(!c.tender && !c.cover){ const out = cands.filter(m => !c.huw.cov.includes(m)); if(out.length) cands = out; }
  return cands.sort((a, b) => ord(a) - ord(b))[0];
}
function newPlant(cropId, month, yr){ const c = CROP[cropId]; const m = month || nextSowMonth(c); let y = yr; if(y == null){ y = 0; if(m >= 9 && !c.huw.sow.some(x => x < 9)) y = (new Date().getMonth() + 1 >= 9 && new Date().getFullYear() < P.year) ? -1 : 0; } return {id:uid("p"), crop:cropId, month:m, half:"a", yr:y, bed:"", part:0, auto:true, variety:"", dates:{}, done:{}}; }
function saveCrop(){
  const p = readCropForm(); const again = $("#c-again") ? +$("#c-again").value : 1; const isNew = ED.isNew; const c = CROP[p.crop];
  change(() => {
    const list = [p];
    for(let i = 1; i < again; i++){ const q = JSON.parse(JSON.stringify(p)); q.id = uid("p"); q.dates = {sow:addWeeks(datesOf(p).sow, c.succ * i)}; q.done = {}; list.push(q); }
    list.forEach(q => { if(q.auto) Object.assign(q, findSpace(q)); delete q.auto; const i = P.plants.findIndex(x => x.id === q.id); if(i >= 0) P.plants[i] = q; else P.plants.push(q); });
  }, isNew ? c.name + " added" + (again > 1 ? " (" + again + " sowings)" : "") : "Saved");
  closeSheet();
}

/* ---------- setup ---------- */
function setup(step){
  const n = 4; const bar = '<div class="steps">' + Array.from({length:n}, (_, i) => '<i class="' + (i <= step ? "on" : "") + '"></i>').join("") + "</div>";
  if(step === 0) return sheet("Welcome", bar + '<p style="margin-bottom:18px">This planner tells you when to sow, plant and pick each crop, and keeps track of what’s in each bed. It takes about two minutes to set up.</p><div style="display:grid;gap:10px"><button class="btn primary big" data-act="setup" data-step="1">Set up my plot</button><button class="btn big" data-act="example">Show me an example first</button><button class="btn big" data-act="file-open">Open a plan file</button></div><p class="small muted" style="margin-top:14px">The example is Huw Richards’ one-bed plan: one 1.2 × 2.4 m bed, two halves, six crops in a year.</p>');
  if(step === 1) return sheet("Where do you grow?", bar + '<p style="margin-bottom:12px">This sets your frost dates, which move every sowing date earlier or later.</p><div class="region-list">' + REGIONS.map(r => '<button class="chip" data-act="region-pick" data-r="' + r[0] + '" aria-pressed="' + (P.region === r[0]) + '"><span>' + esc(r[1]) + "</span>" + (r[0] !== "custom" ? "<small>last frost ~" + fmt(P.year + "-" + r[2]) + "</small>" : "") + "</button>").join("") + "</div>");
  if(step === 2){ if(!P.beds.length) P.beds.push({id:uid("b"), name:"Bed 1", len:2.4, wid:1.2, parts:2}); return sheet("Your beds", bar + '<p style="margin-bottom:12px">Add each bed or growing space. Most raised beds are about 1.2 m wide. Splitting a bed into parts lets you grow different crops side by side.</p><div id="bed-rows">' + P.beds.map(bedRow).join("") + '</div><button class="btn small" data-act="bed-add">+ Add another bed</button>', '<button class="btn" data-act="setup" data-step="1">Back</button><span style="flex:1"></span><button class="btn primary" data-act="setup" data-step="3">Next</button>'); }
  if(step === 3){ ED = {type:"setup-crops", sel:new Set(ED && ED.sel ? ED.sel : [])}; return sheet("What do you like to eat?", bar + '<p style="margin-bottom:12px">Tick the crops you want. The planner picks a sowing time for each and fits them into your beds. You can change anything later.</p><div class="tiles">' + POPULAR.concat(CROPS.map(c => c.id).filter(id => !POPULAR.includes(id)).sort((a, b) => CROP[a].name.localeCompare(CROP[b].name))).map(id => { const c = CROP[id]; return '<button class="tile" data-act="toggle" data-crop="' + id + '" aria-pressed="false"><span class="dot fam-' + c.fam + '"></span>' + esc(c.name) + "</button>"; }).join("") + "</div>", '<button class="btn" data-act="setup" data-step="2">Back</button><span style="flex:1"></span><button class="btn primary" data-act="finish">Make my plan</button>'); }
}
function finishSetup(){
  const ids = Array.from(ED.sel); const left = [];
  change(() => { P.plants = P.plants || []; ids.forEach(id => { const p = newPlant(id); Object.assign(p, findSpace(p)); delete p.auto; if(!p.bed) left.push(CROP[id].name); P.plants.push(p); }); P.setupDone = true; }, null);
  closeSheet(); view = "todo"; render();
  toast(ids.length ? "Your plan is ready" + (left.length ? ". " + left.length + " crop" + (left.length === 1 ? "" : "s") + " need more space: see Crops" : "") : "All set. Add crops any time");
}
function example(){
  const y = P.year, b = {id:uid("b"), name:"Huw’s one-bed plan", len:2.4, wid:1.2, parts:2};
  const mk = (crop, part, dates, variety) => ({id:uid("p"), crop, part, bed:b.id, month:monthOf(dates.sow || dates.plant), half:"a", yr:0, variety:variety || "", dates, done:{}});
  change(() => {
    P.beds.push(b);
    P.plants.push(
      mk("radish", 0, {sow:y + "-03-08", clear:y + "-05-24"}),
      mk("bean-bush", 0, {sow:y + "-04-26", plant:y + "-06-01", clear:y + "-08-30"}),
      mk("spinach", 0, {sow:y + "-08-02", plant:y + "-09-06", clear:y + "-12-20"}),
      mk("lettuce", 1, {sow:y + "-03-01", plant:y + "-04-05", clear:y + "-06-14"}),
      mk("beetroot", 1, {sow:y + "-06-21", clear:y + "-10-25"}),
      Object.assign(mk("garlic", 1, {sow:y + "-11-08", clear:(y + 1) + "-07-04"}), {month:11})
    );
    P.setupDone = true; if(!P.region){ P.region = "wales"; }
  }, null);
  closeSheet(); view = "garden"; gardenMonth = y + "-04-15"; render();
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
  UNDO.push(JSON.stringify(P)); P = d; P.setupDone = true; save(); closeSheet(); view = "todo"; render(); toast(msg, true); }; inp.click(); }
/* a plan file from the advanced planner: keep beds, crops and their dates */
const FROM_LIB = {"broad-beans":"bean-broad","peas":"peas","french-beans":"bean-bush","runner-beans":"bean-runner","lettuce":"lettuce","lambs-lettuce":"lettuce","spinach":"spinach","chard":"chard","rocket":"rocket","oriental-leaves":"mustards","pak-choi":"pak-choi","chicory":"chicory","onions":"onions-seed","onions-ow":"onions-seed","onion-sets":"onions-sets","onion-sets-autumn":"onions-sets","shallots":"shallots","spring-onions":"spring-onion","leeks":"leeks","garlic":"garlic","cabbage":"cabbage-summer","cauliflower":"cauliflower","calabrese":"calabrese","psb":"psb-early","sprouts":"sprouts","flower-sprouts":"sprouts","kale":"kale","cavolo-nero":"kale","kohlrabi":"kohlrabi","turnip":"turnips","swede":"swede","radish":"radish","beetroot":"beetroot","carrots":"carrots","parsnips":"parsnips","salsify":"salsify","scorzonera":"salsify","celeriac":"celeriac","celery":"celery","fennel":"fennel","potato-first":"potato-early","potato-second":"potato-second","potato-main":"potato-main","tomatoes":"tomatoes","peppers":"peppers","chillies":"peppers","aubergine":"aubergine","courgette":"courgettes","cucumber":"cucumbers","melon":"cucumbers","squash":"squash-winter","pumpkin":"squash-winter","sweetcorn":"sweetcorn","oca":"oca","basil":"basil","parsley":"parsley","coriander":"coriander","dill":"dill"};
function fromAdvanced(d){
  const s = d.settings || {}, y = +(s.lastFrost || "").slice(0, 4) || planYear();
  const plan = {app:APP, v:1, name:(d.meta && d.meta.name) || "My plot", region:"custom", lf:s.lastFrost || y + "-" + REF_LF, ff:s.firstFrost || y + "-" + REF_FF, year:y, beds:[], plants:[], setupDone:true};
  const beds = Object.values(d.beds || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  beds.forEach(b => plan.beds.push({id:b.id, name:b.name, len:+b.length || 1, wid:+b.width || 1, parts:Math.max(1, Math.min(8, +b.strips || 1)), cover:b.type === "cover"}));
  const skipped = new Set(); let n = 0;
  Object.values(d.plantings || {}).forEach(p => {
    const c = (d.crops || {})[p.crop] || {}; const id = FROM_LIB[c.lib || p.crop]; if(!id){ skipped.add(c.name || p.label || p.crop); return; }
    const b = (d.beds || {})[p.bed], parts = b ? Math.max(1, Math.min(8, +b.strips || 1)) : 1, strips = b ? Math.max(1, +b.strips || 1) : 1;
    const part = b ? (+p.s1 === 1 && +p.s2 === strips && parts > 1 ? -1 : Math.min(parts - 1, Math.floor((+p.s1 - 1) * parts / strips))) : 0;
    const dates = {}, done = {}; const map = {sow:"sow", plant:"plantOut", harvest:"harvestFrom", clear:"clearBy"};
    Object.entries(map).forEach(([k, v]) => { if(p[v]){ if((p.done || {})[k === "plant" ? "plantOut" : k]) done[k] = p[v]; else dates[k] = p[v]; } });
    if(!CROP[id].huw.tp || CROP[id].how === "direct"){ delete dates.plant; delete done.plant; }
    const variety = (/\(([^)]+)\)/.exec(c.name || "") || [])[1] || "";
    const first = p.sow || p.plantOut || p.clearBy;
    plan.plants.push({id:p.id, crop:id, month:first ? monthOf(first) : 3, half:"a", yr:first ? +first.slice(0, 4) - y : 0, bed:b ? b.id : "", part, variety, dates, done, note:p.notes || ""}); n++;
  });
  return {plan, n, skipped:Array.from(skipped)};
}
function idb(){ return new Promise((res, rej) => { const r = indexedDB.open(APP, 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kv(k, v){ try{ const db = await idb(); return await new Promise(res => { const tx = db.transaction("kv", v === undefined ? "readonly" : "readwrite"); const st = tx.objectStore("kv"); const q = v === undefined ? st.get(k) : v === null ? st.delete(k) : st.put(v, k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }catch(e){ return undefined; } }
async function linkFile(){
  try{ const h = await window.showSaveFilePicker({suggestedName:"allotment-plan.json", types:[{description:"Plan file", accept:{"application/json":[".json"]}}]}); LINK.handle = h; LINK.name = h.name; LINK.ok = true; await kv("link", h); await writeLinked(); render(); toast("Every change now saves into " + h.name); }catch(e){ if(e.name !== "AbortError") toast("Couldn’t link that file"); }
}
let lT = 0; function saveLinkedSoon(){ if(LINK.handle && LINK.ok){ clearTimeout(lT); lT = setTimeout(writeLinked, 500); } }
async function writeLinked(){ try{ const w = await LINK.handle.createWritable(); await w.write(JSON.stringify(P, null, 1)); await w.close(); }catch(e){ LINK.ok = false; linkBanner(); } }
async function restoreLink(){ if(!window.showSaveFilePicker) return; const h = await kv("link"); if(!h || !h.queryPermission) return; LINK.handle = h; LINK.name = h.name; LINK.ok = (await h.queryPermission({mode:"readwrite"})) === "granted"; if(LINK.ok){ try{ const d = JSON.parse(await (await h.getFile()).text()); if(d.app === APP && (d.updated || "") > (P.updated || "")){ P = d; try{ localStorage.setItem(KEY, JSON.stringify(P)); }catch(e){} } }catch(e){} } }
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

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act],[data-view]"); if(!el) return;
  if(el.tagName === "A") return;
  const a = el.dataset.act || (el.dataset.view ? "nav" : "");
  const A = {
    nav: () => { view = el.dataset.view; closeSheet(); render(); scrollTo(0, 0); },
    close: closeSheet, undo,
    add: () => pickCrop(),
    pick: () => { const p = newPlant(el.dataset.crop, el.dataset.month ? +el.dataset.month : null, el.dataset.yr != null ? +el.dataset.yr : null); if(ED && ED.opts && ED.opts.gap){ p.bed = ED.opts.gap.bed; p.part = ED.opts.gap.part; p.auto = false; } cropSheet(p, true); },
    edit: () => { const p = P.plants.find(x => x.id === el.dataset.id); if(p) cropSheet(p, false); },
    m: () => { ED.p.month = +el.dataset.m; ED.p.yr = ED.p.month >= 9 && P.year > new Date().getFullYear() && new Date().getMonth() + 1 <= ED.p.month ? -1 : 0; ED.p.dates = {}; $$("#mchips .chip").forEach(b => b.setAttribute("aria-pressed", b === el)); $$("[data-date]").forEach(i => { if(!(ED.p.done || {})[i.dataset.date]) i.value = ""; }); preview(); },
    half: () => { ED.p.half = el.dataset.h; $$('[data-act="half"]').forEach(b => b.setAttribute("aria-pressed", b === el)); preview(); },
    "save-crop": saveCrop,
    del: () => { const id = ED.p.id, n = CROP[ED.p.crop].name; closeSheet(); change(() => { P.plants = P.plants.filter(p => p.id !== id); }, n + " removed"); },
    again: () => { const p = readCropForm(); const c = CROP[p.crop]; const q = newPlant(p.crop, null, null); q.dates = {sow:addWeeks(datesOf(p).sow, c.succ || 4)}; q.month = monthOf(q.dates.sow); q.variety = p.variety; cropSheet(q, true); },
    part: () => { const b = bedById(el.dataset.bed), i = +el.dataset.part; const sel = gardenMonth || today.slice(0, 7) + "-15"; const prev = P.plants.filter(p => p.bed === b.id && parts(p).includes(i) && span(p)[1] <= sel).map(span).map(s => s[1]).sort().pop() || monday(addDays(sel, -14)); const nextP = P.plants.filter(p => p.bed === b.id && parts(p).includes(i) && span(p)[0] > sel).map(span).map(s => s[0]).sort()[0] || (P.year + 1) + "-03-01"; const from = maxD(prev, thisWeek); pickCrop({gap:{bed:b.id, part:i, from, to:nextP}, gapText:b.name + (b.parts > 1 ? ", part " + LETTER[i] : "") + " is free from " + fmtY(from) + " until " + fmtY(nextP) + "."}); },
    month: () => { gardenMonth = el.dataset.d; render(); },
    print: () => window.print(),
    region: () => setup(1),
    "region-pick": () => { const r = REGIONS.find(x => x[0] === el.dataset.r); P.region = r[0]; if(r[0] !== "custom"){ P.lf = P.year + "-" + r[2]; P.ff = P.year + "-" + r[3]; } save(); if(!P.setupDone) setup(2); else { closeSheet(); render(); toast(r[0] === "custom" ? "Type your frost dates below" : "Frost dates set for " + r[1]); } },
    setup: () => setup(+el.dataset.step), finish: finishSetup,
    toggle: () => { const id = el.dataset.crop; if(ED.sel.has(id)) ED.sel.delete(id); else ED.sel.add(id); el.setAttribute("aria-pressed", ED.sel.has(id)); },
    example,
    "bed-add": () => { const b = {id:uid("b"), name:"Bed " + (P.beds.length + 1), len:2.4, wid:1.2, parts:2}; if($("#bed-rows")){ P.beds.push(b); save(); $("#bed-rows").insertAdjacentHTML("beforeend", bedRow(b)); } else change(() => P.beds.push(b), "Bed added"); },
    "bed-del": () => { const id = el.dataset.bed; const n = P.plants.filter(p => p.bed === id).length; if($("#bed-rows")){ P.beds = P.beds.filter(b => b.id !== id); save(); el.closest(".bed-edit").remove(); return; } change(() => { P.beds = P.beds.filter(b => b.id !== id); P.plants.forEach(p => { if(p.bed === id) p.bed = ""; }); }, "Bed removed" + (n ? "; its " + n + " crop" + (n === 1 ? "" : "s") + " need a new space" : "")); },
    "file-save": () => deliver(planFile(), "allotment-plan.json"), "file-open": openFile, "file-link": linkFile, reconnect,
    ics,
    reset: () => { if(!confirmTwice(el)) return; UNDO.push(JSON.stringify(P)); P = blank(); save(); render(); setup(0); }
  };
  if(A[a]){ e.preventDefault(); A[a](); }
});
const maxD = (a, b) => a > b ? a : b;
function confirmTwice(el){ if(el.dataset.armed){ return true; } el.dataset.armed = "1"; const t = el.textContent; el.textContent = "Tap again to clear everything"; setTimeout(() => { delete el.dataset.armed; el.textContent = t; }, 4000); return false; }
document.addEventListener("change", e => {
  const t = e.target;
  if(t.dataset.job){ const p = P.plants.find(x => x.id === t.dataset.job), k = t.dataset.key; const d = datesOf(p); change(() => { p.done = p.done || {}; if(t.checked){ const planned = d[k]; p.done[k] = monday(planned) === thisWeek ? planned : today; const ks = stagesOf(CROP[p.crop]); ks.slice(0, ks.indexOf(k)).forEach(x => { if(!p.done[x]) p.done[x] = d[x] < today ? d[x] : today; }); } else delete p.done[k]; }, t.checked ? "Done" : "Unticked"); return; }
  if(t.dataset.bf){ const b = P.beds.find(x => x.id === t.closest("[data-bed]").dataset.bed); const f = t.dataset.bf; b[f] = f === "name" ? t.value.trim() || b.name : f === "cover" ? t.value === "1" : +t.value || b[f]; save(); if(!$("#bed-rows")) render(); return; }
  if(t.id === "s-name"){ change(() => P.name = t.value.trim() || "My plot", "Saved"); return; }
  if(t.id === "s-year"){ const y = +t.value; if(y > 2000){ change(() => { const dy = y - P.year; P.year = y; P.lf = (+P.lf.slice(0, 4) + dy) + P.lf.slice(4); P.ff = (+P.ff.slice(0, 4) + dy) + P.ff.slice(4); }, "Plan moved to " + y); } return; }
  if(t.id === "s-lf" || t.id === "s-ff"){ if(t.value) change(() => { P[t.id === "s-lf" ? "lf" : "ff"] = t.value; }, "Frost date saved: sowing dates updated"); return; }
  if(ED && ED.type === "crop" && t.closest("#sheet")) preview();
});
document.addEventListener("input", e => {
  if(e.target.id === "q"){ const q = e.target.value.trim().toLowerCase(); $$("#sheet .tile[data-q]").forEach(t => t.hidden = q && !t.dataset.q.includes(q)); $$('#sheet [data-group="pop"]').forEach(g => { g.hidden = !!q; if(g.previousElementSibling) g.previousElementSibling.hidden = !!q; }); }
});
document.addEventListener("keydown", e => { if(e.key === "Escape" && $("#sheet")) closeSheet(); if((e.metaKey || e.ctrlKey) && e.key === "z" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)){ e.preventDefault(); undo(); } });

/* ---------- start ---------- */
(async function(){
  P = load() || blank();
  await restoreLink();
  render();
  if(!P.setupDone) setup(0);
  window.__plan = {get P(){ return P; }, datesOf, checks, fillers, CROP};
})();
})();
