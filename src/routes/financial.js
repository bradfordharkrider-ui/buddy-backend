import { Router } from 'express';
import { getPortfolio, getMarketReport, getRiskTiers, getWeeklyCandidates, stageTrades, executeTrades, getAllFundamentals } from '../lib/robinhoodClient.js';
import { recordTrade, getHoldings, getTradeHistory } from '../lib/holdingsLedger.js';
import { searchTicker, isSearchConfigured } from '../lib/publicMarketData.js';

const router = Router();

// GET /api/financial/research - real fundamentals for the fixed set of
// tier-tickers + your holdings (manually-refreshed, same as portfolio/report).
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

// GET /api/financial/tiers - risk tier definitions and Buddy's picks.
// Each pick's allocationPct/weightPct is also converted into a real
// dollar amount against your actual Buddy-managed (Agentic account)
// balance, so "35%" also reads as "$1,770.59".
router.get('/tiers', async (req, res) => {
  try {
    const data = await getRiskTiers();
    const portfolio = await getPortfolio();
    const baseAmount = portfolio.buddyManaged;
    if (baseAmount > 0) {
      data.basedOn = { amount: baseAmount, source: portfolio.shadow ? 'shadow sample balance' : 'your Buddy-managed balance' };
      data.tiers = data.tiers.map((tier) => {
        const tierAmount = baseAmount * (tier.allocationPct / 100);
        return {
          ...tier,
          tierAmount: Number(tierAmount.toFixed(2)),
          picks: tier.picks.map((pick) => ({
            ...pick,
            suggestedAmount: Number((tierAmount * (pick.weightPct / 100)).toFixed(2)),
          })),
        };
      });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial/candidates - unranked, unweighted research candidates
// per risk tier, surfaced from real events that happened this week (earnings,
// sector moves, options/IV screens). Not a recommendation and not part of
// RISK_TIERS' allocation math - see lib/robinhoodClient.js getWeeklyCandidates
// for why these are kept separate.
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

// POST /api/financial/stage  { riskTier, picks }
// Returns what WOULD be traded - does not execute anything.
router.post('/stage', async (req, res) => {
  try {
    const { riskTier, picks } = req.body;
    const staged = await stageTrades(riskTier, picks);
    res.json(staged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/financial/confirm  { riskTier, picks, userConfirmed: true }
// Only route that can actually place trades, and only with explicit
// userConfirmed: true from the frontend's confirm modal.
router.post('/confirm', async (req, res) => {
  try {
    const result = await executeTrades(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
