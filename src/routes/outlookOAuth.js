// Outlook OAuth connect/disconnect. Separate from routes/auth.js (which
// is about YOU logging into Buddy) - this is about Buddy connecting to
// your Outlook account. Mounted at /api/auth/outlook to match the
// redirect URI registered in Azure.

import { Router } from 'express';
import { getAuthUrl, handleCallback, isConnected, isConfigured, disconnect, exportTokenCache } from '../lib/msGraphAuth.js';
import { requireAuth } from './auth.js';

const router = Router();

router.get('/status', async (req, res) => {
  res.json({ configured: isConfigured(), connected: isConfigured() ? await isConnected() : false });
});

// Only the already-logged-in owner can start connecting an Outlook
// account - otherwise anyone who found the login page could link theirs.
router.get('/login', requireAuth, async (req, res) => {
  try {
    const url = await getAuthUrl();
    res.redirect(url);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Microsoft redirects back here after consent - must stay reachable
// without our own session necessarily being re-checked mid-flow.
router.get('/callback', async (req, res) => {
  try {
    const { code, error, error_description: errorDescription } = req.query;
    if (error) return res.status(400).send(`Outlook connection failed: ${errorDescription || error}`);
    if (!code) return res.status(400).send('Missing authorization code.');
    await handleCallback(code);
    res.redirect('/?outlook=connected');
  } catch (err) {
    res.status(500).send(`Outlook connection failed: ${err.message}`);
  }
});

router.post('/disconnect', requireAuth, async (req, res) => {
  await disconnect();
  res.json({ ok: true });
});

router.get('/export', requireAuth, async (req, res) => {
  try {
    res.json(await exportTokenCache());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
