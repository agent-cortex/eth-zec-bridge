import {
  DEFAULT_SOURCE_ASSET_KEY,
  buildErc20DepositTxs,
  buildNativeTransferTx,
  fetchMayaQuote,
  formatMayaAmount,
  getSourceAsset,
  isBelowRecommendedMinimum,
  isLikelyZecAddress,
  secondsLabel,
} from './maya.js';
import { USD_PRICE_CACHE_MS, fetchUsdPrices, formatUsd } from './prices.js';

/** @typedef {import('./maya.js').MayaQuote} MayaQuote */
/** @typedef {import('./maya.js').MayaQuoteRequest} MayaQuoteRequest */

/** @typedef {'info'|'ok'|'error'} StatusTone */

/**
 * Minimal EIP-1193 request object shapes this app sends to injected wallets.
 *
 * @typedef {{ method: 'eth_requestAccounts'|'eth_chainId' }} WalletReadRequest
 */

/**
 * @typedef {{ method: 'wallet_switchEthereumChain', params: [{ chainId: string }] }} WalletSwitchChainRequest
 */

/**
 * @typedef {{ method: 'eth_sendTransaction', params: [import('./maya.js').EthTransferTx & { from: string }] }} WalletSendTransactionRequest
 */

/** @typedef {WalletReadRequest|WalletSwitchChainRequest|WalletSendTransactionRequest} WalletRequest */

/**
 * Minimal injected Ethereum provider surface used by this app.
 *
 * @typedef {object} EthereumProvider
 * @property {(request: WalletRequest) => Promise<string|string[]>} request
 */

/**
 * @typedef {object} AppState
 * @property {string|null} account Connected Ethereum account address.
 * @property {MayaQuote|null} quote Last fetched Maya quote.
 * @property {import('./prices.js').UsdPrices|null} usdPrices Last fetched USD prices.
 * @property {number|null} expiryTimer Active quote expiry countdown interval.
 * @property {number} priceRequestId Last amount pricing request identifier.
 */

/**
 * @typedef {object} UIElements
 * @property {NodeListOf<HTMLInputElement>} sourceAssets
 * @property {HTMLButtonElement} connect
 * @property {HTMLButtonElement} quote
 * @property {HTMLButtonElement} send
 * @property {HTMLInputElement} amount
 * @property {HTMLTextAreaElement} destination
 * @property {HTMLInputElement} slippage
 * @property {HTMLElement} status
 * @property {HTMLElement} amountUsd
 * @property {HTMLElement} zecPrice
 * @property {HTMLElement} quoteCard
 * @property {HTMLElement} details
 */

/** @param {string} id @returns {HTMLElement} */
const $ = (id) => document.getElementById(id);

/** @type {AppState} */
const state = { account: null, quote: null, usdPrices: null, expiryTimer: null, priceRequestId: 0 };

/** @type {UIElements} */
const els = {
  sourceAssets: document.querySelectorAll('input[name="source-asset"]'),
  connect: $('connect'),
  quote: $('quote'),
  send: $('send'),
  amount: $('amount'),
  destination: $('destination'),
  slippage: $('slippage'),
  status: $('status'),
  amountUsd: $('amount-usd'),
  zecPrice: $('zec-price'),
  quoteCard: $('quote-card'),
  details: $('details'),
};

function selectedSourceAssetKey() {
  const selected = document.querySelector('input[name="source-asset"]:checked');
  return `ethereum:${selected?.value || 'ETH'}`;
}

function selectedSourceAsset() {
  return getSourceAsset(selectedSourceAssetKey());
}

function selectedAssetUsdPrice() {
  if (!state.usdPrices) return null;
  const sourceAsset = selectedSourceAsset();
  if (sourceAsset.symbol === 'ETH') return state.usdPrices.ethereumUsd;
  if (sourceAsset.symbol === 'USDC') return state.usdPrices.usdcUsd;
  return null;
}

