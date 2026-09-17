// Microsoft Graph OAuth (Outlook). This is the ONLY file that should
// hold the MSAL client or token cache - outlookClient.js calls
// getAccessToken() here rather than touching auth directly.
//
// Unlike Robinhood, Microsoft Graph has a normal public OAuth flow, so
// this is a real independent connection - no manual Claude refresh
// needed once connected. Setup: an Azure app registration (see README
// "Connecting Outlook") gives MS_GRAPH_CLIENT_ID / MS_GRAPH_TENANT_ID /
// MS_GRAPH_CLIENT_SECRET.
//
// The token cache (refresh token included) is persisted to
// data/outlook-token-cache.json - same read-fallback pattern as the
// other data files (checks /etc/secrets first, so push it there via
// scripts/push-to-render.mjs to survive deploys, same as the passkey).

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConfidentialClientApplication } from '@azure/msal-node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CACHE_FILENAME = 'outlook-token-cache.json';

export const SCOPES = ['Mail.Read', 'Calendars.ReadWrite', 'User.Read', 'offline_access'];

const CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET;
const TENANT_ID = process.env.MS_GRAPH_TENANT_ID;
export const REDIRECT_URI = process.env.MS_GRAPH_REDIRECT_URI;

export function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && TENANT_ID && REDIRECT_URI);
}

function candidatePaths(filename) {
  return [path.join('/etc/secrets', filename), path.join(DATA_DIR, filename)];
}

async function loadCacheFile() {
  for (const filePath of candidatePaths(CACHE_FILENAME)) {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return null;
}

async function saveCacheFile(data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, CACHE_FILENAME), JSON.stringify(data, null, 2));
}

let client;
let homeAccountId;
let initPromise;

function buildClient() {
  return new ConfidentialClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
      clientSecret: CLIENT_SECRET,
    },
  });
}

// Loads the persisted cache (if any) into a fresh MSAL client. Safe to
// call repeatedly - only does real work once per process.
async function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      client = buildClient();
      const saved = await loadCacheFile();
      if (saved) {
        client.getTokenCache().deserialize(saved.cache);
        homeAccountId = saved.homeAccountId;
      }
    })();
  }
  return initPromise;
}

async function persist() {
  await saveCacheFile({
    cache: client.getTokenCache().serialize(),
    homeAccountId,
  });
}

export async function isConnected() {
  await ensureInit();
  return Boolean(homeAccountId);
}

// Lets Claude pull the current token cache off a running instance and
// push it to Render as a Secret File, so it survives the next deploy -
// same pattern as the passkey (see passkeyAuth.js's exportStore()).
export async function exportTokenCache() {
  await ensureInit();
  return { cache: client.getTokenCache().serialize(), homeAccountId };
}

export async function getAuthUrl() {
  if (!isConfigured()) throw new Error('Outlook isn\'t configured yet - missing MS_GRAPH_* env vars.');
  await ensureInit();
  return client.getAuthCodeUrl({ scopes: SCOPES, redirectUri: REDIRECT_URI });
}

export async function handleCallback(code) {
  await ensureInit();
  const result = await client.acquireTokenByCode({ scopes: SCOPES, redirectUri: REDIRECT_URI, code });
  homeAccountId = result.account.homeAccountId;
  await persist();
}

export async function disconnect() {
  await ensureInit();
  homeAccountId = undefined;
  await saveCacheFile({ cache: client.getTokenCache().serialize(), homeAccountId: undefined });
}

// Returns a valid access token, silently refreshing via the cached
// refresh token if needed. Throws if Outlook was never connected.
export async function getAccessToken() {
  if (!isConfigured()) throw new Error('Outlook isn\'t configured yet - missing MS_GRAPH_* env vars.');
  await ensureInit();
  if (!homeAccountId) throw new Error('Outlook isn\'t connected yet - visit /api/work/auth/outlook/login while logged in.');
  const account = await client.getTokenCache().getAccountByHomeId(homeAccountId);
  if (!account) throw new Error('Outlook connection was lost - reconnect via /api/work/auth/outlook/login.');
  const result = await client.acquireTokenSilent({ account, scopes: SCOPES });
  await persist();
  return result.accessToken;
}
