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
// Trades are never placed from this app - that's a hard rule, not a TODO:
// placing a real trade always has to be a human action taken directly in
// the Robinhood app, never something an AI executes on the user's behalf,
// however it's wired up. Log anything you traded yourself via
// POST /api/financial/holdings/trade (see holdingsLedger.js).

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
const loadResearchSnapshot = () => loadJsonSnapshot('research-snapshot.json');
const loadCandidatesSnapshot = () => loadJsonSnapshot('candidates-snapshot.json');
const loadFundamentalsSnapshot = () => loadJsonSnapshot('fundamentals-snapshot.json');

async function getHoldingsTickers() {
  const snapshot = await loadSnapshot();
  return snapshot?.positions?.map((p) => p.symbol) || [];
}

async function getCandidateTickers() {
  const snapshot = await loadCandidatesSnapshot();
  if (!snapshot) return [];
  return snapshot.tiers.flatMap((t) => t.candidates.map((c) => c.ticker));
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

// Research data for your holdings + this week's candidate tickers (see
// getWeeklyCandidates below) - a watchlist that changes with the actual
// weekly research instead of a fixed list. When FINNHUB_API_KEY is
// configured, this is fetched live on every call - no manual refresh
// needed, since it's public market data, not your private account data.
// Falls back to the manual data/fundamentals-snapshot.json if Finnhub
// isn't configured or the live fetch comes back empty. For an arbitrary
// user-searched ticker, see lib/publicMarketData.js instead.
export async function getFundamentals(ticker) {
  const snapshot = await loadFundamentalsSnapshot();
  if (!snapshot) return null;
  const entry = snapshot.fundamentals[ticker?.toUpperCase()];
  if (!entry) return null;
  return { ticker: ticker.toUpperCase(), generatedAt: snapshot.generatedAt, ...entry };
}

export async function getAllFundamentals() {
  if (READ_LIVE) {
    const [holdingsTickers, candidateTickers] = await Promise.all([getHoldingsTickers(), getCandidateTickers()]);
    const allTickers = [...new Set([...candidateTickers, ...holdingsTickers])];
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
    const research = await loadResearchSnapshot();
    if (research) {
      return {
        shadow: false,
        generatedAt: research.generatedAt,
        blocks: research.blocks,
        opinion: REAL_QUOTES_OPINION,
        note: 'Real research (macro, earnings calendar, sector signals, IPO watch) pulled weekly - ask Claude to refresh data/research-snapshot.json for the latest.',
      };
    }
    const market = await loadMarketSnapshot();
    if (market) {
      return {
        shadow: false,
        generatedAt: market.generatedAt,
        blocks: [
          {
            title: 'Quotes',
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

// Weekly research candidates: an unweighted, unranked slate per risk tier,
// surfaced only because something objectively happened this week (an
// earnings beat, a sector-wide move, an options/volatility screen hit) -
// never because Claude judged one company better than another. No
// weighting or dollar amounts - allocation is entirely the user's call.
// Refreshed weekly (see the scheduled routine, or ask Claude to refresh
// data/candidates-snapshot.json directly).
export async function getWeeklyCandidates() {
  const snapshot = await loadCandidatesSnapshot();
  if (!snapshot) return { tiers: [] };
  if (READ_LIVE) {
    const allTickers = snapshot.tiers.flatMap((t) => t.candidates.map((c) => c.ticker));
    const live = await getLiveDataForTickers(allTickers);
    if (Object.keys(live).length > 0) {
      return {
        ...snapshot,
        tiers: snapshot.tiers.map((tier) => ({
          ...tier,
          candidates: tier.candidates.map((c) => {
            const q = live[c.ticker];
            return q ? { ...c, currentPrice: q.price, todayChangePct: q.todayChangePct } : c;
          }),
        })),
      };
    }
  }
  return snapshot;
}