function resetQuoteForRouteChange() {
  state.quote = null;
  clearExpiryCountdown();
  els.quoteCard.hidden = true;
  els.quote.textContent = 'Get quote';
  els.send.disabled = true;
  renderUsdDisplays();
  const sourceAsset = selectedSourceAsset();
  if (sourceAsset.supported) {
    setStatus(`Route selected: ${sourceAsset.chainLabel} ${sourceAsset.assetLabel} → native ZEC.`);
  } else {
    setStatus(sourceAsset.unsupportedReason, 'error');
  }
}

/**
 * @param {string} message
 * @param {StatusTone} [tone]
 */
function setStatus(message, tone = 'info') {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error) {
  if (error instanceof Error) return error.message;
  console.error('Non-Error rejection', error);
  return 'Unexpected error. See browser console for details.';
}

/** @param {number} value @returns {string} */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/** @param {Date} date @returns {string} */
function formatLocalTimestamp(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** @param {number} seconds @returns {string} */
function countdownLabel(seconds) {
  const remaining = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return `${minutes}:${pad2(secs)}`;
}

/** @param {string} value @returns {number|null} */
function parsePositiveAmount(value) {
  const input = value.trim();
  if (!/^\d+(\.\d+)?$/.test(input)) return null;
  const amount = Number(input);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function hideAmountUsd() {
  els.amountUsd.textContent = '';
  els.amountUsd.hidden = true;
}

function hideHeaderZecPrice() {
  els.zecPrice.textContent = '';
  els.zecPrice.hidden = true;
}

function renderHeaderZecPrice() {
  if (!state.usdPrices) {
    hideHeaderZecPrice();
    return;
  }
  els.zecPrice.textContent = `1 ZEC = ${formatUsd(state.usdPrices.zcashUsd)} USD`;
  els.zecPrice.hidden = false;
}

function rerenderQuoteUsd() {
  if (state.quote) renderQuote(state.quote);
}

function hideUsdDisplays() {
  state.usdPrices = null;
  hideAmountUsd();
  hideHeaderZecPrice();
  rerenderQuoteUsd();
}

/** @param {number} sourceAmount */
function renderAmountUsd(sourceAmount) {
  const usdPrice = selectedAssetUsdPrice();
  if (!usdPrice) {
    hideAmountUsd();
    return;
  }
  const sourceAsset = selectedSourceAsset();
  els.amountUsd.textContent = `≈ ${formatUsd(sourceAmount * usdPrice)} USD · 1 ${sourceAsset.symbol} = ${formatUsd(usdPrice)}`;
  els.amountUsd.hidden = false;
}

function renderUsdDisplays() {
  const ethAmount = parsePositiveAmount(els.amount.value);
  if (ethAmount === null) {
    hideAmountUsd();
  } else {
    renderAmountUsd(ethAmount);
  }
  renderHeaderZecPrice();
  rerenderQuoteUsd();
}

async function refreshUsdPrices() {
  const requestId = state.priceRequestId + 1;
  state.priceRequestId = requestId;

  try {
    const prices = await fetchUsdPrices();
    if (requestId !== state.priceRequestId) return null;
    state.usdPrices = prices;
    renderUsdDisplays();
    return prices;
  } catch (error) {
    if (requestId === state.priceRequestId) hideUsdDisplays();
    console.warn('USD pricing unavailable', error);
    return null;
  }
}

function updateAmountUsd() {
  if (state.usdPrices) renderUsdDisplays();
  else hideAmountUsd();
  return refreshUsdPrices();
}

function clearExpiryCountdown() {
  if (state.expiryTimer !== null) {
    window.clearInterval(state.expiryTimer);
    state.expiryTimer = null;
  }
}

/** @param {string} expected @returns {HTMLElement} */
function expectedZecValue(expected) {
  const value = document.createElement('b');
  value.textContent = `${expected} ZEC`;
  if (state.usdPrices) {
    const usdValue = Number(expected) * state.usdPrices.zcashUsd;
    const usd = document.createElement('small');
    usd.id = 'expected-zec-usd';
    usd.textContent = `≈ ${formatUsd(usdValue)} USD`;
    value.append(usd);
  }
  return value;
}

/** @param {number} expiryMs */
function startExpiryCountdown(expiryMs) {
  clearExpiryCountdown();
  const expiry = $('quote-expiry');
  const update = () => {
    const seconds = (expiryMs - Date.now()) / 1000;
    expiry.textContent = `${formatLocalTimestamp(new Date(expiryMs))}  ·  expires in ${countdownLabel(seconds)}`;
  };
  update();
  state.expiryTimer = window.setInterval(update, 1000);
}

/**
 * @param {string} label
 * @param {Node|string} value
 * @param {'b'|'code'} [valueTag]
 * @returns {HTMLDivElement}
 */
function quoteDetailRow(label, value, valueTag = 'b') {
  const row = document.createElement('div');
  const labelEl = document.createElement('span');
  const valueEl = document.createElement(valueTag);
  labelEl.textContent = label;
  if (typeof value === 'string') {
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
  } else {
    row.append(labelEl, value);
  }
  return row;
}

/** @param {boolean} isBusy */
function setBusy(isBusy) {
  els.quote.disabled = isBusy;
  els.send.disabled = isBusy || !state.quote;
}

/** @returns {EthereumProvider} */
function requireEthereum() {
  if (!window.ethereum) throw new Error('No injected Ethereum wallet found. Open this in MetaMask/Rabby.');
  return window.ethereum;
}

async function connectWallet(expectedChainId = selectedSourceAsset().chainId) {
  const ethereum = requireEthereum();
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  state.account = accounts[0];
  els.connect.textContent = `${state.account.slice(0, 6)}…${state.account.slice(-4)}`;
  const chainId = await ethereum.request({ method: 'eth_chainId' });
  if (chainId !== expectedChainId) {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: expectedChainId }] });
  }
  setStatus(`Wallet connected on ${selectedSourceAsset().chainLabel}.`);
}

