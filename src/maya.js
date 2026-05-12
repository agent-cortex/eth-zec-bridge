export const ETH_ASSET = 'ETH.ETH';
export const ZEC_ASSET = 'ZEC.ZEC';
export const MAYA_QUOTE_ENDPOINT = 'https://mayanode.mayachain.info/mayachain/quote/swap';

/**
 * Decimal amount string entered by a user, e.g. "0.125".
 *
 * @typedef {string} DecimalAmount
 */

/**
 * Unsigned integer amount encoded as a base-10 string in Maya's 1e8 units.
 *
 * @typedef {string} MayaBaseAmount
 */

/**
 * Numeric fields returned by Mayanode are documented as integers, but the API
 * may serialize them as either JSON numbers or decimal strings.
 *
 * @typedef {string|number} MayaIntegerField
 */

/**
 * Hex string with a 0x prefix.
 *
 * @typedef {`0x${string}`} HexString
 */

/**
 * User-entered swap quote request shared by the UI and Maya helpers.
 * `amount` is a decimal ETH string; `toleranceBps` is slippage in basis points.
 *
 * @typedef {object} MayaQuoteRequest
 * @property {DecimalAmount} amount Decimal ETH amount to swap.
 * @property {string} destination Native Zcash recipient address.
 * @property {number} [toleranceBps]
 */

/**
 * Fee fields in Maya quote responses, expressed in Maya's 1e8 integer units.
 *
 * @typedef {object} MayaQuoteFees
 * @property {MayaIntegerField} [outbound] ZEC outbound network fee.
 * @property {MayaIntegerField} [total] Total quote fee estimate.
 */

/**
 * Subset of the Maya quote response consumed by this app. Amount fields use
 * Maya's 1e8 integer units and may be returned as strings or numbers.
 *
 * @typedef {object} MayaQuote
 * @property {string} inbound_address Fresh Maya ETH inbound vault address.
 * @property {string} memo Swap memo to include as Ethereum tx data.
 * @property {MayaIntegerField} expiry Unix timestamp in seconds.
 * @property {MayaIntegerField} expected_amount_out Expected ZEC output in Maya 1e8 units.
 * @property {MayaIntegerField} [recommended_min_amount_in] Minimum ETH input in Maya 1e8 units.
 * @property {MayaQuoteFees} [fees]
 * @property {MayaIntegerField} [total_swap_seconds]
 */

/**
 * Ethereum transaction request shape sent to EIP-1193 wallets.
 *
 * @typedef {object} EthTransferTx
 * @property {string} to Ethereum recipient address.
 * @property {HexString} value Hex-encoded wei value.
 * @property {HexString} data Hex-encoded Maya memo.
 */

const MAYA_DECIMALS = 8n;
const MAYA_SCALE = 10n ** MAYA_DECIMALS;
const ETH_DECIMALS = 18n;
const ETH_SCALE = 10n ** ETH_DECIMALS;
const TRANSPARENT_ZEC_ADDRESS_RE = /^t[13][1-9A-HJ-NP-Za-km-z]{30,}$/;
const UNIFIED_ZEC_ADDRESS_RE = /^u1[a-z0-9]{40,}$/i;
const SAPLING_ZEC_ADDRESS_RE = /^zs[a-z0-9]{40,}$/i;

/**
 * @param {DecimalAmount} input Decimal ETH input amount.
 * @returns {MayaBaseAmount}
 */
export function ethToMayaAmount(input) {
  const wei = parseDecimalToUnits(input, ETH_DECIMALS);
  if (wei <= 0n) throw new Error('Amount must be positive');
  const maya = wei / (ETH_SCALE / MAYA_SCALE);
  if (maya <= 0n) throw new Error('Amount is too small for Maya 1e8 quote units');
  return maya.toString();
}

/**
 * @param {DecimalAmount} input Decimal ETH input amount.
 * @returns {string} Wei amount as a base-10 integer string.
 */
