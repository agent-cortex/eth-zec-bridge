export const ZEC_ASSET = 'ZEC.ZEC';
export const MAYA_QUOTE_ENDPOINT = 'https://mayanode.mayachain.info/mayachain/quote/swap';

export const SOURCE_ASSETS = {
  'ethereum:ETH': {
    key: 'ethereum:ETH',
    chain: 'ethereum',
    chainLabel: 'Ethereum mainnet',
    assetLabel: 'ETH',
    symbol: 'ETH',
    mayaAsset: 'ETH.ETH',
    chainId: '0x1',
    decimals: 18n,
    type: 'native',
    supported: true,
  },
  'ethereum:USDC': {
    key: 'ethereum:USDC',
    chain: 'ethereum',
    chainLabel: 'Ethereum mainnet',
    assetLabel: 'USDC',
    symbol: 'USDC',
    mayaAsset: 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
    chainId: '0x1',
    decimals: 6n,
    type: 'erc20',
    tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    supported: true,
  },
};

export const DEFAULT_SOURCE_ASSET_KEY = 'ethereum:ETH';
export const ETH_ASSET = SOURCE_ASSETS['ethereum:ETH'].mayaAsset;
export const ETH_USDC_ASSET = SOURCE_ASSETS['ethereum:USDC'].mayaAsset;

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

/** @typedef {keyof SOURCE_ASSETS} SourceAssetKey */

/**
 * @typedef {typeof SOURCE_ASSETS[SourceAssetKey]} SourceAsset
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
 * `amount` is a decimal source-asset string; `toleranceBps` is slippage in basis points.
 *
 * @typedef {object} MayaQuoteRequest
 * @property {DecimalAmount} amount Decimal source asset amount to swap.
 * @property {string} destination Native Zcash recipient address.
 * @property {SourceAssetKey} [sourceAssetKey]
 * @property {string|null} [fromAddress]
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
 * @property {string} inbound_address Fresh Maya inbound vault address.
 * @property {string} memo Swap memo to include as Ethereum tx data / router calldata.
 * @property {string} [router] EVM router address for token deposits.
 * @property {MayaIntegerField} expiry Unix timestamp in seconds.
 * @property {MayaIntegerField} expected_amount_out Expected ZEC output in Maya 1e8 units.
 * @property {MayaIntegerField} [recommended_min_amount_in] Minimum input in Maya 1e8 units.
 * @property {MayaQuoteFees} [fees]
 * @property {MayaIntegerField} [total_swap_seconds]
 */

/**
 * Ethereum transaction request shape sent to EIP-1193 wallets.
 *
 * @typedef {object} EthTransferTx
 * @property {string} to Ethereum recipient address.
 * @property {HexString} value Hex-encoded native value.
 * @property {HexString} data Hex-encoded calldata.
 */

const MAYA_DECIMALS = 8n;
const MAYA_SCALE = 10n ** MAYA_DECIMALS;
const TRANSPARENT_ZEC_ADDRESS_RE = /^t[13][1-9A-HJ-NP-Za-km-z]{30,}$/;
const UNIFIED_ZEC_ADDRESS_RE = /^u1[a-z0-9]{40,}$/i;
const SAPLING_ZEC_ADDRESS_RE = /^zs[a-z0-9]{40,}$/i;
const ADDRESS_WORD_RE = /^0x[0-9a-fA-F]{40}$/;

/** @param {SourceAssetKey|undefined|null} sourceAssetKey @returns {SourceAsset} */
export function getSourceAsset(sourceAssetKey = DEFAULT_SOURCE_ASSET_KEY) {
  const asset = SOURCE_ASSETS[sourceAssetKey || DEFAULT_SOURCE_ASSET_KEY];
  if (!asset) throw new Error('Unsupported source asset selection.');
  return asset;
}

/** @param {SourceAsset} asset */
export function assertSupportedSourceAsset(asset) {
  if (!asset.supported) throw new Error(asset.unsupportedReason || `${asset.chainLabel} ${asset.assetLabel} is not available for ZEC swaps yet.`);
}

/**
 * @param {DecimalAmount} input Decimal input amount.
 * @returns {MayaBaseAmount}
 */
export function decimalToMayaAmount(input) {
  const units = parseDecimalToUnits(input, MAYA_DECIMALS);
  if (units <= 0n) throw new Error('Amount is too small for Maya 1e8 quote units');
  return units.toString();
}

/**
 * Backwards-compatible helper for tests and ETH-native wording.
 * @param {DecimalAmount} input Decimal ETH input amount.
 * @returns {MayaBaseAmount}
 */
export function ethToMayaAmount(input) {
  return decimalToMayaAmount(input);
}

/**
 * @param {DecimalAmount} input Decimal amount.
 * @param {bigint} decimals Native token decimals.
 * @returns {string} integer unit amount as a base-10 string.
 */
