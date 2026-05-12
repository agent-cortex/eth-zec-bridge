import {
  buildEthTransferTx,
  fetchMayaQuote,
  formatMayaAmount,
  isBelowRecommendedMinimum,
  isLikelyZecAddress,
  secondsLabel,
} from './maya.js';

const $ = (id) => document.getElementById(id);
const state = { account: null, quote: null, lastAmount: null };

const els = {
  connect: $('connect'),
  quote: $('quote'),
  send: $('send'),
  amount: $('amount'),
  destination: $('destination'),
  slippage: $('slippage'),
  status: $('status'),
  quoteCard: $('quote-card'),
  details: $('details'),
  txHash: $('tx-hash'),
};

function setStatus(message, tone = 'info') {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

function setBusy(isBusy) {
  els.quote.disabled = isBusy;
  els.send.disabled = isBusy || !state.quote;
}

function requireEthereum() {
  if (!window.ethereum) throw new Error('No injected Ethereum wallet found. Open this in MetaMask/Rabby.');
  return window.ethereum;
}

async function connectWallet() {
  const ethereum = requireEthereum();
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  state.account = accounts[0];
  els.connect.textContent = `${state.account.slice(0, 6)}…${state.account.slice(-4)}`;
  const chainId = await ethereum.request({ method: 'eth_chainId' });
  if (chainId !== '0x1') {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] });
  }
  setStatus('Wallet connected on Ethereum mainnet.');
}

function readForm() {
  const amount = els.amount.value.trim();
  const destination = els.destination.value.trim();
  const toleranceBps = Math.round(Number(els.slippage.value || 3) * 100);
  if (!amount) throw new Error('Enter an ETH amount.');
  if (!isLikelyZecAddress(destination)) {
    throw new Error('Enter a Zcash address: transparent t1/t3, unified u1, or shielded zs. Maya will perform final validation.');
  }
  if (toleranceBps < 1 || toleranceBps > 9999) throw new Error('Slippage must be between 0.01% and 99.99%.');
  return { amount, destination, toleranceBps };
}

async function getQuote() {
  try {
    setBusy(true);
    setStatus('Fetching fresh Maya quote…');
    const form = readForm();
    const quote = await fetchMayaQuote(form);
    if (isBelowRecommendedMinimum(form.amount, quote)) {
      const minimum = formatMayaAmount(quote.recommended_min_amount_in);
      throw new Error(`Amount is below Maya's recommended minimum for this route. Use at least ${minimum} ETH-equivalent quote units, currently about ${Number(minimum).toFixed(6)} ETH.`);
    }
    state.quote = quote;
    state.lastAmount = form.amount;
    renderQuote(quote);
    setStatus('Quote ready. It expires quickly; send only from this screen.', 'ok');
  } catch (error) {
    state.quote = null;
    els.quoteCard.hidden = true;
    setStatus(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function renderQuote(quote) {
  const expected = formatMayaAmount(quote.expected_amount_out);
  const outbound = formatMayaAmount(quote.fees?.outbound || 0);
  const total = formatMayaAmount(quote.fees?.total || 0);
  els.details.innerHTML = `
    <div><span>Expected ZEC</span><b>${expected} ZEC</b></div>
    <div><span>Total fees</span><b>${total} ZEC</b></div>
    <div><span>ZEC outbound fee</span><b>${outbound} ZEC</b></div>
    <div><span>Estimated time</span><b>${secondsLabel(quote.total_swap_seconds)}</b></div>
    <div><span>Inbound vault</span><code>${quote.inbound_address}</code></div>
    <div><span>Memo</span><code>${quote.memo}</code></div>
    <div><span>Expires</span><b>${new Date(Number(quote.expiry) * 1000).toLocaleString()}</b></div>
  `;
  els.quoteCard.hidden = false;
}

async function sendSwap() {
  try {
    if (!state.account) await connectWallet();
    setBusy(true);
    setStatus('Refreshing quote before wallet opens…');
    const form = readForm();
    const quote = await fetchMayaQuote(form);
    if (isBelowRecommendedMinimum(form.amount, quote)) {
      const minimum = formatMayaAmount(quote.recommended_min_amount_in);
      throw new Error(`Amount is below Maya's recommended minimum for this route. Use at least ${minimum} ETH-equivalent quote units, currently about ${Number(minimum).toFixed(6)} ETH.`);
    }
    state.quote = quote;
    state.lastAmount = form.amount;
    renderQuote(quote);

    const tx = buildEthTransferTx(quote, form.amount);
    setStatus('Confirm the ETH mainnet transaction in your wallet.');
    const hash = await requireEthereum().request({ method: 'eth_sendTransaction', params: [{ from: state.account, ...tx }] });
    els.txHash.innerHTML = `<a href="https://etherscan.io/tx/${hash}" target="_blank" rel="noreferrer">${hash}</a>`;
    setStatus('Swap submitted. Track the inbound tx on Etherscan; Maya will settle native ZEC to your transparent address.', 'ok');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

els.connect.addEventListener('click', () => connectWallet().catch((error) => setStatus(error.message, 'error')));
els.quote.addEventListener('click', getQuote);
els.send.addEventListener('click', sendSwap);

setStatus('Connect wallet, enter a ZEC address, quote, then send. No wrapped tokens. No custodial account.');
