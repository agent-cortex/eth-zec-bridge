import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ETH_ASSET,
  ZEC_ASSET,
  MAYA_QUOTE_ENDPOINT,
  ethToMayaAmount,
  formatMayaAmount,
  isLikelyTransparentZecAddress,
  isBelowRecommendedMinimum,
  memoToHexData,
  quoteUrl,
  secondsLabel,
} from '../src/maya.js';

test('uses Maya asset identifiers for native ETH and ZEC', () => {
  assert.equal(ETH_ASSET, 'ETH.ETH');
  assert.equal(ZEC_ASSET, 'ZEC.ZEC');
});

test('converts ETH input to Maya 1e8 amount units by flooring extra precision', () => {
  assert.equal(ethToMayaAmount('1'), '100000000');
  assert.equal(ethToMayaAmount('0.1'), '10000000');
  assert.equal(ethToMayaAmount('0.000000019'), '1');
  assert.throws(() => ethToMayaAmount('0.000000009'), /too small/i);
  assert.throws(() => ethToMayaAmount('-1'), /positive/i);
});

test('formats Maya 1e8 amount units for humans', () => {
  assert.equal(formatMayaAmount('40967581'), '0.40967581');
  assert.equal(formatMayaAmount('100000000'), '1');
  assert.equal(formatMayaAmount('110211'), '0.00110211');
});

test('accepts only transparent Zcash-looking addresses in the browser guard', () => {
  assert.equal(isLikelyTransparentZecAddress('t1VnR43K5VjH7JBBc4xH2KccHLakDQvkEr8'), true);
  assert.equal(isLikelyTransparentZecAddress('t3Vz22vK5z2LcKEdg16Yv4FFneEL1zg9ojd'), true);
  assert.equal(isLikelyTransparentZecAddress('u1abcdef'), false);
  assert.equal(isLikelyTransparentZecAddress('zs1abcdef'), false);
  assert.equal(isLikelyTransparentZecAddress('0x0000000000000000000000000000000000000000'), false);
});

test('encodes Maya memo as Ethereum tx data hex', () => {
  assert.equal(memoToHexData('=:z:t1abc'), '0x3d3a7a3a7431616263');
});

test('constructs a quote URL with slippage protection', () => {
  const url = quoteUrl({ amount: '0.1', destination: 't1VnR43K5VjH7JBBc4xH2KccHLakDQvkEr8', toleranceBps: 300 });
  assert.equal(url.origin + url.pathname, MAYA_QUOTE_ENDPOINT);
  assert.equal(url.searchParams.get('from_asset'), 'ETH.ETH');
  assert.equal(url.searchParams.get('to_asset'), 'ZEC.ZEC');
  assert.equal(url.searchParams.get('amount'), '10000000');
  assert.equal(url.searchParams.get('destination'), 't1VnR43K5VjH7JBBc4xH2KccHLakDQvkEr8');
  assert.equal(url.searchParams.get('liquidity_tolerance_bps'), '300');
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
