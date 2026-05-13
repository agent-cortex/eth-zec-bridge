import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ETH_ASSET,
  ETH_USDC_ASSET,
  ZEC_ASSET,
  MAYA_QUOTE_ENDPOINT,
  buildDepositWithExpiryData,
  buildErc20ApproveData,
  decimalToNativeUnits,
  ethToMayaAmount,
  formatMayaAmount,
  isLikelyZecAddress,
  isBelowRecommendedMinimum,
  memoToHexData,
  quoteUrl,
  secondsLabel,
} from '../src/maya.js';

test('uses Maya asset identifiers for Ethereum mainnet ETH, USDC, and ZEC', () => {
  assert.equal(ETH_ASSET, 'ETH.ETH');
  assert.equal(ETH_USDC_ASSET, 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48');
  assert.equal(ZEC_ASSET, 'ZEC.ZEC');
});

test('converts decimal input to Maya 1e8 quote amount units by flooring extra precision', () => {
  assert.equal(ethToMayaAmount('1'), '100000000');
  assert.equal(ethToMayaAmount('0.1'), '10000000');
  assert.equal(ethToMayaAmount('0.000000019'), '1');
  assert.throws(() => ethToMayaAmount('0.000000009'), /too small/i);
  assert.throws(() => ethToMayaAmount('-1'), /positive/i);
});

test('converts source amount to native EVM token units', () => {
  assert.equal(decimalToNativeUnits('0.1', 18n), '100000000000000000');
  assert.equal(decimalToNativeUnits('1.25', 6n), '1250000');
  assert.equal(decimalToNativeUnits('0.0000019', 6n), '1');
});

test('formats Maya 1e8 amount units for humans', () => {
  assert.equal(formatMayaAmount('40967581'), '0.40967581');
  assert.equal(formatMayaAmount('100000000'), '1');
  assert.equal(formatMayaAmount('110211'), '0.00110211');
  assert.throws(() => formatMayaAmount(undefined), /BigInt/);
});

test('accepts transparent, unified, and Sapling-looking Zcash addresses for Maya validation', () => {
  assert.equal(isLikelyZecAddress('t1VnR43K5VjH7JBBc4xH2KccHLakDQvkEr8'), true);
  assert.equal(isLikelyZecAddress('u1fcwchlpy2u0t9hdl8wcku8dmvrhwz6lk0jwj2z56ylxhacpn9jnx5sgftx8kv7s97ay37gclcm495panxkz0pyq5479s7vnr90a03sdppp4mupw6vmesh7sf2ym99f4gjl9utaw4eyup53vn7hthu7shms0ct79876xtjk7r8qg4p582'), true);
  assert.equal(isLikelyZecAddress('zs1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'), true);
  assert.equal(isLikelyZecAddress('0x0000000000000000000000000000000000000000'), false);
});

test('encodes Maya memo as Ethereum tx data hex', () => {
  assert.equal(memoToHexData('=:z:t1abc'), '0x3d3a7a3a7431616263');
});

test('constructs a quote URL with source asset selection and slippage protection', () => {
  const url = quoteUrl({ amount: '0.1', destination: 't1VnR43K5VjH7JBBc4xH2KccHLakDQvkEr8', toleranceBps: 300 });
  assert.equal(url.origin + url.pathname, MAYA_QUOTE_ENDPOINT);
  assert.equal(url.searchParams.get('from_asset'), 'ETH.ETH');
  assert.equal(url.searchParams.get('to_asset'), 'ZEC.ZEC');
  assert.equal(url.searchParams.get('amount'), '10000000');
  assert.equal(url.searchParams.get('destination'), 't1VnR43K5VjH7JBBc4xH2KccHLakDQvkEr8');
  assert.equal(url.searchParams.get('liquidity_tolerance_bps'), '300');

  const usdc = quoteUrl({
    amount: '1',
    destination: 't1VnR43K5VjH7JBBc4xH2KccHLakDQvkEr8',
    sourceAssetKey: 'ethereum:USDC',
    fromAddress: '0x000000000000000000000000000000000000dEaD',
  });
  assert.equal(usdc.searchParams.get('from_asset'), ETH_USDC_ASSET);
  assert.equal(usdc.searchParams.get('from_address'), '0x000000000000000000000000000000000000dEaD');
});

test('builds ERC-20 approve and Maya router deposit calldata', () => {
  assert.equal(
    buildErc20ApproveData('0xe3985E6b61b814F7Cdb188766562ba71b446B46d', '1250000'),
    '0x095ea7b3000000000000000000000000e3985e6b61b814f7cdb188766562ba71b446b46d00000000000000000000000000000000000000000000000000000000001312d0',
  );
  const data = buildDepositWithExpiryData({
    vault: '0x6a16f961e24e6e90bd9f950f768dc42a7f305664',
    token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amountNativeUnits: '1250000',
    memo: '=:z:t1abc',
    expiry: '1778676227',
  });
  assert.match(data, /^0x44bc937b/);
  assert.match(data, /0000000000000000000000006a16f961e24e6e90bd9f950f768dc42a7f305664/);
  assert.match(data, /000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48/);
  assert.match(data, /3d3a7a3a7431616263/);
});

test('labels durations', () => {
  assert.equal(secondsLabel(24), '24s');
  assert.equal(secondsLabel(125), '2m 5s');
});

test('detects amounts below Maya recommended minimum', () => {
  const quote = { recommended_min_amount_in: '300000' };
  assert.equal(isBelowRecommendedMinimum('0.001', quote), true);
  assert.equal(isBelowRecommendedMinimum('0.003', quote), false);
  assert.equal(isBelowRecommendedMinimum('0.01', quote), false);
});
