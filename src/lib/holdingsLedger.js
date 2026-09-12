// Manual holdings ledger for the Financial tab.
//
// This is NOT a Robinhood API client - it never talks to Robinhood or any
// external service. It's just a local record of trades you tell Buddy you
// actually made (by hand, in the real Robinhood app), so the rest of the
// Financial tab has real numbers to work with instead of shadow-mode
// placeholders. You are always the one who places the trade; this file
// only stores what you report back afterward.

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LEDGER_PATH = path.join(DATA_DIR, 'holdings.json');

async function loadLedger() {
  try {
    const raw = await readFile(LEDGER_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return { trades: [], positions: {} };
    throw err;
  }
}

async function saveLedger(ledger) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

function applyTrade(positions, { ticker, action, quantity, price }) {
  const existing = positions[ticker] || { quantity: 0, costBasis: 0 };
  if (action === 'buy') {
    positions[ticker] = {
      quantity: existing.quantity + quantity,
      costBasis: existing.costBasis + quantity * price,
    };
  } else if (action === 'sell') {
    const soldFraction = existing.quantity > 0 ? Math.min(quantity, existing.quantity) / existing.quantity : 0;
    positions[ticker] = {
      quantity: Math.max(0, existing.quantity - quantity),
      costBasis: existing.costBasis * (1 - soldFraction),
    };
  } else {
    throw new Error(`Unknown action "${action}" - must be "buy" or "sell".`);
  }
  if (positions[ticker].quantity <= 0) delete positions[ticker];
  return positions;
}

export async function recordTrade({ ticker, action, quantity, price, date, note }) {
  if (!ticker || typeof ticker !== 'string') throw new Error('ticker is required.');
  if (action !== 'buy' && action !== 'sell') throw new Error('action must be "buy" or "sell".');
  if (!(quantity > 0)) throw new Error('quantity must be a positive number.');
  if (!(price > 0)) throw new Error('price must be a positive number.');

  const ledger = await loadLedger();
  const entry = {
    ticker: ticker.toUpperCase(),
    action,
    quantity,
    price,
    date: date || new Date().toISOString(),
    note: note || null,
  };
  ledger.trades.push(entry);
  applyTrade(ledger.positions, entry);
  await saveLedger(ledger);
  return { recorded: entry, positions: ledger.positions };
}

export async function getHoldings() {
  const ledger = await loadLedger();
  const positions = Object.entries(ledger.positions).map(([ticker, pos]) => ({
    ticker,
    quantity: pos.quantity,
    costBasis: Number(pos.costBasis.toFixed(2)),
    avgPrice: Number((pos.costBasis / pos.quantity).toFixed(4)),
  }));
  const totalInvested = Number(positions.reduce((sum, p) => sum + p.costBasis, 0).toFixed(2));
  return {
    positions,
    totalInvested,
    note: 'Cost-basis tracking only - no live market pricing is wired up, so this reflects what you paid, not current market value.',
  };
}

export async function getTradeHistory() {
  const ledger = await loadLedger();
  return ledger.trades;
}
