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

- Ops: `https://your-app.onrender.com/assign`
- Crew link: the app builds it when Ops copies the calendar block
- Health: `https://your-app.onrender.com/api/health`

## What this build does

- Assign sets the job, the lead, and the lead’s phone number
- The lead’s number opens the card
- Clock starts when they leave the first screen. Back does not restart it
- One open job. A second phone with the lead’s number takes it over
- Photos, checklist, look-right, condition, site issue, GPS
- Score is stored on submit. Bar math is the 25 Sep weights
- Job record lives in Neon

## What is still stubbed

- ODIN pull and write-back. Needs the field list from Kyle
- Drive drop into Shared Drive 03 Ops / NOVI
- Email to jason@ and matthew@

Those wire after Kyle sends the ODIN and login answers. The app runs without them.
