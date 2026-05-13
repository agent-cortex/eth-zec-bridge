import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('keeps the browser app DOM contract intact', () => {
  for (const id of ['connect', 'quote', 'send', 'amount', 'destination', 'slippage', 'status', 'quote-card', 'details', 'tx-hash']) {
    assert.equal(html.match(new RegExp(`id="${id}"`, 'g'))?.length, 1);
  }

  assert.match(html, /<script type="module" src="\/src\/app\.js(?:\?v=[^"]+)?"><\/script>/);
});

test('uses XScanner for submitted transaction links', () => {
  assert.match(app, /https:\/\/xscanner\.org\/transaction\/\$\{encodeURIComponent\(String\(hash\)\)\}/);
  assert.doesNotMatch(app, /etherscan|mayascan/i);
});

test('uses the strict minimal static UI treatment', () => {
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|linear-gradient|radial-gradient|box-shadow|border-radius/i);
  assert.doesNotMatch(html, /Instrument Serif|Merriweather|Roboto|Cantarell|Cinzel|Habibi/i);
  assert.match(html, /ZEROBRIDGE   ETH → ZEC/);
  assert.match(html, /CONNECT WALLET/);
  assert.match(html, /Get quote/);
  assert.match(html, /Swap now/);
  assert.match(html, /ETH mainnet input/);
  assert.match(html, /<textarea id="destination"/);
  assert.match(html, /word-break: break-all/);
  assert.match(html, />↓<\/div>/);
  assert.match(html, /1 TX · 0 CUSTODY · NATIVE ZEC RECEIVE/);
  assert.match(html, /BUILT BY MEGABYTE0X/);
  assert.match(html, /ZeroBridge deploys no contract\./);
  assert.doesNotMatch(html, /grid-template-columns: minmax\(0, 1fr\) 104px/i);
});

test('keeps quoted-state details readable and actionable', () => {
  assert.match(html, /<span>Submitted tx<\/span><b id="tx-hash">not sent yet<\/b>/);
  assert.doesNotMatch(html, /#status \{\s*border-left/s);
  assert.match(app, /Quote ready\. Expires quickly — send only from this screen\./);
  assert.match(app, /Refresh quote/);
  assert.match(app, /formatLocalTimestamp/);
  assert.match(app, /expires in/);
  assert.doesNotMatch(app, /toLocaleString\(/);
});
