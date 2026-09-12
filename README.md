# Buddy Backend

Real backend for the Buddy app - starts in **shadow mode** (safe, no live
trades or sends) so you can verify everything works before connecting
real credentials.

## What's here

```
src/
  server.js              Entry point, mounts /api/financial and /api/work
  routes/
    financial.js          Portfolio, stage-trade, confirm-trade endpoints
    work.js                Inbox briefing, draft-reply, calendar endpoints
  lib/
    robinhoodClient.js    ONLY file that talks to Robinhood - Financial tab only
    outlookClient.js       ONLY file that talks to Microsoft Graph - Work tab only
```

Financial and Work never import each other's client files. That's what
keeps the credential isolation you designed - each tab's secrets stay in
its own lane.

## Run it locally (shadow mode, safe)

```bash
cp .env.example .env
npm install
npm run dev
```

Visit `http://localhost:3000/api/health` - you should see
`"shadowMode": true`. In this mode, every endpoint returns realistic
sample data and "would have executed" results, without touching any real
account. This is the mode to use while you connect the frontend
(buddy-app.html) and test the full click-through flow.

## Connecting Robinhood (do this AFTER shadow-mode testing looks right)

1. In the Robinhood app, open a dedicated **Agentic account** and fund it
   (per your 50%-of-balance rule).
2. Connect it to this backend via Robinhood's Trading MCP -
   `https://agent.robinhood.com/mcp/trading` - following Robinhood's
   current setup instructions for your AI platform (check
   robinhood.com/us/en/agentic-trading for the latest steps, since this
   is a newer feature and their flow may be updated).
3. Fill in `ROBINHOOD_AGENTIC_ACCOUNT_ID` in `.env`.
4. Replace the `TODO` stubs in `src/lib/robinhoodClient.js` with real MCP
   calls.
5. Leave `SHADOW_MODE=true` until you've confirmed `getPortfolio()`
   returns your real, correct account data. Only then set it to `false`.
6. Leave `REQUIRE_MANUAL_CONFIRMATION=true` permanently unless you
   consciously decide otherwise later - this is what keeps every trade
   gated behind your explicit approval.

## Connecting Outlook

1. Go to portal.azure.com -> App registrations -> New registration.
2. Add API permissions: `Mail.Read`, `Mail.ReadWrite` (for drafts only -
   do not add `Mail.Send`, since Buddy should never send on its own),
   `Calendars.ReadWrite`.
3. Copy the Client ID, Tenant ID, and generate a Client Secret into
   `.env`.
4. Replace the `TODO` stubs in `src/lib/outlookClient.js` with real Graph
   calls.

## Deploying so it's actually "live" on your phone

This needs to run somewhere persistent, not on your Mac only. Simple
options to research: Render, Railway, or Fly.io all have straightforward
free/cheap tiers for a small Node app like this. Once deployed, update
the frontend (buddy-app.html) to call your deployed URL instead of
`localhost`, and host that frontend file the same way (or serve it from
this same server as a static file).

## Before you trust it with real trades

Run in shadow mode first. Click through every flow in the actual app -
report, risk tiers, Buddy's Picks, confirm modal - and make sure the
data and behavior look right. Only then connect real credentials, and
even then, start small.
