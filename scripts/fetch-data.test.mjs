import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRssTitles, latestFredValue, fetchAll } from './fetch-data.mjs';

test('parseRssTitles skips the feed title and returns item titles', () => {
  const xml = `<rss><channel><title>CoinDesk</title><item><title>Bitcoin rallies</title></item><item><title><![CDATA[ETH breaks $3000]]></title></item></channel></rss>`;
  assert.deepEqual(parseRssTitles(xml, 5), ['Bitcoin rallies', 'ETH breaks $3000']);
});

test('parseRssTitles respects the limit', () => {
  const xml = `<title>Feed</title><title>A</title><title>B</title><title>C</title>`;
  assert.deepEqual(parseRssTitles(xml, 2), ['A', 'B']);
});

test('parseRssTitles drops a duplicate channel title from an <image> block', () => {
  const xml = `<rss><channel><title>CoinDesk</title><image><title>CoinDesk</title></image><item><title>Bitcoin rallies</title></item></channel></rss>`;
  assert.deepEqual(parseRssTitles(xml, 5), ['Bitcoin rallies']);
});

test('latestFredValue picks the last non-missing observation', () => {
  const series = { observations: [{ date: '2026-08-18', value: '.' }, { date: '2026-08-19', value: '5.33' }] };
  assert.deepEqual(latestFredValue(series), { date: '2026-08-19', value: 5.33 });
});

test('latestFredValue returns null when there is no data', () => {
  assert.equal(latestFredValue({ observations: [] }), null);
});

test('fetchAll marks a failing source unavailable without throwing', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('coingecko')) throw new Error('network down');
    if (url.includes('stlouisfed')) return { ok: true, json: async () => ({ observations: [{ date: '2026-08-19', value: '5.33' }] }) };
    if (url.includes('yahoo')) return { ok: true, json: async () => ({}) };
    if (url.includes('binance')) return { ok: true, json: async () => ({ lastFundingRate: '0.0001' }) };
    if (url.includes('alternative.me')) return { ok: true, json: async () => ({ data: [{ value: '50' }] }) };
    if (url.includes('coindesk')) return { ok: true, text: async () => '<title>Feed</title><title>Headline</title>' };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchAll({ fetchImpl, fredApiKey: 'test-key' });
  assert.equal(result.market.global.status, 'unavailable');
  assert.equal(result.macro.fedFundsRate.status, 'ok');
  assert.equal(result.sentiment.headlines.status, 'ok');
  assert.deepEqual(result.sentiment.headlines.titles, ['Headline']);
});

test('fetchAll marks a non-2xx HTTP response as unavailable', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const result = await fetchAll({ fetchImpl, fredApiKey: 'test-key' });
  assert.equal(result.market.global.status, 'unavailable');
  assert.equal(result.macro.fedFundsRate.status, 'unavailable');
});
