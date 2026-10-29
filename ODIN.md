# NOVI ↔ ODIN

ODIN owns the job, the job number, the roster, and the calendar.
NOVI owns who is doing the job and the crew card.

## Flow

1. ODIN creates a job and sends it to NOVI.
2. Ops opens NOVI Assign, taps the job, picks the MK crew member or contractor.
3. NOVI tells ODIN who is doing it and gives ODIN the crew link.
4. ODIN writes that link into the calendar event description.
5. The crew lead opens the link from the calendar and enters their phone number.

## Setup on Render (mk-novi → Environment)

- `ODIN_KEY` — a shared secret. ODIN sends it as the `x-odin-key` header. NOVI sends it back on the webhook.
- `ODIN_WEBHOOK_URL` — where NOVI posts each assignment. Optional; ODIN can pull instead.

Base URL: `https://mk-novi.onrender.com`

## 1. Send a job — `POST /api/odin/jobs`

Header: `x-odin-key: <ODIN_KEY>`

```json
{
  "job_number": "ODIN-5001",
  "odin_id": "abc123",
  "calendar_event_id": "google-event-id",
  "customer_type": "b2b",
  "customer_name": "MarineMax Kemah",
  "site": "Kemah lot",
  "unit": "2024 Sea Ray SDX",
  "work": "Full detail",
  "asset": "Boat",
  "due": "2026-10-30T14:00:00Z",
  "see_who": "Service desk, 281-555-0100",
  "notes": "Gate code at office"
}
```

Required: `job_number`, `customer_name`.
`customer_type`: `b2b` or `b2c`. `asset`: `Boat`, `Automotive`, `RV`, `Aircraft`.
Send the same `job_number` again to update it. Only the fields you send change.

## 2. Send the roster — `PUT /api/odin/people`

Header: `x-odin-key: <ODIN_KEY>`

```json
[
  { "odin_id": "p1", "kind": "mk", "name": "Juan Diaz", "phone": "7135550111" },
  { "odin_id": "p2", "kind": "contractor", "name": "Gulf Shine LLC", "phone": "7135550222" }
]
```

`kind`: `mk` or `contractor`. For a contractor, `phone` is their lead's phone — that number opens the card.
Send the full active list each time. Anyone ODIN stops sending is set inactive.

## 3. Get assignments

Push: NOVI posts this to `ODIN_WEBHOOK_URL` the moment Ops assigns. Pull: `GET /api/odin/assignments?since=<ISO time>` returns a list of the same.

```json
{
  "job_number": "ODIN-5001",
  "odin_id": "abc123",
  "calendar_event_id": "google-event-id",
  "status": "open",
  "link": "https://mk-novi.onrender.com/?job=<id>",
  "assigned_at": "2026-10-29T17:36:05Z",
  "assignee": { "kind": "mk", "name": "Juan Diaz", "lead_name": "Juan Diaz", "phone": "7135550111", "odin_id": "p1" },
  "crew_names": "Mike"
}
```

ODIN writes `link` into the calendar event with `calendar_event_id`. If Ops changes who is doing it, a new assignment is sent with the same link.

## Still to wire

- Job results back to ODIN on submit (score, photos, condition).
- Drive drop into Shared Drive 03 Ops / NOVI.
