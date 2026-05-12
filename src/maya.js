export const ETH_ASSET = 'ETH.ETH';
export const ZEC_ASSET = 'ZEC.ZEC';
export const MAYA_QUOTE_ENDPOINT = 'https://mayanode.mayachain.info/mayachain/quote/swap';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const MAYA_ETH_ROUTER_ABI = [
  'function depositWithExpiry(address vault, address asset, uint256 amount, string memo, uint256 expiration) payable',
];

const MAYA_DECIMALS = 8n;
const MAYA_SCALE = 10n ** MAYA_DECIMALS;
const ETH_DECIMALS = 18n;
const ETH_SCALE = 10n ** ETH_DECIMALS;

export function ethToMayaAmount(input) {
  const wei = parseDecimalToUnits(input, ETH_DECIMALS);
  if (wei <= 0n) throw new Error('Amount must be positive');
  const maya = wei / (ETH_SCALE / MAYA_SCALE);
  if (maya <= 0n) throw new Error('Amount is too small for Maya 1e8 quote units');
  return maya.toString();
}

export function parseEthToWei(input) {
  return parseDecimalToUnits(input, ETH_DECIMALS).toString();
}

function parseDecimalToUnits(input, decimals) {
  const value = String(input ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a positive decimal amount');
  const [whole, fraction = ''] = value.split('.');
  const padded = (fraction + '0'.repeat(Number(decimals))).slice(0, Number(decimals));
  return BigInt(whole) * (10n ** decimals) + BigInt(padded || '0');
}

export function formatMayaAmount(amount) {
  const raw = BigInt(String(amount || '0'));
  const whole = raw / MAYA_SCALE;
  const fraction = (raw % MAYA_SCALE).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function isLikelyTransparentZecAddress(address) {
  return /^t[13][1-9A-HJ-NP-Za-km-z]{30,}$/.test(String(address || '').trim());
}

export function isLikelyZecAddress(address) {
  const value = String(address || '').trim();
  return (
    /^t[13][1-9A-HJ-NP-Za-km-z]{30,}$/.test(value) ||
    /^u1[a-z0-9]{40,}$/i.test(value) ||
    /^zs[a-z0-9]{40,}$/i.test(value)
  );
}

export function memoToHexData(memo) {
  return '0x' + Array.from(new TextEncoder().encode(memo), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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

export function secondsLabel(seconds) {
  const s = Number(seconds || 0);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function isBelowRecommendedMinimum(amount, quote) {
  if (!quote?.recommended_min_amount_in) return false;
  return BigInt(ethToMayaAmount(amount)) < BigInt(quote.recommended_min_amount_in);
}

export async function fetchMayaQuote({ amount, destination, toleranceBps = 300 }) {
  const response = await fetch(quoteUrl({ amount, destination, toleranceBps }));
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `Quote failed with HTTP ${response.status}`);
  return data;
}

export function buildEthTransferTx(quote, amount) {
  if (!quote?.inbound_address || !quote?.memo) throw new Error('Quote missing inbound address or memo');
  return {
    to: quote.inbound_address,
    value: '0x' + BigInt(parseEthToWei(amount)).toString(16),
    data: memoToHexData(quote.memo),
  };
}

export function buildRouterDepositArgs(quote, amount) {
  if (!quote?.router || !quote?.inbound_address || !quote?.memo || !quote?.expiry) {
    throw new Error('Quote missing router deposit fields');
  }
  return {
    router: quote.router,
    vault: quote.inbound_address,
    asset: ZERO_ADDRESS,
    amountWei: parseEthToWei(amount),
    memo: quote.memo,
    expiry: Number(quote.expiry),
  };
}