function parseEthToWei(input) {
  return parseDecimalToUnits(input, ETH_DECIMALS).toString();
}

/**
 * @param {string|number|bigint|null|undefined} input Decimal amount to parse.
 * @param {bigint} decimals Number of fractional decimals in the target unit.
 * @returns {bigint}
 */
function parseDecimalToUnits(input, decimals) {
  const value = String(input ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a positive decimal amount');
  const [whole, fraction = ''] = value.split('.');
  const padded = (fraction + '0'.repeat(Number(decimals))).slice(0, Number(decimals));
  return BigInt(whole) * (10n ** decimals) + BigInt(padded || '0');
}

/**
 * @param {MayaIntegerField|bigint} amount Amount in Maya 1e8 units.
 * @returns {string} Decimal display amount.
 */
export function formatMayaAmount(amount) {
  const raw = BigInt(String(amount));
  const whole = raw / MAYA_SCALE;
  const fraction = (raw % MAYA_SCALE).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * @param {string|null|undefined} address Native Zcash address candidate.
 * @returns {boolean}
 */
export function isLikelyZecAddress(address) {
  if (typeof address !== 'string') return false;
  const value = address.trim();
  return (
    TRANSPARENT_ZEC_ADDRESS_RE.test(value) ||
    UNIFIED_ZEC_ADDRESS_RE.test(value) ||
    SAPLING_ZEC_ADDRESS_RE.test(value)
  );
}

/**
 * @param {string} memo Maya swap memo.
 * @returns {HexString} UTF-8 memo encoded as Ethereum calldata.
 */
export function memoToHexData(memo) {
  return '0x' + Array.from(new TextEncoder().encode(memo), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {MayaQuoteRequest} request
 * @returns {URL}
 */
export function quoteUrl({ amount, destination, toleranceBps = 300 }) {
  if (!isLikelyZecAddress(destination)) {
    throw new Error('Enter a Zcash address: transparent t1/t3, unified u1, or shielded zs. Maya will perform final validation.');
  }
  const url = new URL(MAYA_QUOTE_ENDPOINT);
  url.searchParams.set('from_asset', ETH_ASSET);
  url.searchParams.set('to_asset', ZEC_ASSET);
  url.searchParams.set('amount', ethToMayaAmount(amount));
  url.searchParams.set('destination', destination.trim());
  url.searchParams.set('liquidity_tolerance_bps', String(toleranceBps));
  return url;
}

/**
 * @param {MayaIntegerField|bigint|null|undefined} seconds Duration in seconds.
 * @returns {string}
 */
export function secondsLabel(seconds) {
  const s = Number(seconds || 0);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * @param {DecimalAmount} amount Decimal ETH input amount.
 * @param {Pick<MayaQuote, 'recommended_min_amount_in'>} quote
 * @returns {boolean}
 */
export function isBelowRecommendedMinimum(amount, quote) {
  if (!quote?.recommended_min_amount_in) return false;
  return BigInt(ethToMayaAmount(amount)) < BigInt(quote.recommended_min_amount_in);
}

/**
 * @param {MayaQuoteRequest} request
 * @returns {Promise<MayaQuote>}
 */
export async function fetchMayaQuote({ amount, destination, toleranceBps = 300 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(quoteUrl({ amount, destination, toleranceBps }), { signal: controller.signal });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `Quote failed with HTTP ${response.status}`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Quote timed out. Maya may be slow; try again in a moment.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @param {MayaQuote} quote
 * @param {DecimalAmount} amount Decimal ETH input amount.
 * @returns {EthTransferTx}
 */
export function buildEthTransferTx(quote, amount) {
  if (!quote?.inbound_address || !quote?.memo) throw new Error('Quote missing inbound address or memo');
  return {
    to: quote.inbound_address,
    value: '0x' + BigInt(parseEthToWei(amount)).toString(16),
    data: memoToHexData(quote.memo),
  };
}
