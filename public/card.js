const BOAT = [
  ["Front-left hero 3/4","Stand off the port bow. Bow, side, and sheer in one frame."],
  ["Front-right hero 3/4","Stand off the starboard bow. Same distance as the last shot."],
  ["Rear-left hero 3/4","Stand off the port quarter. Transom and port side in one frame."],
  ["Rear-right hero 3/4","Stand off the starboard quarter. Transom and starboard side in one frame."],
  ["Side A — full profile","Walk back until bow to stern fits. Full port side."],
  ["Side B — full profile","Walk back until bow to stern fits. Full starboard side."],
  ["Interior","Full seating area. Helm and cushions in frame."],
  ["Engine / mechanical","Open the hatch or cowl. Bay or cowling and bilge in frame."],
  ["Bow, straight-on","Stand on the dock in front of the bow. Full bow, cleats, hull nose."],
  ["Stern, straight-on","Stand behind the transom. Swim platform, outboard or outdrive, ladder."],
  ["Deck from bow","Stand at the bow looking aft. Full deck in one frame."],
  ["Deck from stern","Stand at the stern looking forward. Full deck in one frame."],
  ["Helm","Wheel, gauges, and helm upholstery in one frame."],
  ["Interior — second","Cabin or the seating you did not shoot yet."],
  ["Engine — second","Second bay, or the other cowl."],
  ["Bottom / waterline","Bottom paint, running gear, props."],
  ["Canvas / upholstery","Bimini, canvas, or a stained cushion."],
  ["HIN / registration","HIN plate or registration numbers. Internal only."]
];
const AUTO = [
  ["Front-left hero 3/4","Driver-side front. Bumper, hood, and fender in one frame."],
  ["Front-right hero 3/4","Passenger-side front. Same distance."],
  ["Rear-left hero 3/4","Driver-side rear. Bumper and quarter in one frame."],
  ["Rear-right hero 3/4","Passenger-side rear. Same distance."],
  ["Side A — full profile","Full driver side, nose to tail."],
  ["Side B — full profile","Full passenger side, nose to tail."],
  ["Interior","Front seats and dash in one frame."],
  ["Engine / mechanical","Open the hood. Engine bay in one frame."],
  ["Front bumper","Straight-on. Full width of bumper and grille."],
  ["Rear bumper","Straight-on. Full width of bumper and tailgate."],
  ["Wheels","One shot per wheel. Rash, dust, tread."],
  ["Roof","Roof panel. On an RV include seams, vents, and A/C."],
  ["Dash / odometer","Dash and a legible odometer."],
  ["Rear / cargo","Rear seat or cargo. On an RV, the living area."],
  ["VIN / plate","VIN plate or plate. Internal only."]
];
const AIR = [
  ["Nose, straight-on","Nose, radome, front fuselage."],
  ["Tail, straight-on","Empennage. Tail number visible."],
  ["Left side","Full left profile, nose to tail."],
  ["Right side","Full right profile, nose to tail."],
  ["Left wing, top","Root to tip. Leading edge in frame."],
  ["Right wing, top","Root to tip. Leading edge in frame."],
  ["Left wing, underside","Flaps, aileron, stains or leaks."],
  ["Right wing, underside","Flaps, aileron, stains or leaks."],
  ["Engine / cowl","Cowl and intake. One per engine."],
  ["Gear","Tire, strut, brake. One per side."],
  ["Cockpit","Panel, yoke, seats."],
  ["Cabin","Passenger seats."],
  ["Belly","Underside. Leaks, stains, exhaust."],
  ["Tail number","Registration plate. Internal only."]
];
const CHECK = {
  Exterior:["Hull free of streaks and water spots","Scum line fully removed","Non-skid scrubbed completely","Rails and stainless polished","Windows/glass streak-free","Hardware bases cleaned","No compound/wax residue remaining"],
  Interior:["Seats cleaned in all creases","Under cushions cleaned","Cup holders cleaned","Helm and dash wiped properly","Floor drains and cracks cleaned","Storage compartments wiped","No standing water present"],
  "Hidden areas":["Hatch lips cleaned","Anchor locker inspected","Behind steering wheel cleaned","Seat hinges cleaned","Drain channels flushed","Transom corners cleaned","Ladder/storage compartments inspected"],
  "Final QC":["No missed spots visible","No footprints onboard","No tools/trash left behind","All compartments closed properly","Client items organized neatly","Final walkthrough completed"]
};
const params = new URLSearchParams(location.search);
const jobId = params.get("job");
const $ = (id) => document.getElementById(id);
const state = { step:0, pin:"", token:"", job:null, ang:0, phase:"before", before:[], after:[], spots:[], checks:{}, startedAt:null, did:"", asked:"", look:"", cond:"", site:"", next:"", nextnote:"", geoStart:null, geoEnd:null, err:"" };
function list(){ return state.job && state.job.asset==="Aircraft" ? AIR : (state.job && state.job.asset==="Boat" ? BOAT : AUTO); }
function key(){ return "novi_"+jobId; }
function saveLocal(){ try { localStorage.setItem(key(), JSON.stringify(state)); } catch(e){} }
function loadLocal(){ try { return JSON.parse(localStorage.getItem(key())||"null"); } catch(e){ return null; } }
async function api(url, opt){
  const res = await fetch(url, Object.assign({ headers:{ "Content-Type":"application/json" } }, opt));
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || "No service");
  return data;
}
async function sync(){
  if(!state.token || !state.pin) return;
  saveLocal();
  try {
    const data = await api("/api/jobs/"+jobId+"/state", { method:"POST", body: JSON.stringify({ pin: state.pin, token: state.token, state: pack() }) });
    if(data.startedAt) state.startedAt = data.startedAt;
  } catch(e) {}
}
function pack(){
  return {
    step: state.step, ang: state.ang, before: state.before, after: state.after, spots: state.spots,
    checks: state.checks, startedAt: state.startedAt, did: state.did, asked: state.asked,
    look: state.look, cond: state.cond, site: state.site, next: state.next, nextnote: state.nextnote,
    geoStart: state.geoStart, geoEnd: state.geoEnd
  };
}
function unpack(s){
  if(!s) return;
  ["step","ang","before","after","spots","checks","startedAt","did","asked","look","cond","site","next","nextnote","geoStart","geoEnd"].forEach(k => { if(s[k]!==undefined) state[k]=s[k]; });
}
function pinFix(){
  return new Promise(resolve => {
    if(!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat:p.coords.latitude, lng:p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy:true, timeout:8000 }
    );
  });
}
function resize(file){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max/Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.src = URL.createObjectURL(file);
  });
}
function draw(){
  const rail = $("rail");
  if(rail) rail.innerHTML = [1,2,3,4,5,6,7].map(n=>`<b class="${n<=state.step?"on":""}"></b>`).join("");
  const el = $("clock");
  if(el){
    if(!state.startedAt) el.textContent = "00:00";
    else {
      const s = Math.floor((Date.now()-state.startedAt)/1000);
      el.textContent = String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
    }
  }
  const m = $("main");
  if(!jobId){ m.innerHTML = `<h1>No job</h1><p class="lede">Open the link from the calendar.</p>`; return; }
  if(state.step===0) m.innerHTML = lockPage();
  else if(state.step===1) m.innerHTML = pageJob();
  else if(state.step===2) m.innerHTML = pagePhoto("before");
  else if(state.step===3) m.innerHTML = pageWork();
  else if(state.step===4) m.innerHTML = pagePhoto("after");
  else if(state.step===5) m.innerHTML = pageCheck();
  else if(state.step===6) m.innerHTML = pageOut();
  else m.innerHTML = `<h1>Logged</h1><p class="lede">This job is closed.</p>`;
  bind();
}
function lockPage(){
  return `<h1>Open this job</h1><p class="lede">Enter the lead’s phone number.</p><p class="err">${state.err||""}</p>
  <label class="field">Phone number</label><input id="pin" inputmode="tel" />
  <button class="btn" id="open">Open</button>`;
}
function pageJob(){
  const j = state.job;
  const who = j.kind==="contractor" ? j.company : j.crew_names;
  return `<h1>This job</h1><p class="err">${state.err||""}</p>
  <div class="station"><div class="kicker">${j.kind==="contractor"?"Company":"Crew"}</div><p class="how">${who||j.lead_name}</p></div>
  ${j.kind==="contractor" ? `<label class="field">Who did the work</label><input id="did" value="${state.did||""}" />` : ""}
  <label class="field">Job #</label><input value="${j.job_number||""}" readonly />
  <label class="field">${j.customer_type==="b2c"?"Customer":"Company"}</label><input value="${j.customer_name||""}" readonly />
  <label class="field">Site</label><input value="${j.site||""}" readonly />
  <label class="field">Unit</label><input value="${j.unit||""}" readonly />
  <label class="field">Work to do</label><input value="${j.work||""}" readonly />
  <label class="field">Who to see</label><input value="${j.see_who||""}" readonly />
  <label class="field">Notes</label><textarea readonly>${j.notes||""}</textarea>
  <button class="btn" id="next">Continue</button>`;
}
function pagePhoto(which){
  const L = list();
  const i = Math.min(state.ang, L.length-1);
  const [name, how] = L[i];
  const shots = which==="before" ? state.before : state.after;
  const dots = L.map((_,n)=>`<i class="${n===i?"on":""} ${shots[n]?"has":""}"></i>`).join("");
  const frame = which==="before"
    ? (shots[i] ? `<img src="${shots[i]}" />` : `${name}`)
    : (state.before[i] ? `<img src="${state.before[i]}" />` : name);
  const hint = which==="before" ? how : "Stand in the same spot. Shoot the clean unit.";
  const spots = (state.spots||[]).map((s,n)=>`<div class="spot">${n+1}. ${s.note||"Spot"} ${which==="after"?"· retake this":""}</div>`).join("");
  return `<h1>${which==="before"?"Before":"After"} · ${state.job.asset}</h1>
  <p class="lede">${i+1} of ${L.length}</p><p class="err">${state.err||""}</p>
  <div class="dots">${dots}</div>
  <div class="station"><div class="kicker">${name}</div><div class="frame ${which==="after"?"shot":""}">${frame}</div><p class="how">${hint}</p>
  <button class="btn" id="take">Take picture</button></div>
  <div class="row"><button class="btn ghost" id="prev">Last angle</button><button class="btn ghost" id="nxt">Next angle</button></div>
  ${which==="before" ? `<button class="btn ghost" id="flag">Add spot to flag</button>` : `<p class="lede">Retake the spots you flagged. Shoot each one again now that it is done.</p>`}
  <div>${spots||`<div class="spot">No spots flagged.</div>`}</div>
  <div class="row"><button class="btn ghost" id="back">Back</button><button class="btn" id="next">Continue</button></div>`;
}
function pageWork(){
  return `<h1>While you are here</h1><p class="lede">Anything else on the lot or in the slips.</p><p class="err">${state.err||""}</p>
  <label class="field">Next unit</label><textarea id="nextnote">${state.nextnote||""}</textarea>
  <div class="choices"><button type="button" class="chip ${state.next==="None"?"on":""}" id="none">None</button></div>
  <div class="row"><button class="btn ghost" id="back">Back</button><button class="btn" id="next">Continue</button></div>`;
}
function pageCheck(){
  if(state.job.asset!=="Boat"){
    return `<h1>Checklist</h1><p class="lede">${state.job.asset} list is not in yet.</p>
    <div class="row"><button class="btn ghost" id="back">Back</button><button class="btn" id="next">Continue</button></div>`;
  }
  let body = "";
  Object.keys(CHECK).forEach(g => {
    body += `<div class="group">${g}</div>`;
    CHECK[g].forEach(line => {
      body += `<label class="checkline"><input type="checkbox" data-c="${line}" ${state.checks[line]?"checked":""}/> ${line}</label>`;
    });
  });
  return `<h1>Boat checklist</h1><p class="lede">All lines required.</p><p class="err">${state.err||""}</p>${body}
  <div class="row"><button class="btn ghost" id="back">Back</button><button class="btn" id="next">Continue</button></div>`;
}
function pageOut(){
  return `<h1>Check out</h1><p class="err">${state.err||""}</p>
  <label class="field">Checked out with</label><input id="asked" value="${state.asked||""}" />
  <label class="field">Does this look right?</label>
  <div class="choices" id="look">
    <button type="button" class="chip ${state.look==="Yes"?"on":""}" data-v="Yes">Yes</button>
    <button type="button" class="chip ${state.look==="No"?"on":""}" data-v="No">No</button>
  </div>
  <label class="field">Condition</label>
  <div class="choices five" id="cond">
    ${[1,2,3,4,5].map(n=>`<button type="button" class="chip ${state.cond==String(n)?"on":""}" data-v="${n}">${n}</button>`).join("")}
  </div>
  <label class="field">Site issue</label>
  <div class="choices" id="site">
    <button type="button" class="chip ${state.site==="None"?"on":""}" data-v="None">None</button>
    <button type="button" class="chip ${state.site==="Yes"?"on":""}" data-v="Yes">Yes</button>
  </div>
  <div class="row"><button class="btn ghost" id="back">Back</button><button class="btn" id="send">Submit</button></div>`;
}
function missing(which){
  const L = list();
  const shots = which==="before" ? state.before : state.after;
  return L.some((_,i)=>!shots[i]);
}
function bind(){
  const open = $("open");
  if(open) open.onclick = doOpen;
  const next = $("next");
  if(next) next.onclick = doNext;
  const back = $("back");
  if(back) back.onclick = () => { state.err=""; state.step = Math.max(1, state.step-1); saveLocal(); draw(); };
  const prev = $("prev");
  if(prev) prev.onclick = () => { state.ang = Math.max(0, state.ang-1); draw(); };
  const nxt = $("nxt");
  if(nxt) nxt.onclick = () => { state.ang = Math.min(list().length-1, state.ang+1); draw(); };
  const take = $("take");
  if(take) take.onclick = () => { state._which = state.step===2?"before":"after"; $("cam").click(); };
  const flag = $("flag");
  if(flag) flag.onclick = () => {
    const v = prompt("What is the spot? Soil, stain, extra work, or damage.");
    if(v){ state.spots.push({ note:v }); sync(); draw(); }
  };
  const none = $("none");
  if(none) none.onclick = () => { state.next = state.next==="None" ? "" : "None"; draw(); };
  const did = $("did");
  if(did) did.oninput = () => { state.did = did.value; };
  document.querySelectorAll("[data-c]").forEach(b => b.onchange = () => { state.checks[b.dataset.c] = b.checked; });
  document.querySelectorAll("#look .chip").forEach(b => b.onclick = () => { state.look = b.dataset.v; draw(); });
  document.querySelectorAll("#cond .chip").forEach(b => b.onclick = () => { state.cond = b.dataset.v; draw(); });
  document.querySelectorAll("#site .chip").forEach(b => b.onclick = () => { state.site = b.dataset.v; draw(); });
  const send = $("send");
  if(send) send.onclick = doSubmit;
}
async function doOpen(){
  state.err = "";
  state.pin = ($("pin").value||"").replace(/\D/g,"");
  try {
    const data = await api("/api/jobs/"+jobId+"?pin="+encodeURIComponent(state.pin));
    if(data.closed){ state.step = 8; draw(); return; }
    state.token = data.token;
    state.job = data.job;
    const local = loadLocal();
    unpack(data.state);
    if(local && local.startedAt && (!state.startedAt || local.startedAt < state.startedAt)) unpack(local);
    if(state.job.started_at) state.startedAt = new Date(state.job.started_at).getTime();
    state.step = state.step && state.step>0 ? state.step : 1;
    if(!state.geoStart) state.geoStart = await pinFix();
    saveLocal();
    draw();
  } catch(e){ state.err = e.message; draw(); }
}
async function doNext(){
  state.err = "";
  if(state.step===1){
    if(state.job.kind==="contractor" && !($("did")&&$("did").value.trim())){ state.err = "Who did the work."; draw(); return; }
    if($("did")) state.did = $("did").value.trim();
    if(!state.startedAt){ state.startedAt = Date.now(); state.geoStart = state.geoStart || await pinFix(); }
  }
  if(state.step===2 && missing("before")){ state.err = "Every before angle needs a picture."; draw(); return; }
  if(state.step===3){
    state.nextnote = ($("nextnote")&&$("nextnote").value||"").trim();
    if(!state.nextnote && state.next!=="None"){ state.err = "Next unit, or None."; draw(); return; }
    state.next = state.next==="None" ? "None" : state.nextnote;
  }
  if(state.step===4 && missing("after")){ state.err = "Every after angle needs a picture."; draw(); return; }
  if(state.step===5 && state.job.asset==="Boat"){
    const all = Object.values(CHECK).flat();
    if(all.some(line => !state.checks[line])){ state.err = "Check every line."; draw(); return; }
  }
  state.step += 1;
  if(state.step===2 || state.step===4) state.ang = 0;
  await sync();
  draw();
}
async function doSubmit(){
  state.err = "";
  state.asked = ($("asked")&&$("asked").value||"").trim();
  if(!state.asked || !state.look || !state.cond || !state.site){ state.err = "Every line is required."; draw(); return; }
  state.geoEnd = await pinFix();
  try {
    await api("/api/jobs/"+jobId+"/submit", { method:"POST", body: JSON.stringify({ pin: state.pin, token: state.token, state: pack() }) });
    state.step = 8;
    saveLocal();
    draw();
  } catch(e){ state.err = e.message + " Saved on this phone. Submit when you have service."; saveLocal(); draw(); }
}
$("cam").onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if(!file) return;
  const data = await resize(file);
  const which = state._which || "before";
  if(which==="before") state.before[state.ang] = data;
  else state.after[state.ang] = data;
  await sync();
  draw();
};
setInterval(()=>{ if(state.startedAt && state.step>0 && state.step<8){ const el=$("clock"); if(el){ const s=Math.floor((Date.now()-state.startedAt)/1000); el.textContent=String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); } } }, 1000);
setInterval(()=>{ if(state.step>0 && state.step<8) sync(); }, 15000);
draw();
