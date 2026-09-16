import 'dotenv/config';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import financialRoutes from './routes/financial.js';
import workRoutes from './routes/work.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// ── Password gate ──────────────────────────────────────────────
// Local/LAN use was implicitly protected by needing to be on the same
// network. Once this is deployed to a public URL, anyone with the link
// could otherwise see real portfolio/email data. If APP_USERNAME and
// APP_PASSWORD are set, require HTTP Basic Auth on every request; if
// unset (e.g. local dev), skip it as before.
const APP_USERNAME = process.env.APP_USERNAME;
const APP_PASSWORD = process.env.APP_PASSWORD;
if (APP_USERNAME && APP_PASSWORD) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const [user = '', pass = ''] = Buffer.from(encoded, 'base64').toString().split(':');
      const userOk = user.length === APP_USERNAME.length && crypto.timingSafeEqual(Buffer.from(user), Buffer.from(APP_USERNAME));
      const passOk = pass.length === APP_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(APP_PASSWORD));
      if (userOk && passOk) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Buddy"');
    res.status(401).send('Authentication required.');
  });
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
});
