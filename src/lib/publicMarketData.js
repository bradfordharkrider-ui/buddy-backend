// Live search for arbitrary tickers, independent of Robinhood/Claude.
//
// The fixed research list (tier tickers + your holdings, see
// getFundamentals/getAllFundamentals in robinhoodClient.js) is fine with
// the manual-snapshot model, since it's a known small set. A search box
// needs real-time data for whatever ticker the user types, and there's no
// live path through Robinhood for that (same limitation as everywhere
// else in this app - only Claude has that connection, not this server).
// So this calls Finnhub's free API directly instead. Get a free key at
// finnhub.io and set FINNHUB_API_KEY in .env / your host's env vars.

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const BASE = 'https://finnhub.io/api/v1';

export function isSearchConfigured() {
  return Boolean(FINNHUB_API_KEY);
}

async function finnhubGet(path, params) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('token', FINNHUB_API_KEY);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub ${path} failed: ${res.status}`);
  return res.json();
}

async function fetchTickerData(rawTicker) {
  const ticker = rawTicker.trim().toUpperCase();
  const [quote, profile, metric] = await Promise.all([
    finnhubGet('/quote', { symbol: ticker }),
    finnhubGet('/stock/profile2', { symbol: ticker }),
    finnhubGet('/stock/metric', { symbol: ticker, metric: 'all' }),
  ]);

  if (!quote || quote.c === 0) {
    throw new Error(`No data found for "${ticker}" - check the ticker symbol.`);
  }

  const m = metric?.metric || {};
  return {
    ticker,
    companyName: profile?.name || null,
    price: quote.c,
    todayChangePct: quote.dp,
    marketCap: profile?.marketCapitalization ? profile.marketCapitalization * 1_000_000 : null,
    peRatio: m.peBasicExclExtraTTM ?? m.peNormalizedAnnual ?? null,
    pbRatio: m.pbAnnual ?? null,
    dividendYield: m.dividendYieldIndicatedAnnual ?? null,
    high52w: m['52WeekHigh'] ?? null,
    low52w: m['52WeekLow'] ?? null,
    sector: profile?.finnhubIndustry || null,
    exchange: profile?.exchange || null,
    live: true,
    retrievedAt: new Date().toISOString(),
  };
}

export async function searchTicker(rawTicker) {
  if (!isSearchConfigured()) {
    throw new Error('Search isn\'t configured yet - set FINNHUB_API_KEY (get a free key at finnhub.io).');
  }
  return fetchTickerData(rawTicker);
}

// Cached live lookups for the fixed ticker set (tier picks + holdings) -
// short TTL just to avoid refetching on every rapid tab switch, not to
// hold data back from being current.
const CACHE_TTL_MS = 60_000;
const cache = new Map(); // ticker -> { data, expiresAt }

async function getCached(ticker) {
  const key = ticker.toUpperCase();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const data = await fetchTickerData(key);
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

// Fetches live data for many tickers in parallel. Never throws - a
// ticker that fails (rate limit, bad symbol, network hiccup) is just
// left out of the result rather than breaking the whole page.
export async function getLiveDataForTickers(tickers) {
  if (!isSearchConfigured()) return {};
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const results = await Promise.allSettled(unique.map((t) => getCached(t)));
  const out = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') out[unique[i]] = result.value;
  });
  return out;
}
