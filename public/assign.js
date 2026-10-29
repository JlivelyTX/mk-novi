async function unlock(){
  try {
    await api("/api/ops", { method:"POST", body: JSON.stringify({ pin: $("opspin").value }) });
    sessionStorage.setItem("novi_ops", $("opspin").value || "");
    $("gate").hidden = true;
    $("form").hidden = false;
    loadPeople().catch(e => err("Database is not connected yet. " + e.message));
  } catch(e){ alert(e.message); }
}
document.getElementById("opsgo").onclick = unlock;
let kind = "mk";
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
      job_number: $("job").value,
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
      "JOB " + ($("job").value || "—"),
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
    $("block").textContent = block;
    $("out").hidden = false;
    try { await navigator.clipboard.writeText(block); } catch (e) {}
  } catch (e) { err(e.message); }
};

