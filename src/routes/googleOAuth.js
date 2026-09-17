// Google OAuth connect/disconnect for Gmail + Calendar. Mirrors
// routes/outlookOAuth.js. Mounted at /api/auth/google to match the
// redirect URI registered in Google Cloud Console.

import { Router } from 'express';
import { getAuthUrl, handleCallback, isConnected, isConfigured, disconnect, exportTokens } from '../lib/googleAuth.js';
import { requireAuth } from './auth.js';

const router = Router();

router.get('/status', async (req, res) => {
  res.json({ configured: isConfigured(), connected: isConfigured() ? await isConnected() : false });
});

router.get('/login', requireAuth, async (req, res) => {
  try {
    const url = await getAuthUrl();
    res.redirect(url);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) return res.status(400).send(`Google connection failed: ${error}`);
    if (!code) return res.status(400).send('Missing authorization code.');
    await handleCallback(code);
    res.redirect('/?google=connected');
  } catch (err) {
    res.status(500).send(`Google connection failed: ${err.message}`);
  }
});

router.post('/disconnect', requireAuth, async (req, res) => {
  await disconnect();
  res.json({ ok: true });
});

router.get('/export', requireAuth, async (req, res) => {
  try {
    res.json(await exportTokens());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
