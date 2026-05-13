import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('keeps the browser app DOM contract intact', () => {
  for (const id of ['connect', 'quote', 'send', 'amount', 'destination', 'slippage', 'status', 'quote-card', 'details', 'tx-hash']) {
    assert.equal(html.match(new RegExp(`id="${id}"`, 'g'))?.length, 1);
  }

  assert.match(html, /<script type="module" src="\/src\/app\.js"><\/script>/);
});

test('uses the strict minimal static UI treatment', () => {
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|linear-gradient|radial-gradient|box-shadow|border-radius/i);
  assert.doesNotMatch(html, /Instrument Serif|Merriweather|Roboto|Cantarell|Cinzel|Habibi/i);
  assert.match(html, /ZEROBRIDGE   ETH → ZEC/);
  assert.match(html, /CONNECT WALLET/);
  assert.match(html, /Get quote/);
  assert.match(html, /Swap now/);
  assert.match(html, /1 TX · 0 CUSTODY · NATIVE ZEC RECEIVE/);
  assert.match(html, /BUILT BY MEGABYTE0X/);
  assert.match(html, /ZeroBridge deploys no contract\./);
  assert.doesNotMatch(html, /grid-template-columns: minmax\(0, 1fr\) 104px/i);
});
