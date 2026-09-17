// Robinhood Agentic Trading MCP client.
// This file is the ONLY place that should ever hold Robinhood credentials
// or call Robinhood's MCP. Do not import this from work.js or any
// non-financial route - that's what keeps the tabs isolated.
//
// Robinhood's Agentic Trading connects to a Claude (or other AI platform)
// account directly, not to an arbitrary backend - there's no generic
// MCP URL/token Robinhood hands out for a custom Node client to call.
// So this server has no live connection of its own. Real portfolio/position
// reads instead come from data/robinhood-snapshot.json, a point-in-time
// pull done by asking Claude (which already has that account connected)
// to fetch fresh data and rewrite the snapshot file. Re-run that whenever
// the numbers look stale - see README "Connecting Robinhood".
//
// Trade execution stays simulated regardless (see executeTrades below) -
// that's a hard rule, not a TODO: placing a real trade always has to be a
// human action taken directly in the Robinhood app, never something an AI
// executes on the user's behalf, however it's wired up.

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLiveDataForTickers } from './publicMarketData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// Render's Secret Files can't hold a nested path (no "/" allowed in the
// filename), so they land flat at /etc/secrets/<filename> instead of
// data/<filename>. Try that first, then fall back to the local data/
// directory for local dev, where the file has a normal relative path.
function candidatePaths(filename) {
  return [path.join('/etc/secrets', filename), path.join(DATA_DIR, filename)];
}

const SHADOW_MODE = process.env.SHADOW_MODE === 'true';
const READ_LIVE = process.env.ROBINHOOD_READ_LIVE === 'true';

