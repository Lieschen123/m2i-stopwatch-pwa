const SUPPORTED_USDT_NETWORKS = new Set(['ton', 'tron', 'ethereum']);

function cleanText(value, maxLength = 160) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Number(amount.toFixed(2));
}

function normalizeSats(value) {
  if (value === '' || value === null || value === undefined) return null;
  const sats = Number(value);
  if (!Number.isSafeInteger(sats) || sats <= 0) return null;
  return sats;
}

export function createUsdtPaymentRequest({ amount, recipient, network = 'ton', challengeCode, claimHash }) {
  const normalizedAmount = normalizeAmount(amount);
  const normalizedNetwork = cleanText(network, 24).toLowerCase();
  const cleanRecipient = cleanText(recipient, 220);
  if (!normalizedAmount || !cleanRecipient || !SUPPORTED_USDT_NETWORKS.has(normalizedNetwork)) return null;

  const reference = cleanText(`${challengeCode || 'M2I'}:${String(claimHash || '').slice(0, 16)}`, 120);
  const request = {
    asset: 'USDt',
    amount: normalizedAmount,
    network: normalizedNetwork,
    recipient: cleanRecipient,
    reference,
    custody: 'user-paid',
    instruction: `Pay ${normalizedAmount.toFixed(2)} USDt on ${normalizedNetwork.toUpperCase()} to ${cleanRecipient}`,
    memo: `M2I ${reference}`,
    settlement_model: 'payment-request-only'
  };

  return {
    ...request,
    payment_uri: createPaymentUri(request),
    request_text: [
      request.instruction,
      `Reference: ${request.reference}`,
      `Memo: ${request.memo}`,
      'M2I does not custody funds or initiate this payment.'
    ].join('\n')
  };
}

export function createSatsPaymentRequest({ amountSats, recipient, paymentUri, instructions, challengeCode, claimHash }) {
  const sats = normalizeSats(amountSats);
  const cleanRecipient = cleanText(recipient, 320);
  const cleanPaymentUri = cleanText(paymentUri, 520);
  const cleanInstructions = cleanText(instructions, 800);
  if (!sats && !cleanRecipient && !cleanPaymentUri && !cleanInstructions) return null;

  const reference = cleanText(`${challengeCode || 'M2I'}:${String(claimHash || '').slice(0, 16)}`, 120);
  const instruction = cleanInstructions || [
    sats ? `Pay ${sats} sats` : 'Pay sats',
    cleanRecipient ? `to ${cleanRecipient}` : '',
    'using your own Lightning or Bitcoin wallet'
  ].filter(Boolean).join(' ');
  const request = {
    asset: 'sats',
    amount_sats: sats,
    network: cleanPaymentUri.toLowerCase().startsWith('bitcoin:') ? 'bitcoin' : 'lightning',
    recipient: cleanRecipient,
    reference,
    custody: 'user-paid',
    instruction,
    memo: `M2I ${reference}`,
    settlement_model: 'payment-request-only'
  };

  return {
    ...request,
    payment_uri: cleanPaymentUri,
    request_text: [
      request.instruction,
      cleanRecipient ? `Address / invoice: ${cleanRecipient}` : '',
      cleanPaymentUri ? `Payment URI: ${cleanPaymentUri}` : '',
      `Reference: ${request.reference}`,
      `Memo: ${request.memo}`,
      'M2I does not custody funds, connect to your wallet, monitor settlement, or initiate this payment.'
    ].filter(Boolean).join('\n')
  };
}

function createPaymentUri(request) {
  const encodedRecipient = encodeURIComponent(request.recipient);
  const params = new URLSearchParams({
    asset: request.asset,
    amount: request.amount.toFixed(2),
    memo: request.memo
  });
  return `${request.network}:${encodedRecipient}?${params.toString()}`;
}
