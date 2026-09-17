// Face ID / Touch ID login via WebAuthn passkeys.
//
// Registered credentials are stored in data/webauthn-credentials.json,
// written locally (Render's disk is ephemeral, so a credential registered
// live on the deployed site only survives until the next deploy/restart
// unless it's also pushed to Render as a Secret File - see
// scripts/push-to-render.mjs and README "Face ID login").
//
// A passkey is bound to the exact origin/RP ID it was registered on, so
// this can't be tested end-to-end on localhost and then used in
// production - registration has to happen for real, on the real deployed
// domain (RP_ID/RP_ORIGIN below).

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CRED_FILENAME = 'webauthn-credentials.json';

export const RP_NAME = 'Buddy';
export const RP_ID = process.env.RP_ID || 'localhost';
export const RP_ORIGIN = process.env.RP_ORIGIN || 'http://localhost:3000';

function candidatePaths(filename) {
  return [path.join('/etc/secrets', filename), path.join(DATA_DIR, filename)];
}

async function loadStore() {
  for (const filePath of candidatePaths(CRED_FILENAME)) {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return { userID: null, credentials: [] };
}

async function saveStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, CRED_FILENAME), JSON.stringify(store, null, 2));
}

function toStoredCredential(cred) {
  return {
    id: cred.id,
    publicKey: Buffer.from(cred.publicKey).toString('base64'),
    counter: cred.counter,
    transports: cred.transports || [],
  };
}

function fromStoredCredential(stored) {
  return {
    id: stored.id,
    publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64')),
    counter: stored.counter,
    transports: stored.transports,
  };
}

export async function hasPasskey() {
  const store = await loadStore();
  return store.credentials.length > 0;
}

// Exports the raw store so it can be pushed to Render as a Secret File
// (see scripts/push-to-render.mjs) - otherwise a passkey registered live
// on the deployed instance only lives on that container's ephemeral disk
// and is lost on the next deploy.
export async function exportStore() {
  return loadStore();
}

export async function getRegistrationOptions() {
  const store = await loadStore();
  const userIDBytes = store.userID
    ? new Uint8Array(Buffer.from(store.userID, 'base64'))
    : new Uint8Array(Buffer.from(crypto.randomUUID().replace(/-/g, ''), 'hex'));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: 'buddy',
    userID: userIDBytes,
    userDisplayName: 'Buddy',
    attestationType: 'none',
    excludeCredentials: store.credentials.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
      authenticatorAttachment: 'platform',
    },
  });

  store.userID = Buffer.from(userIDBytes).toString('base64');
  await saveStore(store);
  return options;
}

export async function verifyRegistration(response, expectedChallenge) {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: RP_ORIGIN,
    expectedRPID: RP_ID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey registration could not be verified.');
  }
  const store = await loadStore();
  store.credentials.push(toStoredCredential(verification.registrationInfo.credential));
  await saveStore(store);
  return true;
}

export async function getAuthenticationOptions() {
  const store = await loadStore();
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    allowCredentials: store.credentials.map((c) => ({ id: c.id, transports: c.transports })),
  });
  return options;
}

export async function verifyAuthentication(response, expectedChallenge) {
  const store = await loadStore();
  const stored = store.credentials.find((c) => c.id === response.id);
  if (!stored) throw new Error('Unrecognized passkey.');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: RP_ORIGIN,
    expectedRPID: RP_ID,
    credential: fromStoredCredential(stored),
  });
  if (!verification.verified) {
    throw new Error('Passkey sign-in could not be verified.');
  }
  stored.counter = verification.authenticationInfo.newCounter;
  await saveStore(store);
  return true;
}
