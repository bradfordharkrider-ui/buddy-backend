import { Router } from 'express';
import { getPortfolio, getMarketReport, getWeeklyCandidates, getAllFundamentals } from '../lib/robinhoodClient.js';
import { recordTrade, getHoldings, getTradeHistory } from '../lib/holdingsLedger.js';
import { searchTicker, isSearchConfigured } from '../lib/publicMarketData.js';

const router = Router();

// GET /api/financial/research - real fundamentals for your holdings + this
// week's candidate tickers (manually-refreshed, same as portfolio/report).
router.get('/research', async (req, res) => {
  try {
    const data = await getAllFundamentals();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/research/search?ticker=AAPL - live lookup for any
// ticker via a free public API (independent of Robinhood/Claude).
router.get('/research/search', async (req, res) => {
  try {
    const { ticker } = req.query;
    if (!ticker) return res.status(400).json({ error: 'ticker query param is required.' });
    if (!isSearchConfigured()) {
      return res.status(503).json({ error: 'Search isn\'t configured yet - see README "Live ticker search".', configured: false });
    }
    const data = await searchTicker(ticker);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/financial/portfolio - current account snapshot
router.get('/portfolio', async (req, res) => {
  try {
    const data = await getPortfolio();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/report - weekly macro/headline/IPO/crypto scan + Buddy's take
router.get('/report', async (req, res) => {
  try {
    const data = await getMarketReport();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/candidates - unranked, unweighted research candidates
// per risk tier, surfaced from real events that happened this week (earnings,
// sector moves, options/IV screens). Not a recommendation - see
// lib/robinhoodClient.js getWeeklyCandidates for the selection rule.
router.get('/candidates', async (req, res) => {
  try {
    const data = await getWeeklyCandidates();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/holdings - your real, manually-logged positions and
// total invested (cost basis - no live pricing).
router.get('/holdings', async (req, res) => {
  try {
    const data = await getHoldings();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/holdings/history - full log of trades you've entered.
router.get('/holdings/history', async (req, res) => {
  try {
    const data = await getTradeHistory();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/financial/holdings/trade  { ticker, action, quantity, price, date?, note? }
// Records a trade YOU already placed yourself in the real Robinhood app.
// This never places a trade - it only logs one you're reporting back.
router.post('/holdings/trade', async (req, res) => {
  try {
    const result = await recordTrade(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
