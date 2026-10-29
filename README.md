# NOVI

Nexus · Operations · Visibility · Intelligence

MK Asset Management job card. Assign is for Ops. NOVI is the card the crew opens from the calendar link.

## What you need

- A Neon account and a database
- A Render account
- This folder

## Neon

1. Create a project.
2. Create a database.
3. Copy the connection string. It looks like `postgres://...neon.tech/neondb?sslmode=require`
4. That is `DATABASE_URL`.

The app creates its own tables on start. You do not paste the schema by hand.

## Render

1. New Web Service.
2. Upload this folder, or connect the repo if you put it on GitHub.
3. Runtime: Node.
4. Build command: `npm install`
5. Start command: `npm start`
6. Environment:
   - `DATABASE_URL` = the Neon string
   - `BASE_URL` = the Render URL, no slash at the end
   - `OPS_PIN` = a pin only Ops knows
7. Deploy.

## After it is up

- Ops: `https://mk-novi.onrender.com/assign`
- Crew: the link ODIN puts in the calendar event
- Health: `https://mk-novi.onrender.com/api/health`
- ODIN connection: see `ODIN.md`

## What this build does

- Jobs come in from ODIN with their job number, customer, site, unit, and work
- Assign is Ops' inbox: Needs crew and Assigned. Tap a job, pick the MK crew member or contractor, done
- NOVI sends ODIN the crew link; ODIN writes it to the calendar event
- The lead's phone number opens the card
- Clock starts when they leave the first screen. Back does not restart it
- Photos, checklist, look-right, condition, site issue, GPS
- Score is stored on submit. Bar math is the 25 Sep weights
- Test jobs button on Assign for trying the flow before ODIN is connected

## Environment

- `DATABASE_URL`, `BASE_URL`, `OPS_PIN`
- `ODIN_KEY` — shared secret for ODIN calls
- `ODIN_WEBHOOK_URL` — optional, where NOVI posts assignments

## Still to wire

- Job results back to ODIN on submit
- Drive drop into Shared Drive 03 Ops / NOVI
