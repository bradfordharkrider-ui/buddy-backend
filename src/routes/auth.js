// Login: password (fallback) + Face ID / Touch ID (WebAuthn passkey).
// Session is a simple signed cookie, not server-side session state - so
// it survives Render restarting the container (free tier does this
// often), unlike an in-memory session store would.

import { Router } from 'express';
import {
  hasPasskey,
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  exportStore,
} from '../lib/passkeyAuth.js';

const router = Router();

const SESSION_COOKIE = 'buddy_session';
const CHALLENGE_COOKIE = 'buddy_challenge';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

function setSessionCookie(req, res) {
  res.cookie(SESSION_COOKIE, '1', {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: THIRTY_DAYS_MS,
  });
}

function setChallengeCookie(req, res, challenge) {
  res.cookie(CHALLENGE_COOKIE, challenge, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: FIVE_MIN_MS,
  });
}

export function requireAuth(req, res, next) {
  if (req.signedCookies?.[SESSION_COOKIE] === '1') return next();
  res.status(401).json({ error: 'Not authenticated.' });
}

router.get('/status', async (req, res) => {
  res.json({
    authenticated: req.signedCookies?.[SESSION_COOKIE] === '1',
    hasPasskey: await hasPasskey(),
  });
});

router.post('/login/password', (req, res) => {
  const { username, password } = req.body || {};
  const APP_USERNAME = process.env.APP_USERNAME;
  const APP_PASSWORD = process.env.APP_PASSWORD;
  if (username === APP_USERNAME && password === APP_PASSWORD) {
    setSessionCookie(req, res);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Incorrect username or password.' });
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

// Registering a NEW passkey requires already being logged in (otherwise
// anyone who found the login page could register their own Face ID).
router.get('/passkey/register/options', requireAuth, async (req, res) => {
  try {
    const options = await getRegistrationOptions();
    setChallengeCookie(req, res, options.challenge);
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/passkey/register/verify', requireAuth, async (req, res) => {
  try {
    const expectedChallenge = req.signedCookies?.[CHALLENGE_COOKIE];
    if (!expectedChallenge) return res.status(400).json({ error: 'Registration expired - try again.' });
    await verifyRegistration(req.body, expectedChallenge);
    res.clearCookie(CHALLENGE_COOKIE);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Signing IN with a passkey is how you get a session in the first place,
// so this (and its /verify) must stay public.
router.get('/passkey/login/options', async (req, res) => {
  try {
    const options = await getAuthenticationOptions();
    setChallengeCookie(req, res, options.challenge);
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/passkey/login/verify', async (req, res) => {
  try {
    const expectedChallenge = req.signedCookies?.[CHALLENGE_COOKIE];
    if (!expectedChallenge) return res.status(400).json({ error: 'Sign-in expired - try again.' });
    await verifyAuthentication(req.body, expectedChallenge);
    res.clearCookie(CHALLENGE_COOKIE);
    setSessionCookie(req, res);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Lets Claude pull the currently-registered passkey off a running
// instance to persist it as a Render Secret File - see
// scripts/push-to-render.mjs and passkeyAuth.js's exportStore().
router.get('/passkey/export', requireAuth, async (req, res) => {
  try {
    res.json(await exportStore());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
