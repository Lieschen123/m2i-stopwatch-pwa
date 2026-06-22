const SUPPORTED_USDT_NETWORKS = new Set(['ton', 'tron', 'ethereum']);

function cleanText(value, maxLength = 160) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Number(amount.toFixed(2));
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

function createPaymentUri(request) {
  const encodedRecipient = encodeURIComponent(request.recipient);
  const params = new URLSearchParams({
    asset: request.asset,
    amount: request.amount.toFixed(2),
    memo: request.memo
  });
  return `${request.network}:${encodedRecipient}?${params.toString()}`;
}