async function loadJsonSnapshot(filename) {
  for (const filePath of candidatePaths(filename)) {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return null;
}

const loadSnapshot = () => loadJsonSnapshot('robinhood-snapshot.json');
const loadMarketSnapshot = () => loadJsonSnapshot('market-snapshot.json');
const loadFundamentalsSnapshot = () => loadJsonSnapshot('fundamentals-snapshot.json');

async function getHoldingsTickers() {
  const snapshot = await loadSnapshot();
  return snapshot?.positions?.map((p) => p.symbol) || [];
}

function liveEntryToFundamentals(d) {
  return {
    marketCap: d.marketCap,
    peRatio: d.peRatio,
    pbRatio: d.pbRatio,
    dividendYield: d.dividendYield,
    high52w: d.high52w,
    low52w: d.low52w,
    sector: d.sector,
    description: d.companyName,
  };
}

// Fixed-list research data (tier tickers + your holdings). When
// FINNHUB_API_KEY is configured, this is fetched live on every call - no
// manual refresh needed, since it's market data, not your private
// account data. Falls back to the manual data/fundamentals-snapshot.json
// if Finnhub isn't configured or the live fetch comes back empty. For an
// arbitrary user-searched ticker, see lib/publicMarketData.js instead.
export async function getFundamentals(ticker) {
  const snapshot = await loadFundamentalsSnapshot();
  if (!snapshot) return null;
  const entry = snapshot.fundamentals[ticker?.toUpperCase()];
  if (!entry) return null;
  return { ticker: ticker.toUpperCase(), generatedAt: snapshot.generatedAt, ...entry };
}

export async function getAllFundamentals() {
  if (READ_LIVE) {
    const holdingsTickers = await getHoldingsTickers();
    const allTickers = [...new Set([...TIER_TICKERS, ...holdingsTickers])];
    const live = await getLiveDataForTickers(allTickers);
    if (Object.keys(live).length > 0) {
      const fundamentals = {};
      for (const [t, d] of Object.entries(live)) fundamentals[t] = liveEntryToFundamentals(d);
      return { generatedAt: new Date().toISOString(), live: true, fundamentals };
    }
  }
  const snapshot = await loadFundamentalsSnapshot();
  if (!snapshot) return { generatedAt: null, fundamentals: {} };
  return snapshot;
}

// These are illustrative example baskets, not personalized recommendations -
// Claude can't give investment advice, so it never picks or swaps tickers
// here based on your situation. When ROBINHOOD_READ_LIVE is on, each pick
// gets a real current quote merged in (see getRiskTiers) so the numbers are
// factual, but the picks themselves stay fixed and are for you to evaluate
// and act on (or not) yourself.
const RISK_TIERS = [
  {
    id: 'low',
    name: 'Low risk',
    allocationPct: 35,
    description: 'Capital preservation leaning. Broad, liquid, lower-volatility names. Modest realistic upside, minimal drawdown risk.',
    picks: [
      { ticker: 'VTI', why: 'Broad market anchor', weightPct: 40 },
      { ticker: 'JNJ', why: 'Low-volatility defensive', weightPct: 30 },
      { ticker: 'KO', why: 'Stable dividend payer', weightPct: 30 },
    ],
  },
  {
    id: 'medium',
    name: 'Medium risk',
    allocationPct: 45,
    description: 'Balanced growth. Mix of established growth names and sector exposure with room to move both directions.',
    picks: [
      { ticker: 'MSFT', why: 'AI infra relative strength', weightPct: 35 },
      { ticker: 'AVGO', why: 'Semis, elevated but liquid', weightPct: 30 },
      { ticker: 'QQQ', why: 'Growth basket, diversified', weightPct: 35 },
    ],
  },
  {
    id: 'high',
    name: 'High risk',
    allocationPct: 20,
    description: 'Aggressive. Higher expected swings in both directions — sized smaller on purpose. Real downside exposure, not just upside.',
    picks: [
      { ticker: 'SMCI', why: 'High-vol earnings play', weightPct: 30 },
      { ticker: 'COIN', why: 'Crypto-adjacent momentum', weightPct: 35 },
      { ticker: 'Short-dated call, single-name', why: 'Earnings-week vol setup', weightPct: 35 },
    ],
  },
];

// Real tickers only - excludes the "Short-dated call, single-name"
// placeholder entry, which isn't an actual symbol to look up.
const TIER_TICKERS = [...new Set(RISK_TIERS.flatMap((t) => t.picks.map((p) => p.ticker)))].filter((t) =>
  /^[A-Z.]{1,6}$/.test(t)
);

export async function getPortfolio() {
  if (READ_LIVE) {
    const snapshot = await loadSnapshot();
    if (snapshot) {
      const { positions, ...portfolio } = snapshot;
      return { ...portfolio, shadow: false, live: false };
    }
  }
  if (SHADOW_MODE) {
    return {
      shadow: true,
      balance: 3000.0,
      todayChange: 42.1,
      todayChangePct: 1.4,
      buddyManaged: 3000.0,
      selfManaged: 3000.0,
      fundingRulePct: 50,
      note: 'Shadow mode - sample data. Set ROBINHOOD_READ_LIVE=true and add data/robinhood-snapshot.json for real numbers.',
    };
  }
  throw new Error('No portfolio data available: ROBINHOOD_READ_LIVE is off and SHADOW_MODE is off.');
}

function quoteLine(ticker, q) {
  const up = q.todayChangePct >= 0;
  return `${ticker}: $${q.price.toFixed(2)} (${up ? '+' : ''}${q.todayChangePct.toFixed(2)}% today)`;
}

const REAL_QUOTES_OPINION =
  "This is factual market data, not a recommendation - Buddy doesn't have a take on which posture is favorable this week. Review the numbers and decide your own posture; log anything you actually trade in Robinhood via the holdings tool so these numbers stay accurate.";

export async function getMarketReport() {
  if (READ_LIVE) {
    const live = await getLiveDataForTickers(TIER_TICKERS);
    if (Object.keys(live).length > 0) {
      return {
        shadow: false,
        generatedAt: new Date().toISOString(),
        blocks: [
          {
            title: 'Live quotes (risk-tier picks)',
            items: TIER_TICKERS.filter((t) => live[t]).map((t) => quoteLine(t, live[t])),
          },
        ],
        opinion: REAL_QUOTES_OPINION,
        note: 'Live prices, fetched fresh on every load - no refresh needed.',
      };
    }
    const market = await loadMarketSnapshot();
    if (market) {
      return {
        shadow: false,
        generatedAt: market.generatedAt,
        blocks: [
          {
            title: 'Real quotes (risk-tier picks)',
            items: Object.entries(market.quotes).map(([t, q]) => quoteLine(t, q)),
          },
        ],
        opinion: REAL_QUOTES_OPINION,
        note: 'Real quotes as of the snapshot time above - not live-updating. Ask Claude to refresh data/market-snapshot.json for current prices.',
      };
    }
  }
  if (SHADOW_MODE) {
    return {
      shadow: true,
      generatedAt: new Date().toISOString(),
      blocks: [
        {
          title: 'Macro scan',
          items: [
            'Dollar index softened slightly this week — tends to favor multinational exporters over pure domestic plays.',
            'Semiconductor export policy chatter continues; sector volatility elevated into next week.',
          ],
        },
        {
          title: 'Headline sweep',
          items: [
            'Two names on your watchlist mentioned in earnings-preview coverage this week.',
            'No material negative coverage flagged on current holdings.',
          ],
        },
        {
          title: 'IPO / options screen',
          items: [
            'One mid-cap IPO priced this week, still inside lockup-risk window — watching, not suggesting yet.',
            'Elevated implied volatility on a handful of large-caps ahead of earnings — flagged in High tier.',
          ],
        },
        {
          title: 'Crypto & AI watch',
          items: [
            'AI infrastructure names showing renewed relative strength vs. broader market this week.',
          ],
        },
      ],
      opinion: 'Conditions this week lean slightly favorable for the medium-risk posture — relative calm in your current holdings\' sector, and no red flags in the headline sweep. Still your call either way.',
      note: 'Shadow mode - replace with a real news/MCP feed.',
    };
  }
  // TODO: real news/MCP call to build the weekly report
  throw new Error('Live market report feed not yet implemented.');
}

function mergeTierQuotes(quotes, note) {
  const tiers = RISK_TIERS.map((tier) => ({
    ...tier,
    picks: tier.picks.map((pick) => {
      const q = quotes[pick.ticker];
      return q ? { ...pick, currentPrice: q.price, todayChangePct: q.todayChangePct } : pick;
    }),
  }));
  return { shadow: false, tiers, note };
}

export async function getRiskTiers() {
  if (READ_LIVE) {
    const live = await getLiveDataForTickers(TIER_TICKERS);
    if (Object.keys(live).length > 0) {
      return mergeTierQuotes(
        live,
        "Picks are illustrative examples with live current prices, not personalized recommendations - Buddy doesn't pick investments for you."
      );
    }
    const market = await loadMarketSnapshot();
    if (market) {
      return mergeTierQuotes(
        market.quotes,
        "Picks are illustrative examples with real current prices, not personalized recommendations - Buddy doesn't pick investments for you."
      );
    }
  }
  return { shadow: SHADOW_MODE, tiers: RISK_TIERS };
}

export async function stageTrades(riskTier, picks) {
  // Staging never executes anything by itself - it just returns the
  // trades that WOULD be sent, for the frontend to show in the confirm
  // modal. Actual execution only happens in executeTrades(), and only
  // after the user has explicitly confirmed.
  return {
    riskTier,
    picks,
    staged: true,
    shadow: SHADOW_MODE,
  };
}

export async function executeTrades(confirmedTrades) {
  if (process.env.REQUIRE_MANUAL_CONFIRMATION !== 'false' && !confirmedTrades?.userConfirmed) {
    throw new Error('Refusing to execute: user confirmation flag missing.');
  }
  if (SHADOW_MODE) {
    return { executed: false, shadow: true, wouldHaveTraded: confirmedTrades };
  }
  // TODO: real MCP call to place the confirmed trades
  throw new Error('Live Robinhood trade execution not yet implemented.');
}
