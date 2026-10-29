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

function jobPrefix(name) {
  const words = String(name || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  let out = "";
  for (const w of words) {
    if (!out) { out = w.slice(0, 12); continue; }
    if ((out + w).length > 12) break;
    out += w;
  }
  return out || "JOB";
}
function yymm() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "2-digit", month: "2-digit" }).formatToParts(new Date());
  return p.find(x => x.type === "year").value + p.find(x => x.type === "month").value;
}
async function nextJobNumber(name) {
  const { rows } = await pool.query("select nextval('job_seq') as n");
  return `${jobPrefix(name)}-${yymm()}-${rows[0].n}`;
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

app.get("/api/people", async (req, res) => {
  if (denyOps(req, res)) return;
  const { rows } = await pool.query("select id, kind, name, phone from people order by name");
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
  await pool.query("delete from people where id = $1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/jobs", async (req, res) => {
  if (denyOps(req, res)) return;
  const b = req.body || {};
  const customerType = b.customer_type === "b2c" ? "b2c" : "b2b";
  const customerName = String(b.customer_name || "").trim();
  const leadName = String(b.lead_name || "").trim();
  const leadPhone = digits(b.lead_phone);
  if (!customerName || !leadName || leadPhone.length < 10) {
    return res.status(400).json({ error: (customerType === "b2c" ? "Customer name" : "Company") + ", lead, and a 10-digit lead number are required." });
  }
  const jobId = id();
  const given = String(b.job_number || "").trim().slice(0, 40);
  if (given) {
    const dup = await pool.query("select 1 from jobs where job_number = $1 limit 1", [given]);
    if (dup.rows.length) return res.status(409).json({ error: "Job # " + given + " is already assigned." });
  }
  const jobNumber = given || (await nextJobNumber(customerName));
  await pool.query(
    `insert into jobs
      (id, job_number, due, kind, lead_name, lead_phone, company, crew_names, site, unit, work, see_who, notes, asset, customer_type, customer_name)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      jobId,
      jobNumber,
      b.due || null,
      b.kind === "contractor" ? "contractor" : "mk",
      leadName,
      leadPhone,
      b.company || null,
      b.crew_names || null,
      b.site || null,
      b.unit || null,
      b.work || null,
      b.see_who || null,
      b.notes || null,
      b.asset || "Boat",
      customerType,
      customerName,
    ]
  );
  const base = process.env.BASE_URL || "";
  res.json({ id: jobId, job_number: jobNumber, link: `${base}/?job=${jobId}` });
});

app.get("/api/jobs/:id", async (req, res) => {
  const pin = digits(req.query.pin);
  const { rows } = await pool.query("select * from jobs where id = $1", [req.params.id]);
  const job = rows[0];
  if (!job) return res.status(404).json({ error: "Job not found." });
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

const port = process.env.PORT || 10000;
init()
  .then(() => app.listen(port, () => console.log("NOVI on " + port)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
