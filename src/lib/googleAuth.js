// Google OAuth (Gmail + Calendar). Mirrors lib/msGraphAuth.js's pattern
// exactly - this is the ONLY file that should hold the Google OAuth2
// client or its tokens; googleWorkClient.js calls getAuthedClient() here
// rather than touching auth directly.
//
// Token persistence: data/google-token.json, same /etc/secrets-first
// read-fallback as everything else - push it via scripts/push-to-render.mjs
// (and trigger a deploy) after connecting, or it's lost on the next deploy.

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TOKEN_FILENAME = 'google-token.json';

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
];

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

export function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

function candidatePaths(filename) {
  return [path.join('/etc/secrets', filename), path.join(DATA_DIR, filename)];
}

async function loadTokenFile() {
  for (const filePath of candidatePaths(TOKEN_FILENAME)) {
    try {
      return JSON.parse(await readFile(filePath, 'utf-8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return null;
}

async function saveTokenFile(tokens) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, TOKEN_FILENAME), JSON.stringify(tokens, null, 2));
}

let client;
let connected = false;
let initPromise;

function buildClient() {
  const c = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  // Google may silently refresh the access token on any API call; catch
  // that so the persisted file stays current (refresh_token itself
  // rarely changes, but this keeps everything in sync regardless).
  c.on('tokens', (tokens) => {
    const merged = { ...c.credentials, ...tokens };
    c.setCredentials(merged);
    saveTokenFile(merged).catch(() => {});
  });
  return c;
}

async function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      client = buildClient();
      const saved = await loadTokenFile();
      if (saved) {
        client.setCredentials(saved);
        connected = true;
      }
    })();
  }
  return initPromise;
}

export async function isConnected() {
  await ensureInit();
  return connected;
}

export async function getAuthUrl() {
  if (!isConfigured()) throw new Error('Google isn\'t configured yet - missing GOOGLE_* env vars.');
  await ensureInit();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token every time, not just first consent
    scope: SCOPES,
  });
}

export async function handleCallback(code) {
  await ensureInit();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  connected = true;
  await saveTokenFile(tokens);
}

export async function disconnect() {
  await ensureInit();
  connected = false;
  await saveTokenFile(null);
}

export async function exportTokens() {
  await ensureInit();
  return await loadTokenFile();
}

// Returns an authenticated OAuth2 client ready to pass as `auth` to any
// googleapis service (gmail, calendar, ...). Throws if not connected.
export async function getAuthedClient() {
  if (!isConfigured()) throw new Error('Google isn\'t configured yet - missing GOOGLE_* env vars.');
  await ensureInit();
  if (!connected) throw new Error('Google isn\'t connected yet - visit /api/auth/google/login while logged in.');
  return client;
}