/** @returns {MayaQuoteRequest} */
function readForm() {
  const amount = els.amount.value.trim();
  const destination = els.destination.value.trim();
  const toleranceBps = Math.round(Number(els.slippage.value || 3) * 100);
  const sourceAssetKey = selectedSourceAssetKey();
  const sourceAsset = getSourceAsset(sourceAssetKey);
  if (!sourceAsset.supported) throw new Error(sourceAsset.unsupportedReason);
  if (!amount) throw new Error(`Enter a ${sourceAsset.symbol} amount.`);
  if (!isLikelyZecAddress(destination)) {
    throw new Error('Enter a Zcash address: transparent t1/t3, unified u1, or shielded zs. Maya will perform final validation.');
  }
  if (toleranceBps < 1 || toleranceBps > 9999) throw new Error('Slippage must be between 0.01% and 99.99%.');
  return { amount, destination, sourceAssetKey, fromAddress: state.account, toleranceBps };
}

/**
 * @param {MayaQuoteRequest} form
 * @returns {Promise<MayaQuote>}
 */
async function fetchValidatedQuote(form) {
  const quote = await fetchMayaQuote(form);
  if (isBelowRecommendedMinimum(form.amount, quote)) {
    const minimum = formatMayaAmount(quote.recommended_min_amount_in);
    const sourceAsset = getSourceAsset(form.sourceAssetKey || DEFAULT_SOURCE_ASSET_KEY);
    throw new Error(`Amount is below Maya's recommended minimum for this route. Use at least about ${Number(minimum).toFixed(6)} ${sourceAsset.symbol}.`);
  }
  return quote;
}

/** @param {MayaQuote} quote */
function storeQuote(quote) {
  state.quote = quote;
  renderQuote(quote);
}

async function getQuote() {
  try {
    setBusy(true);
    setStatus('Fetching fresh Maya quote…');
    let form = readForm();
    const sourceAsset = getSourceAsset(form.sourceAssetKey);
    if (sourceAsset.type === 'erc20' && !state.account) {
      setStatus(`Connect wallet first so Maya can validate the ${sourceAsset.symbol} token route…`);
      await connectWallet(sourceAsset.chainId);
      form = readForm();
    }
    refreshUsdPrices();
    const quote = await fetchValidatedQuote(form);
    storeQuote(quote);
    els.quote.textContent = 'Refresh quote';
    setStatus('Quote ready. Expires quickly — send only from this screen.', 'ok');
  } catch (error) {
    state.quote = null;
    clearExpiryCountdown();
    els.quoteCard.hidden = true;
    els.quote.textContent = 'Get quote';
    setStatus(errorMessage(error), 'error');
  } finally {
    setBusy(false);
  }
}

