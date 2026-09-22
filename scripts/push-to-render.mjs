// Pushes the local real-data snapshots straight to the deployed Render
// service's Secret Files via Render's API, instead of copy-pasting JSON
// into the dashboard by hand. Run whenever the local data/*.json files
// have been refreshed (e.g. after asking Claude to pull fresh Robinhood
// data). Does NOT trigger a deploy - go click "Manual Deploy" in the
// Render dashboard afterward (or pass --deploy to trigger one here too).
//
// Requires RENDER_API_KEY and RENDER_SERVICE_ID in .env.

import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

const { RENDER_API_KEY, RENDER_SERVICE_ID } = process.env;
if (!RENDER_API_KEY || !RENDER_SERVICE_ID) {
  console.error('Missing RENDER_API_KEY or RENDER_SERVICE_ID in .env - see .env.example.');
  process.exit(1);
}

const FILES = ['robinhood-snapshot.json', 'market-snapshot.json', 'fundamentals-snapshot.json', 'research-snapshot.json', 'candidates-snapshot.json', 'webauthn-credentials.json', 'outlook-token-cache.json', 'google-token.json'];
const API_BASE = `https://api.render.com/v1/services/${RENDER_SERVICE_ID}`;

async function pushSecretFile(filename) {
  let content;
  try {
    content = await readFile(path.join(DATA_DIR, filename), 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return console.log(`Skipped ${filename} (no local file yet)`);
    throw err;
  }
  const res = await fetch(`${API_BASE}/secret-files/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`${filename}: ${res.status} ${await res.text()}`);
  }
  console.log(`Pushed ${filename}`);
}

async function triggerDeploy() {
  const res = await fetch(`${API_BASE}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Deploy trigger failed: ${res.status} ${bodyText}`);
  }
  const deploy = bodyText ? JSON.parse(bodyText) : null;
  console.log(deploy?.id ? `Triggered deploy ${deploy.id}` : 'Deploy triggered.');
}

for (const filename of FILES) {
  await pushSecretFile(filename);
}

if (process.argv.includes('--deploy')) {
  await triggerDeploy();
} else {
  console.log('Secret files updated. Go click "Manual Deploy" in the Render dashboard to apply them (or re-run with --deploy).');
}
