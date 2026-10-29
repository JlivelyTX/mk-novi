const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});


function opsOk(req) {
  const need = process.env.OPS_PIN || "";
  if (!need) return true;
  return String(req.get("x-ops-pin") || req.body.pin || "") === need;
}
function denyOps(req, res) {
  if (opsOk(req)) return false;
  res.status(401).json({ error: "Ops pin required." });
  return true;
}

function digits(v) {
  return String(v || "").replace(/\D/g, "");
}
function id() {
  return crypto.randomUUID();
}
function token() {
  return crypto.randomBytes(16).toString("hex");
}

async function init() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
}

function scoreJob(job, state) {
  const cond = Number(state.cond || 0);
  const condPts = cond >= 1 && cond <= 5 ? cond * 10 : 0;
  const due = job.due ? new Date(job.due).getTime() : null;
  const started = state.startedAt ? Number(state.startedAt) : null;
  const onTime = due && started ? (started <= due ? 15 : 0) : 0;
  const site = state.site === "None" ? 10 : 0;
  const look = state.look === "Yes" ? 15 : 0;
  const next = state.next && state.next !== "None" ? 10 : 0;
  return {
    score: condPts + onTime + site + look + next,
    late: Boolean(due && started && started > due),
    parts: { condPts, onTime, site, look, next },
  };
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true, name: "NOVI" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- ODIN key ----------
function odinOk(req, res) {
  const need = process.env.ODIN_KEY || "";
  if (!need) { res.status(503).json({ error: "ODIN_KEY is not set on the server." }); return false; }
  if (String(req.get("x-odin-key") || "") !== need) { res.status(401).json({ error: "Bad ODIN key." }); return false; }
  return true;
}
function linkFor(jobId) {
  return `${process.env.BASE_URL || ""}/?job=${jobId}`;
}
function txt(v, max) {
  const s = String(v == null ? "" : v).trim();
  return s ? s.slice(0, max || 500) : null;
}

// ---------- People (crew + contractors) ----------
app.get("/api/people", async (req, res) => {
  if (denyOps(req, res)) return;
  const { rows } = await pool.query(
    "select id, kind, name, phone, odin_id from people where active = true order by kind, name"
  );
  res.json(rows);
});

app.post("/api/people", async (req, res) => {
  if (denyOps(req, res)) return;
  const kind = req.body.kind === "contractor" ? "contractor" : "mk";
  const name = String(req.body.name || "").trim();
  const phone = digits(req.body.phone);
  if (!name || phone.length < 10) return res.status(400).json({ error: "Name and a 10-digit number." });
  const { rows } = await pool.query(
    "insert into people (kind, name, phone) values ($1,$2,$3) returning id, kind, name, phone",
    [kind, name, phone]
  );
  res.json(rows[0]);
});

app.delete("/api/people/:id", async (req, res) => {
  if (denyOps(req, res)) return;
  await pool.query("update people set active = false where id = $1", [req.params.id]);
  res.json({ ok: true });
});

// ODIN replaces the active roster. People ODIN no longer sends are set inactive.
app.put("/api/odin/people", async (req, res) => {
  if (!odinOk(req, res)) return;
  const list = Array.isArray(req.body) ? req.body : req.body.people;
  if (!Array.isArray(list)) return res.status(400).json({ error: "Send an array of people." });
  const seen = [];
  for (const p of list) {
    const odinId = txt(p.odin_id, 80);
    const name = txt(p.name, 120);
    const phone = digits(p.phone);
    if (!odinId || !name || phone.length < 10) continue;
    const kind = p.kind === "contractor" ? "contractor" : "mk";
    const active = p.active === false ? false : true;
    const upd = await pool.query(
      "update people set kind=$1, name=$2, phone=$3, active=$4 where odin_id=$5 returning id",
      [kind, name, phone, active, odinId]
    );
    if (!upd.rows.length) {
      await pool.query(
        "insert into people (kind, name, phone, active, odin_id) values ($1,$2,$3,$4,$5)",
        [kind, name, phone, active, odinId]
      );
    }
    seen.push(odinId);
  }
  if (seen.length) {
    await pool.query("update people set active = false where odin_id is not null and not (odin_id = any($1))", [seen]);
  }
  res.json({ ok: true, synced: seen.length });
});

// ---------- Jobs in from ODIN ----------
async function saveIncomingJob(b, source) {
  const jobNumber = txt(b.job_number, 40);
  const customerName = txt(b.customer_name, 160);
  if (!jobNumber || !customerName) throw Object.assign(new Error("job_number and customer_name are required."), { code: 400 });
  const vals = {
    customer_type: b.customer_type === "b2c" ? "b2c" : "b2b",
    customer_name: customerName,
    site: txt(b.site, 300),
    unit: txt(b.unit, 200),
    work: txt(b.work, 500),
    see_who: txt(b.see_who, 300),
    notes: txt(b.notes, 1000),
    asset: ["Boat", "Automotive", "RV", "Aircraft"].includes(b.asset) ? b.asset : "Boat",
    due: b.due ? new Date(b.due) : null,
    odin_id: txt(b.odin_id, 80),
    calendar_event_id: txt(b.calendar_event_id, 200),
  };
  if (vals.due && isNaN(vals.due.getTime())) vals.due = null;
  const existing = await pool.query("select id, status from jobs where job_number = $1 limit 1", [jobNumber]);
  if (existing.rows.length) {
    const j = existing.rows[0];
    // Only change the fields ODIN actually sent.
    const sets = [];
    const args = [];
    for (const k of Object.keys(vals)) {
      if (!(k in b)) continue;
      args.push(vals[k]);
      sets.push(`${k}=$${args.length}`);
    }
    if (sets.length) {
      args.push(j.id);
      await pool.query(`update jobs set ${sets.join(", ")} where id=$${args.length}`, args);
    }
    return { id: j.id, job_number: jobNumber, status: j.status, updated: true };
  }
  const jobId = id();
  await pool.query(
    `insert into jobs (id, job_number, status, kind, source, customer_type, customer_name, site, unit, work, see_who, notes,
       asset, due, odin_id, calendar_event_id)
     values ($1,$2,'unassigned','mk',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [jobId, jobNumber, source, vals.customer_type, vals.customer_name, vals.site, vals.unit, vals.work,
     vals.see_who, vals.notes, vals.asset, vals.due, vals.odin_id, vals.calendar_event_id]
  );
  return { id: jobId, job_number: jobNumber, status: "unassigned", updated: false };
}

app.post("/api/odin/jobs", async (req, res) => {
  if (!odinOk(req, res)) return;
  try {
    res.json(await saveIncomingJob(req.body || {}, "odin"));
  } catch (e) {
    res.status(e.code || 500).json({ error: e.message });
  }
});

// ODIN can pull assignments as well as receive the push.
app.get("/api/odin/assignments", async (req, res) => {
  if (!odinOk(req, res)) return;
  const since = req.query.since ? new Date(req.query.since) : new Date(0);
  const { rows } = await pool.query(
    `select j.*, p.odin_id as person_odin_id from jobs j left join people p on p.id = j.assignee_id
     where j.assigned_at is not null and j.assigned_at > $1 order by j.assigned_at`,
    [isNaN(since.getTime()) ? new Date(0) : since]
  );
  res.json(rows.map(assignmentPayload));
});

function assignmentPayload(j) {
  return {
    job_number: j.job_number,
    odin_id: j.odin_id,
    calendar_event_id: j.calendar_event_id,
    status: j.status,
    link: linkFor(j.id),
    assigned_at: j.assigned_at,
    assignee: {
      kind: j.kind,
      name: j.kind === "contractor" ? j.company : j.lead_name,
      lead_name: j.lead_name,
      phone: j.lead_phone,
      odin_id: j.person_odin_id || null,
    },
    crew_names: j.crew_names,
  };
}

async function tellOdin(jobId) {
  const url = process.env.ODIN_WEBHOOK_URL || "";
  if (!url) return "not set";
  try {
    const { rows } = await pool.query(
      "select j.*, p.odin_id as person_odin_id from jobs j left join people p on p.id = j.assignee_id where j.id = $1",
      [jobId]
    );
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-odin-key": process.env.ODIN_KEY || "" },
      body: JSON.stringify(assignmentPayload(rows[0])),
      signal: AbortSignal.timeout(8000),
    });
    const ok = r.ok ? "sent" : "failed " + r.status;
    await pool.query("update jobs set odin_notified = $1 where id = $2", [ok, jobId]);
    return ok;
  } catch (e) {
    await pool.query("update jobs set odin_notified = $1 where id = $2", ["failed", jobId]);
    return "failed";
  }
}

// ---------- Ops: Matt's inbox ----------
app.get("/api/ops/jobs", async (req, res) => {
  if (denyOps(req, res)) return;
  const { rows } = await pool.query(
    `select id, job_number, status, source, customer_type, customer_name, site, unit, work, see_who, notes, asset, due,
       kind, lead_name, company, crew_names, assigned_at, started_at, odin_notified
     from jobs where status in ('unassigned','open') order by (status='unassigned') desc, due nulls last, created_at`
  );
  res.json(rows.map((r) => Object.assign(r, { link: r.status === "open" ? linkFor(r.id) : null })));
});

app.post("/api/ops/jobs/:id/assign", async (req, res) => {
  if (denyOps(req, res)) return;
  const { rows } = await pool.query("select * from jobs where id = $1", [req.params.id]);
  const job = rows[0];
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (job.status === "closed") return res.status(409).json({ error: "This job is closed." });
  if (job.started_at) return res.status(409).json({ error: "The crew already started this job." });
  const pr = await pool.query("select * from people where id = $1 and active = true", [req.body.person_id]);
  const person = pr.rows[0];
  if (!person) return res.status(400).json({ error: "Pick a crew member or contractor." });
  const isCo = person.kind === "contractor";
  await pool.query(
    `update jobs set status='open', kind=$1, lead_name=$2, lead_phone=$3, company=$4, crew_names=$5,
       assignee_id=$6, assigned_at=now(), odin_notified=null where id=$7`,
    [person.kind, isCo ? null : person.name, person.phone, isCo ? person.name : null,
     txt(req.body.crew_names, 300), person.id, job.id]
  );
  const odin = await tellOdin(job.id);
  res.json({ ok: true, link: linkFor(job.id), odin });
});

app.post("/api/ops/jobs/:id/unassign", async (req, res) => {
  if (denyOps(req, res)) return;
  const { rows } = await pool.query("select status, started_at from jobs where id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Job not found." });
  if (rows[0].started_at || rows[0].status === "closed") return res.status(409).json({ error: "The crew already started this job." });
  await pool.query(
    `update jobs set status='unassigned', lead_name=null, lead_phone=null, company=null, crew_names=null,
       assignee_id=null, assigned_at=null, lock_token=null where id=$1`,
    [req.params.id]
  );
  res.json({ ok: true });
});

// Test jobs so Ops can try the flow before ODIN is connected.
app.post("/api/ops/test-jobs", async (req, res) => {
  if (denyOps(req, res)) return;
  const due = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();
  const n = (await pool.query("select nextval('job_seq') as n")).rows[0].n;
  const samples = [
    { job_number: `TEST-${n}-A`, customer_type: "b2b", customer_name: "Test Marina", site: "Test Marina, slip 12", unit: "2022 Sea Ray 230", work: "Full detail", asset: "Boat", due: due(24), see_who: "Dock office", notes: "TEST JOB" },
    { job_number: `TEST-${n}-B`, customer_type: "b2c", customer_name: "Test Owner", site: "Owner driveway", unit: "2019 Grady-White 251", work: "Wash and wax", asset: "Boat", due: due(48), notes: "TEST JOB" },
    { job_number: `TEST-${n}-C`, customer_type: "b2b", customer_name: "Test Auto Group", site: "Test Auto lot", unit: "Stock #T100", work: "Lot wash", asset: "Automotive", due: due(72), notes: "TEST JOB" },
  ];
  try {
    for (const s of samples) await saveIncomingJob(s, "test");
    res.json({ ok: true, added: samples.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/ops/test-jobs", async (req, res) => {
  if (denyOps(req, res)) return;
  const r = await pool.query("delete from jobs where source = 'test'");
  res.json({ ok: true, removed: r.rowCount });
});

app.get("/api/jobs/:id", async (req, res) => {
  const pin = digits(req.query.pin);
  const { rows } = await pool.query("select * from jobs where id = $1", [req.params.id]);
  const job = rows[0];
  if (!job || job.status === "unassigned") return res.status(404).json({ error: "Job not found." });
  if (!pin || pin !== job.lead_phone) return res.status(401).json({ error: "That number does not open this job." });
  if (job.status === "closed") return res.json({ closed: true, job: publicJob(job) });
  const tok = token();
  await pool.query("update jobs set lock_token = $1, locked_at = now() where id = $2", [tok, job.id]);
  res.json({ closed: false, token: tok, job: publicJob(job), state: job.state || {} });
});

app.post("/api/jobs/:id/state", async (req, res) => {
  const pin = digits(req.body.pin);
  const { rows } = await pool.query("select * from jobs where id = $1", [req.params.id]);
  const job = rows[0];
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (job.status === "closed") return res.status(409).json({ error: "This job is closed." });
  if (pin !== job.lead_phone) return res.status(401).json({ error: "That number does not open this job." });
  const incoming = req.body.state || {};
  const started = job.started_at || (incoming.startedAt ? new Date(Number(incoming.startedAt)) : null);
  if (!job.started_at && incoming.startedAt) {
    await pool.query("update jobs set started_at = $1 where id = $2", [started, job.id]);
  }
  if (incoming.startedAt && job.started_at) incoming.startedAt = new Date(job.started_at).getTime();
  await pool.query(
    "update jobs set state = $1, lock_token = $2, locked_at = now() where id = $3",
    [incoming, req.body.token || job.lock_token, job.id]
  );
  res.json({ ok: true, startedAt: incoming.startedAt || null });
});

app.post("/api/jobs/:id/submit", async (req, res) => {
  const pin = digits(req.body.pin);
  const { rows } = await pool.query("select * from jobs where id = $1", [req.params.id]);
  const job = rows[0];
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (job.status === "closed") return res.status(409).json({ error: "This job is already closed." });
  if (pin !== job.lead_phone) return res.status(401).json({ error: "That number does not open this job." });
  const state = req.body.state || job.state || {};
  if (job.started_at) state.startedAt = new Date(job.started_at).getTime();
  const scored = scoreJob(job, state);
  await pool.query(
    `update jobs set status = 'closed', state = $1, score = $2, late = $3,
      ended_at = now(), submitted_at = now(), lock_token = null where id = $4`,
    [state, scored.score, scored.late, job.id]
  );
  console.log("NOVI submit", job.job_number, scored.score, "late", scored.late);
  res.json({ ok: true, score: scored.score, late: scored.late });
});

function publicJob(job) {
  return {
    id: job.id,
    job_number: job.job_number,
    customer_type: job.customer_type,
    customer_name: job.customer_name,
    due: job.due,
    kind: job.kind,
    lead_name: job.lead_name,
    company: job.company,
    crew_names: job.crew_names,
    site: job.site,
    unit: job.unit,
    work: job.work,
    see_who: job.see_who,
    notes: job.notes,
    asset: job.asset,
    status: job.status,
    started_at: job.started_at,
  };
}

app.post("/api/ops", (req, res) => {
  const need = process.env.OPS_PIN || "";
  if (!need) return res.json({ ok: true });
  if (String(req.body.pin || "") !== need) return res.status(401).json({ error: "Wrong ops pin." });
  res.json({ ok: true });
});

app.get("/assign", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "assign.html"));
});

// One bad request should never take the app down.
process.on("unhandledRejection", (err) => console.error("NOVI error", err && err.message ? err.message : err));
app.use((err, _req, res, _next) => {
  console.error("NOVI error", err.message);
  res.status(500).json({ error: "Something went wrong. Try again." });
});

const port = process.env.PORT || 10000;
init()
  .then(() => app.listen(port, () => console.log("NOVI on " + port)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