/** @param {MayaQuote} quote */
function renderQuote(quote) {
  const expected = formatMayaAmount(quote.expected_amount_out);
  const outbound = formatMayaAmount(quote.fees?.outbound ?? 0);
  const total = formatMayaAmount(quote.fees?.total ?? 0);
  const expiryMs = Number(quote.expiry) * 1000;
  const rows = [
    quoteDetailRow('Expected ZEC', expectedZecValue(expected)),
    quoteDetailRow('Total fees', `${total} ZEC`),
    quoteDetailRow('ZEC outbound fee', `${outbound} ZEC`),
    quoteDetailRow('Estimated time', secondsLabel(quote.total_swap_seconds)),
    quoteDetailRow('Inbound vault', quote.inbound_address, 'code'),
    quoteDetailRow('Memo', quote.memo, 'code'),
  ];
  rows.push(
    quoteDetailRow('Expires', Object.assign(document.createElement('b'), { id: 'quote-expiry' })),
    quoteDetailRow('Submitted tx', Object.assign(document.createElement('b'), { id: 'tx-hash', textContent: 'not sent yet' })),
  );
  els.details.replaceChildren(...rows);
  els.quoteCard.hidden = false;
  startExpiryCountdown(expiryMs);
}

/** @param {unknown} hash */
function renderSubmittedTx(hash) {
  const link = document.createElement('a');
  link.href = `https://xscanner.org/transaction/${encodeURIComponent(String(hash))}`;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = String(hash);
  $('tx-hash').replaceChildren(link);
}

async function sendSwap() {
  try {
    const sourceAsset = selectedSourceAsset();
    if (!state.account) await connectWallet(sourceAsset.chainId);
    setBusy(true);
    setStatus('Refreshing quote before wallet opens…');
    const form = readForm();
    const quote = await fetchValidatedQuote(form);
    storeQuote(quote);

    if (sourceAsset.type === 'erc20') {
      const txs = buildErc20DepositTxs(quote, form.amount, form.sourceAssetKey);
      setStatus(`Approve ${sourceAsset.symbol} spend in your wallet.`);
      await requireEthereum().request({ method: 'eth_sendTransaction', params: [{ from: state.account, ...txs.approve }] });
      setStatus(`Approval submitted. Now confirm the Maya router deposit on ${sourceAsset.chainLabel}.`);
      const hash = await requireEthereum().request({ method: 'eth_sendTransaction', params: [{ from: state.account, ...txs.deposit }] });
      renderSubmittedTx(hash);
      setStatus('Swap submitted. Track the transaction on XScanner; Maya will settle native ZEC to your recipient address.', 'ok');
      return;
    }

    const tx = buildNativeTransferTx(quote, form.amount, form.sourceAssetKey);
    setStatus(`Confirm the ${sourceAsset.chainLabel} transaction in your wallet.`);
    const hash = await requireEthereum().request({ method: 'eth_sendTransaction', params: [{ from: state.account, ...tx }] });
    renderSubmittedTx(hash);
    setStatus('Swap submitted. Track the transaction on XScanner; Maya will settle native ZEC to your recipient address.', 'ok');
  } catch (error) {
    setStatus(errorMessage(error), 'error');
  } finally {
    setBusy(false);
  }
}

els.connect.addEventListener('click', () => connectWallet().catch((error) => setStatus(errorMessage(error), 'error')));
els.sourceAssets.forEach((input) => input.addEventListener('change', resetQuoteForRouteChange));
els.amount.addEventListener('input', updateAmountUsd);
els.quote.addEventListener('click', getQuote);
els.send.addEventListener('click', sendSwap);
refreshUsdPrices();
window.setInterval(refreshUsdPrices, USD_PRICE_CACHE_MS);

setStatus('Select ETH or USDC on Ethereum mainnet, enter a ZEC address, quote, then send. No wrapped ZEC. No custodial account.');
