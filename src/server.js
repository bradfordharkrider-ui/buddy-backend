import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import financialRoutes from './routes/financial.js';
import workRoutes from './routes/work.js';
import authRoutes, { requireAuth } from './routes/auth.js';
import outlookOAuthRoutes from './routes/outlookOAuth.js';
import googleOAuthRoutes from './routes/googleOAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Render terminates TLS at a proxy in front of this app - without this,
// req.secure is always false, which breaks the `secure` cookie flag.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-in-production';
app.use(cookieParser(SESSION_SECRET));

// ── Auth ────────────────────────────────────────────────────────
// Local/LAN use was implicitly protected by needing to be on the same
// network. Once deployed publicly, anyone with the link could otherwise
// see real portfolio/email data. Login is password (fallback) or a Face
// ID / Touch ID passkey (see routes/auth.js); a signed cookie carries the
// session afterward. If APP_USERNAME/APP_PASSWORD are unset (local dev),
// auth is skipped entirely, same as before.
const AUTH_REQUIRED = Boolean(process.env.APP_USERNAME && process.env.APP_PASSWORD);

app.use('/api/auth', authRoutes);
app.use('/api/auth/outlook', outlookOAuthRoutes);
app.use('/api/auth/google', googleOAuthRoutes);

if (AUTH_REQUIRED) {
  app.use('/api/financial', requireAuth);
  app.use('/api/work', requireAuth);
  app.use('/api/health', requireAuth);
}

app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Credential isolation ──────────────────────────────────────
// Each tab's router only ever touches its own client (see src/lib/).
// Nothing in financial.js imports from lib/outlookClient.js, and
// nothing in work.js imports from lib/robinhoodClient.js. Keep it that
// way - that's the whole point of the tab-isolation design.
app.use('/api/financial', financialRoutes);
app.use('/api/work', workRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    shadowMode: process.env.SHADOW_MODE === 'true',
    manualConfirmationRequired: process.env.REQUIRE_MANUAL_CONFIRMATION !== 'false',
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Buddy backend running on http://localhost:${port}`);
  console.log(`Shadow mode: ${process.env.SHADOW_MODE === 'true' ? 'ON (no real actions will execute)' : 'OFF - real actions can execute'}`);
  console.log(`Auth required: ${AUTH_REQUIRED}`);
});
