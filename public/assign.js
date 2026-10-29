const $ = (id) => document.getElementById(id);
let tab = "unassigned";
let jobs = [];
let people = [];
let current = null;
let picked = null;
let pkind = "mk";

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function opsPin() { try { return sessionStorage.getItem("novi_ops") || ""; } catch (e) { return window._ops || ""; } }
function setPin(v) { window._ops = v; try { sessionStorage.setItem("novi_ops", v); } catch (e) {} }
async function api(url, opt) {
  opt = opt || {};
  opt.headers = Object.assign({ "Content-Type": "application/json", "x-ops-pin": opsPin() }, opt.headers || {});
  const res = await fetch(url, opt);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed");
  return data;
}
function when(d) {
  if (!d) return "No due time";
  return new Date(d).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function show(view) {
  $("gate").hidden = view !== "gate";
  $("inbox").hidden = view !== "inbox";
  $("detail").hidden = view !== "detail";
  window.scrollTo(0, 0);
}

async function unlock() {
  $("gateerr").textContent = "";
  try {
    await api("/api/ops", { method: "POST", body: JSON.stringify({ pin: $("opspin").value }) });
    setPin($("opspin").value);
    show("inbox");
    await loadAll();
  } catch (e) { $("gateerr").textContent = e.message; }
}
$("opsgo").onclick = unlock;
$("opspin").onkeydown = (e) => { if (e.key === "Enter") unlock(); };

async function loadAll() {
  $("err").textContent = "";
  try {
    [jobs, people] = await Promise.all([api("/api/ops/jobs"), api("/api/people")]);
  } catch (e) { $("err").textContent = e.message; return; }
  drawList();
  drawPeople();
}

function drawList() {
  const un = jobs.filter((j) => j.status === "unassigned");
  const op = jobs.filter((j) => j.status === "open");
  $("n-un").textContent = un.length ? "(" + un.length + ")" : "";
  $("n-open").textContent = op.length ? "(" + op.length + ")" : "";
  const rows = tab === "unassigned" ? un : op;
  if (!rows.length) {
    $("list").innerHTML = `<div class="spot">${tab === "unassigned" ? "No jobs waiting. New jobs show here when ODIN sends them." : "Nothing assigned yet."}</div>`;
    return;
  }
  $("list").innerHTML = rows.map((j) => `
    <button type="button" class="jobrow" data-id="${esc(j.id)}">
      <span class="jr-top"><b>${esc(j.customer_name || "—")}</b><span class="jr-num">${esc(j.job_number)}</span></span>
      <span class="jr-line">${esc(j.site || "No site")}</span>
      <span class="jr-line">${esc(j.work || "")}${j.work && j.unit ? " · " : ""}${esc(j.unit || "")}</span>
      <span class="jr-due">${esc(when(j.due))}${j.status === "open" ? " · " + esc(j.kind === "contractor" ? j.company : j.lead_name) : ""}${j.source === "test" ? " · TEST" : ""}</span>
    </button>`).join("");
  document.querySelectorAll(".jobrow").forEach((b) => (b.onclick = () => openJob(b.dataset.id)));
}

document.querySelectorAll("#tabs .chip").forEach((b) => (b.onclick = () => {
  tab = b.dataset.v;
  document.querySelectorAll("#tabs .chip").forEach((x) => x.classList.toggle("on", x === b));
  drawList();
}));
$("refresh").onclick = loadAll;

function openJob(id) {
  current = jobs.find((j) => j.id === id);
  if (!current) return;
  picked = null;
  $("derr").textContent = "";
  const j = current;
  $("d-num").textContent = "Job " + j.job_number + (j.source === "test" ? " · TEST" : "");
  $("d-cust").textContent = (j.customer_type === "b2c" ? "Customer: " : "") + (j.customer_name || "—");
  const facts = [
    ["Due", when(j.due)], ["Site", j.site], ["Unit", j.unit], ["Work", j.work],
    ["Asset", j.asset], ["See on site", j.see_who], ["Notes", j.notes],
  ].filter((f) => f[1]);
  $("d-facts").innerHTML = facts.map((f) => `<div><span>${esc(f[0])}</span>${esc(f[1])}</div>`).join("");
  const assigned = j.status === "open";
  $("d-assigned").hidden = !assigned;
  $("d-pick").hidden = assigned;
  if (assigned) {
    $("d-who").textContent = (j.kind === "contractor" ? "Contractor · " + (j.company || "") : "MK crew · " + (j.lead_name || "")) + (j.crew_names ? " + " + j.crew_names : "");
    $("d-link").value = j.link || "";
    $("d-odin").textContent = j.odin_notified === "sent" ? "ODIN has the link." : "ODIN has not picked this up yet.";
    $("unassign").hidden = Boolean(j.started_at);
  } else {
    $("d-crew").value = "";
    drawPicker();
  }
  show("detail");
}

function drawPicker() {
  const group = (kind, title) => {
    const list = people.filter((p) => p.kind === kind);
    if (!list.length) return `<div class="spot">No ${title.toLowerCase()} yet. Add them on the job list screen.</div>`;
    return list.map((p) => `
      <button type="button" class="pick ${picked === p.id ? "on" : ""}" data-p="${p.id}">
        <b>${esc(p.name)}</b><span>${esc(p.phone)}</span>
      </button>`).join("");
  };
  $("picker").innerHTML = `<div class="kicker">MK crew</div>${group("mk", "MK crew")}<div class="kicker" style="margin-top:12px">Contractors</div>${group("contractor", "Contractors")}`;
  document.querySelectorAll(".pick").forEach((b) => (b.onclick = () => { picked = Number(b.dataset.p); drawPicker(); }));
}

$("assign").onclick = async () => {
  $("derr").textContent = "";
  if (!picked) { $("derr").textContent = "Pick who is doing it."; return; }
  try {
    await api("/api/ops/jobs/" + current.id + "/assign", { method: "POST", body: JSON.stringify({ person_id: picked, crew_names: $("d-crew").value }) });
    const id = current.id;
    await loadAll();
    openJob(id);
  } catch (e) { $("derr").textContent = e.message; }
};
$("unassign").onclick = async () => {
  $("derr").textContent = "";
  try {
    await api("/api/ops/jobs/" + current.id + "/unassign", { method: "POST", body: "{}" });
    const id = current.id;
    await loadAll();
    openJob(id);
  } catch (e) { $("derr").textContent = e.message; }
};
$("copylink").onclick = async () => {
  try { await navigator.clipboard.writeText($("d-link").value); $("copylink").textContent = "Copied"; } catch (e) { $("d-link").select(); }
  setTimeout(() => ($("copylink").textContent = "Copy"), 1500);
};
$("backlist").onclick = () => { show("inbox"); drawList(); };

$("addtest").onclick = async () => {
  try { await api("/api/ops/test-jobs", { method: "POST", body: "{}" }); await loadAll(); } catch (e) { $("err").textContent = e.message; }
};
$("cleartest").onclick = async () => {
  try { await api("/api/ops/test-jobs", { method: "DELETE" }); await loadAll(); } catch (e) { $("err").textContent = e.message; }
};

function drawPeople() {
  const row = (p) => `<div class="person"><span>${esc(p.name)}<br>${esc(p.phone)}</span>${p.odin_id ? "<em>ODIN</em>" : `<button type="button" data-del="${p.id}">Remove</button>`}</div>`;
  const mk = people.filter((p) => p.kind === "mk").map(row).join("") || `<div class="spot">No MK crew yet.</div>`;
  const co = people.filter((p) => p.kind === "contractor").map(row).join("") || `<div class="spot">No contractors yet.</div>`;
  $("people").innerHTML = `<div class="kicker">MK crew</div>${mk}<div class="kicker" style="margin-top:12px">Contractors</div>${co}`;
  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    try { await api("/api/people/" + b.dataset.del, { method: "DELETE" }); await loadAll(); } catch (e) { $("err").textContent = e.message; }
  }));
}
document.querySelectorAll("#pkind .chip").forEach((b) => (b.onclick = () => {
  pkind = b.dataset.v;
  document.querySelectorAll("#pkind .chip").forEach((x) => x.classList.toggle("on", x === b));
}));
$("addp").onclick = async () => {
  $("err").textContent = "";
  try {
    await api("/api/people", { method: "POST", body: JSON.stringify({ kind: pkind, name: $("pname").value, phone: $("pphone").value }) });
    $("pname").value = ""; $("pphone").value = "";
    await loadAll();
  } catch (e) { $("err").textContent = e.message; }
};

if (opsPin()) {
  api("/api/ops", { method: "POST", body: JSON.stringify({ pin: opsPin() }) })
    .then(() => { show("inbox"); return loadAll(); })
    .catch(() => show("gate"));
} else {
  show("gate");
}
