// Robinhood Agentic Trading MCP client.
// This file is the ONLY place that should ever hold Robinhood credentials
// or call Robinhood's MCP. Do not import this from work.js or any
// non-financial route - that's what keeps the tabs isolated.
//
// Setup: Robinhood's Trading MCP lives at ROBINHOOD_MCP_URL and expects
// your dedicated Agentic sub-account to already be connected on
// Robinhood's side (done through their app, not through this code).
// See README "Connecting Robinhood" for the account setup steps.
//
// TODO: replace these stubs with real MCP calls once your Agentic
// account is connected. Keep SHADOW_MODE=true until you've verified
// getPortfolio() returns real data correctly.

const SHADOW_MODE = process.env.SHADOW_MODE === 'true';

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

export async function getPortfolio() {
  if (SHADOW_MODE) {
    return {
      shadow: true,
      balance: 3000.0,
      todayChange: 42.1,
      todayChangePct: 1.4,
      buddyManaged: 3000.0,
      selfManaged: 3000.0,
      fundingRulePct: 50,
      note: 'Shadow mode - replace with a real MCP call to ROBINHOOD_MCP_URL',
    };
  }
  // TODO: real MCP call to fetch account/portfolio data
  throw new Error('Live Robinhood connection not yet implemented.');
}

export async function getMarketReport() {
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

export async function getRiskTiers() {
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
