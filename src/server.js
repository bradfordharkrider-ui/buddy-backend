import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import financialRoutes from './routes/financial.js';
import workRoutes from './routes/work.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
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
