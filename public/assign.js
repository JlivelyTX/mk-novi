async function unlock(){
  try {
    await api("/api/ops", { method:"POST", body: JSON.stringify({ pin: $("opspin").value }) });
    sessionStorage.setItem("novi_ops", $("opspin").value || "");
    $("gate").hidden = true;
    $("form").hidden = false;
    prefill();
    loadPeople().catch(e => err("Database is not connected yet. " + e.message));
  } catch(e){ alert(e.message); }
}
document.getElementById("opsgo").onclick = unlock;
let kind = "mk";
let ctype = "b2b";
const $ = (id) => document.getElementById(id);
function err(t){ $("err").textContent = t || ""; }
function opsPin(){ return sessionStorage.getItem("novi_ops") || ""; }
async function api(url, opt){
  opt = opt || {};
  opt.headers = Object.assign({ "Content-Type":"application/json", "x-ops-pin": opsPin() }, opt.headers || {});
  const res = await fetch(url, opt);
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || "Failed");
  return data;
}
document.querySelectorAll("#kind .chip").forEach(b => b.onclick = () => {
  kind = b.dataset.v;
  document.querySelectorAll("#kind .chip").forEach(x => x.classList.toggle("on", x===b));
  $("namelabel").textContent = kind === "contractor" ? "Company" : "Crew names";
  $("names").placeholder = kind === "contractor" ? "Contractor company name" : "People on this job";
});
document.querySelectorAll("#ctype .chip").forEach(b => b.onclick = () => {
  ctype = b.dataset.v;
  document.querySelectorAll("#ctype .chip").forEach(x => x.classList.toggle("on", x===b));
  $("custlabel").textContent = ctype === "b2c" ? "Customer name" : "Company";
  $("cust").placeholder = ctype === "b2c" ? "Boat or vehicle owner" : "Dealer, marina, or fleet name";
});
const Q = new URLSearchParams(location.search);
let odinJob = (Q.get("job") || "").trim();
function prefill(){
  if (Q.get("type") === "b2c") document.querySelector('#ctype .chip[data-v="b2c"]').click();
  const map = { customer:"cust", site:"site", unit:"unit", work:"work", see:"see", notes:"notes" };
  Object.keys(map).forEach(k => { if (Q.get(k)) $(map[k]).value = Q.get(k); });
  if (Q.get("asset")) $("asset").value = Q.get("asset");
  if (Q.get("due")) $("due").value = Q.get("due").slice(0,16);
  if (odinJob) $("jobpreview").textContent = odinJob + " \u00b7 from ODIN";
}
async function loadPeople(){
  const rows = await api("/api/people");
  $("mklist").innerHTML = rows.filter(r=>r.kind==="mk").map(row).join("") || `<div class="spot">None yet.</div>`;
  $("colist").innerHTML = rows.filter(r=>r.kind==="contractor").map(row).join("") || `<div class="spot">None yet.</div>`;
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    await api("/api/people/"+b.dataset.del, { method:"DELETE" });
    loadPeople();
  });
  document.querySelectorAll("[data-use]").forEach(b => b.onclick = () => {
    const r = rows.find(x => String(x.id)===b.dataset.use);
    if(!r) return;
    kind = r.kind;
    document.querySelectorAll("#kind .chip").forEach(x => x.classList.toggle("on", x.dataset.v===kind));
    $("names").value = r.name;
    $("lead").value = r.kind==="mk" ? r.name : "";
    $("phone").value = r.phone;
  });
}
function row(r){
  return `<div class="person"><span data-use="${r.id}">${r.name}<br>${r.phone}</span><button type="button" data-del="${r.id}">Delete</button></div>`;
}
$("addmk").onclick = async () => {
  await api("/api/people", { method:"POST", body: JSON.stringify({ kind:"mk", name:$("mkname").value, phone:$("mkphone").value }) });
  $("mkname").value = ""; $("mkphone").value = ""; loadPeople();
};
$("addco").onclick = async () => {
  await api("/api/people", { method:"POST", body: JSON.stringify({ kind:"contractor", name:$("coname").value, phone:$("cophone").value }) });
  $("coname").value = ""; $("cophone").value = ""; loadPeople();
};
$("make").onclick = async () => {
  err("");
  try {
    const body = {
      job_number: odinJob,
      customer_type: ctype,
      customer_name: $("cust").value,
      due: $("due").value ? new Date($("due").value).toISOString() : null,
      asset: $("asset").value,
      kind,
      crew_names: kind==="mk" ? $("names").value : "",
      company: kind==="contractor" ? $("names").value : "",
      lead_name: $("lead").value,
      lead_phone: $("phone").value,
      site: $("site").value,
      unit: $("unit").value,
      work: $("work").value,
      see_who: $("see").value,
      notes: $("notes").value
    };
    const data = await api("/api/jobs", { method:"POST", body: JSON.stringify(body) });
    const due = $("due").value ? $("due").value.replace("T"," ") : "—";
    const block = [
      "JOB " + data.job_number,
      (ctype==="b2c" ? "Customer: " : "Company: ") + $("cust").value,
      "Due on site: " + due,
      kind==="contractor" ? "Contractor · " + ($("names").value||"—") : "MK crew · " + ($("names").value||"—"),
      "Lead: " + ($("lead").value||"—"),
      "Site: " + ($("site").value||"—"),
      "Unit: " + ($("unit").value||"—"),
      "Work: " + ($("work").value||"—"),
      "See: " + ($("see").value||"—"),
      "Notes: " + ($("notes").value||"—"),
      "",
      data.link
    ].join("\n");
    $("jobpreview").textContent = "Job # " + data.job_number;
    $("block").textContent = block;
    $("out").hidden = false;
    try { await navigator.clipboard.writeText(block); } catch (e) {}
  } catch (e) { err(e.message); }
};

