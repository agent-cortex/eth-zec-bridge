export const COINGECKO_PRICE_ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price';
export const USD_PRICE_CACHE_MS = 30_000;

const PRICE_IDS = ['ethereum', 'usd-coin', 'zcash'];
const PRICE_CURRENCY = 'usd';
const PRICE_TIMEOUT_MS = 5_000;

/**
 * @typedef {object} UsdPrices
 * @property {number} ethereumUsd
 * @property {number} usdcUsd
 * @property {number} zcashUsd
 */

/** @type {{ fetchedAt: number, value: UsdPrices }|null} */
let cachedUsdPrices = null;

/** @returns {URL} */
function priceUrl() {
  const url = new URL(COINGECKO_PRICE_ENDPOINT);
  url.searchParams.set('ids', PRICE_IDS.join(','));
  url.searchParams.set('vs_currencies', PRICE_CURRENCY);
  return url;
}

/**
 * @param {unknown} data
 * @param {'ethereum'|'usd-coin'|'zcash'} assetId
 * @returns {number}
 */
function readUsdPrice(data, assetId) {
  const value = data?.[assetId]?.[PRICE_CURRENCY];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('USD price response is missing required asset prices.');
  }
  return value;
}

/** @param {URL} url @returns {Promise<Response>} */
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRICE_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @returns {Promise<UsdPrices>}
 */
export async function fetchUsdPrices() {
  if (cachedUsdPrices && Date.now() - cachedUsdPrices.fetchedAt < USD_PRICE_CACHE_MS) {
    return cachedUsdPrices.value;
  }

  const response = await fetchWithTimeout(priceUrl());
  if (!response.ok) throw new Error(`USD price lookup failed with HTTP ${response.status}.`);
  const data = await response.json();
  const value = {
    ethereumUsd: readUsdPrice(data, 'ethereum'),
    usdcUsd: readUsdPrice(data, 'usd-coin'),
    zcashUsd: readUsdPrice(data, 'zcash'),
  };
  cachedUsdPrices = { fetchedAt: Date.now(), value };
  return value;
}

/** @param {number} value @returns {string} */
export function formatUsd(value) {
  const fractionDigits = Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function clearUsdPriceCache() {
  cachedUsdPrices = null;
}
