import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FRED_SERIES = {
  fedFundsRate: 'DFF',
  dollarIndex: 'DTWEXBGS',
  treasury10y: 'DGS10',
  m2: 'M2SL',
};

export function parseRssTitles(xml, limit = 5) {
  const titles = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)].map((m) => m[1].trim());
  const [channelTitle, ...rest] = titles;
  return rest.filter((t) => t !== channelTitle).slice(0, limit);
}

export function latestFredValue(seriesJson) {
  const obs = (seriesJson.observations ?? []).filter((o) => o.value !== '.');
  if (obs.length === 0) return null;
  const last = obs[obs.length - 1];
  return { date: last.date, value: Number(last.value) };
}

async function fetchJsonSafe(fetchImpl, url, label) {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: 'ok', data: await res.json() };
  } catch (err) {
    return { status: 'unavailable', error: String(err?.message ?? err), source: label };
  }
}

async function fetchTextSafe(fetchImpl, url, label) {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: 'ok', data: await res.text() };
  } catch (err) {
    return { status: 'unavailable', error: String(err?.message ?? err), source: label };
  }
}

async function fetchMacro(fetchImpl, fredApiKey) {
  const entries = await Promise.all(
    Object.entries(FRED_SERIES).map(async ([key, seriesId]) => {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${fredApiKey}&file_type=json&sort_order=desc&limit=1`;
      const result = await fetchJsonSafe(fetchImpl, url, `fred:${key}`);
      if (result.status !== 'ok') return [key, result];
      const latest = latestFredValue(result.data);
      return [key, latest ? { status: 'ok', ...latest } : { status: 'unavailable', error: 'no observations', source: `fred:${key}` }];
    })
  );
  const vix = await fetchJsonSafe(fetchImpl, 'https://query1.finance.yahoo.com/v8/finance/chart/^VIX', 'vix');
  return { ...Object.fromEntries(entries), vix };
}

async function fetchMarket(fetchImpl) {
  const global = await fetchJsonSafe(fetchImpl, 'https://api.coingecko.com/api/v3/global', 'coingecko:global');
  return { global };
}

async function fetchDerivatives(fetchImpl) {
  const symbols = ['BTCUSDT', 'ETHUSDT'];
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const funding = await fetchJsonSafe(fetchImpl, `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, `binance:funding:${symbol}`);
      const openInterest = await fetchJsonSafe(fetchImpl, `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, `binance:oi:${symbol}`);
      return [symbol, { funding, openInterest }];
    })
  );
  return Object.fromEntries(entries);
}

async function fetchSentiment(fetchImpl) {
  const fng = await fetchJsonSafe(fetchImpl, 'https://api.alternative.me/fng/?limit=1', 'fear-greed');
  const rss = await fetchTextSafe(fetchImpl, 'https://www.coindesk.com/arc/outboundfeeds/rss/', 'coindesk-rss');
  const headlines = rss.status === 'ok' ? { status: 'ok', titles: parseRssTitles(rss.data, 8) } : rss;
  return { fng, headlines };
}

export async function fetchAll({ fetchImpl = fetch, fredApiKey } = {}) {
  const [macro, market, derivatives, sentiment] = await Promise.all([
    fetchMacro(fetchImpl, fredApiKey),
    fetchMarket(fetchImpl),
    fetchDerivatives(fetchImpl),
    fetchSentiment(fetchImpl),
  ]);
  return { fetchedAt: new Date().toISOString(), macro, market, derivatives, sentiment };
}

export async function fetchAllAndSave(outDir, opts) {
  const data = await fetchAll(opts);
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'raw-data.json');
  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  return outPath;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const outDir = process.argv[2] ?? './data';
  const fredApiKey = process.env.FRED_API_KEY;
  if (!fredApiKey) {
    console.error('FRED_API_KEY environment variable is required');
    process.exit(1);
  }
  fetchAllAndSave(outDir, { fredApiKey }).then((p) => console.log(`Saved to ${p}`));
}
