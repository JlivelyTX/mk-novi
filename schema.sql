CREATE TABLE IF NOT EXISTS people (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('mk', 'contractor')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  job_number TEXT NOT NULL,
  due TIMESTAMPTZ,
  kind TEXT NOT NULL CHECK (kind IN ('mk', 'contractor')),
  lead_name TEXT NOT NULL,
  lead_phone TEXT NOT NULL,
  company TEXT,
  crew_names TEXT,
  site TEXT,
  unit TEXT,
  work TEXT,
  see_who TEXT,
  notes TEXT,
  asset TEXT NOT NULL DEFAULT 'Boat',
  status TEXT NOT NULL DEFAULT 'open',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  lock_token TEXT,
  locked_at TIMESTAMPTZ,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  score INT,
  late BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_type TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_name TEXT;
CREATE SEQUENCE IF NOT EXISTS job_seq START 1001;

-- Jobs come from ODIN unassigned; Ops picks the person.
ALTER TABLE jobs ALTER COLUMN lead_name DROP NOT NULL;
ALTER TABLE jobs ALTER COLUMN lead_phone DROP NOT NULL;
ALTER TABLE jobs ALTER COLUMN kind DROP NOT NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS odin_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assignee_id INT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS odin_notified TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE people ADD COLUMN IF NOT EXISTS odin_id TEXT;
UPDATE jobs SET assigned_at = created_at WHERE assigned_at IS NULL AND status = 'open' AND lead_phone IS NOT NULL;