export function decimalToNativeUnits(input, decimals) {
  const value = parseDecimalToUnits(input, decimals);
  if (value <= 0n) throw new Error('Amount must be positive');
  return value.toString();
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

/** @param {string} address @returns {string} */
function encodeAddressWord(address) {
  if (!ADDRESS_WORD_RE.test(address)) throw new Error(`Invalid EVM address: ${address}`);
  return address.toLowerCase().slice(2).padStart(64, '0');
}

/** @param {bigint|string|number} value @returns {string} */
function encodeUintWord(value) {
  const raw = BigInt(String(value));
  if (raw < 0n) throw new Error('Cannot encode negative uint256');
  return raw.toString(16).padStart(64, '0');
}

/** @param {string} value @returns {string} */
function encodeStringBytes(value) {
  const bytes = Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const paddedLength = Math.ceil(bytes.length / 64) * 64;
  return encodeUintWord(bytes.length / 2) + bytes.padEnd(paddedLength, '0');
}

/** @param {string} spender @param {string} amountNativeUnits @returns {HexString} */
export function buildErc20ApproveData(spender, amountNativeUnits) {
  return `0x095ea7b3${encodeAddressWord(spender)}${encodeUintWord(amountNativeUnits)}`;
}

/**
 * depositWithExpiry(address vault, address asset, uint256 amount, string memo, uint256 expiration)
 * @param {object} args
 * @param {string} args.vault
 * @param {string} args.token
 * @param {string} args.amountNativeUnits
 * @param {string} args.memo
 * @param {MayaIntegerField} args.expiry
 * @returns {HexString}
 */
export function buildDepositWithExpiryData({ vault, token, amountNativeUnits, memo, expiry }) {
  const selector = '44bc937b';
  const head = [
    encodeAddressWord(vault),
    encodeAddressWord(token),
    encodeUintWord(amountNativeUnits),
    encodeUintWord(160),
    encodeUintWord(expiry),
  ].join('');
  return `0x${selector}${head}${encodeStringBytes(memo)}`;
}

/**
 * @param {MayaQuoteRequest} request
 * @returns {URL}
 */
export function quoteUrl({ amount, destination, sourceAssetKey = DEFAULT_SOURCE_ASSET_KEY, fromAddress = null, toleranceBps = 300 }) {
  if (!isLikelyZecAddress(destination)) {
    throw new Error('Enter a Zcash address: transparent t1/t3, unified u1, or shielded zs. Maya will perform final validation.');
  }
  const sourceAsset = getSourceAsset(sourceAssetKey);
  assertSupportedSourceAsset(sourceAsset);
  const url = new URL(MAYA_QUOTE_ENDPOINT);
  url.searchParams.set('from_asset', sourceAsset.mayaAsset);
  url.searchParams.set('to_asset', ZEC_ASSET);
  url.searchParams.set('amount', decimalToMayaAmount(amount));
  url.searchParams.set('destination', destination.trim());
  url.searchParams.set('liquidity_tolerance_bps', String(toleranceBps));
  if (fromAddress) url.searchParams.set('from_address', fromAddress);
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
 * @param {DecimalAmount} amount Decimal input amount.
 * @param {Pick<MayaQuote, 'recommended_min_amount_in'>} quote
 * @returns {boolean}
 */
export function isBelowRecommendedMinimum(amount, quote) {
  if (!quote?.recommended_min_amount_in) return false;
  return BigInt(decimalToMayaAmount(amount)) < BigInt(quote.recommended_min_amount_in);
}

/**
 * @param {MayaQuoteRequest} request
 * @returns {Promise<MayaQuote>}
 */
export async function fetchMayaQuote({ amount, destination, sourceAssetKey = DEFAULT_SOURCE_ASSET_KEY, fromAddress = null, toleranceBps = 300 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(quoteUrl({ amount, destination, sourceAssetKey, fromAddress, toleranceBps }), { signal: controller.signal });
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
 * @param {DecimalAmount} amount Decimal input amount.
 * @param {SourceAssetKey} [sourceAssetKey]
 * @returns {EthTransferTx}
 */
export function buildNativeTransferTx(quote, amount, sourceAssetKey = DEFAULT_SOURCE_ASSET_KEY) {
  const sourceAsset = getSourceAsset(sourceAssetKey);
  if (sourceAsset.type !== 'native') throw new Error('Selected asset is not a native transfer asset.');
  if (!quote?.inbound_address || !quote?.memo) throw new Error('Quote missing inbound address or memo');
  return {
    to: quote.inbound_address,
    value: '0x' + BigInt(decimalToNativeUnits(amount, sourceAsset.decimals)).toString(16),
    data: memoToHexData(quote.memo),
  };
}

/**
 * Backwards-compatible ETH-native transaction builder.
 * @param {MayaQuote} quote
 * @param {DecimalAmount} amount Decimal ETH input amount.
 * @returns {EthTransferTx}
 */
export function buildEthTransferTx(quote, amount) {
  return buildNativeTransferTx(quote, amount, DEFAULT_SOURCE_ASSET_KEY);
}

/**
 * @param {MayaQuote} quote
 * @param {DecimalAmount} amount Decimal ERC-20 amount.
 * @param {SourceAssetKey} sourceAssetKey
 * @returns {{ approve: EthTransferTx, deposit: EthTransferTx }}
 */
export function buildErc20DepositTxs(quote, amount, sourceAssetKey) {
  const sourceAsset = getSourceAsset(sourceAssetKey);
  if (sourceAsset.type !== 'erc20' || !sourceAsset.tokenAddress) throw new Error('Selected asset is not an ERC-20 token.');
  if (!quote?.router || !quote?.inbound_address || !quote?.memo || !quote?.expiry) throw new Error('Quote missing router deposit fields.');
  const amountNativeUnits = decimalToNativeUnits(amount, sourceAsset.decimals);
  return {
    approve: {
      to: sourceAsset.tokenAddress,
      value: '0x0',
      data: buildErc20ApproveData(quote.router, amountNativeUnits),
    },
    deposit: {
      to: quote.router,
      value: '0x0',
      data: buildDepositWithExpiryData({
        vault: quote.inbound_address,
        token: sourceAsset.tokenAddress,
        amountNativeUnits,
        memo: quote.memo,
        expiry: quote.expiry,
      }),
    },
  };
}
