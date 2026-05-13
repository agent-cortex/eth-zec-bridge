import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  COINGECKO_PRICE_ENDPOINT,
  clearUsdPriceCache,
  fetchUsdPrices,
  formatUsd,
} from '../src/prices.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  clearUsdPriceCache();
  globalThis.fetch = originalFetch;
});

test('fetches ETH and ZEC USD prices from CoinGecko with a short cache', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({ ethereum: { usd: 3124.5 }, zcash: { usd: 23.4567 } }),
    };
  };

  const first = await fetchUsdPrices();
  const second = await fetchUsdPrices();

  assert.deepEqual(first, { ethereumUsd: 3124.5, zcashUsd: 23.4567 });
  assert.equal(second, first);
  assert.equal(calls.length, 1);

  const url = new URL(String(calls[0]));
  assert.equal(url.origin + url.pathname, COINGECKO_PRICE_ENDPOINT);
  assert.equal(url.searchParams.get('ids'), 'ethereum,zcash');
  assert.equal(url.searchParams.get('vs_currencies'), 'usd');
});

test('formats USD values with cents above one dollar and precision below it', () => {
  assert.equal(formatUsd(312.45), '$312.45');
  assert.equal(formatUsd(0.12345), '$0.1235');
  assert.equal(formatUsd(0.1), '$0.10');
});

test('rejects failed or incomplete USD price responses', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ ethereum: { usd: 3124.5 } }),
  });

  await assert.rejects(fetchUsdPrices(), /missing required asset prices/i);
});
