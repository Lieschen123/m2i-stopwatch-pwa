import { sha256Hex } from './crypto.js';

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

export function createPaymentReferenceSuffix({ challengeId = '', challengeCode = '', createdAt = '', request = null } = {}) {
  const seed = [
    cleanText(challengeId, 180),
    cleanText(challengeCode, 80),
    cleanText(createdAt, 32),
    request?.asset || '',
    request?.network || '',
    request?.recipient || '',
    request?.amount || '',
    request?.amount_sats || ''
  ].join('|');
  return sha256Hex(seed).slice(0, 16);
}

function referenceHasSuffix(reference) {
  return /^[^:]+:.+/.test(String(reference || ''));
}

function createReference(challengeCode, referenceSuffix) {
  return cleanText(`${challengeCode || 'M2I'}:${String(referenceSuffix || '').slice(0, 16)}`, 120);
}

function paymentRequestText(request) {
  if (request.asset === 'USDt') {
    return [
      request.instruction,
      'Only due if final review says the challenge was missed. If complete, no payment is due.',
      `Reference: ${request.reference}`,
      `Memo: ${request.memo}`,
      'Manual settlement only. M2I never holds funds, pays automatically, or monitors settlement.'
    ].join('\n');
  }
  return [
    request.instruction,
    request.recipient ? `Team jar / recipient address or invoice: ${request.recipient}` : '',
    request.payment_uri ? `Payment URI: ${request.payment_uri}` : '',
    'Only due if final review says the challenge was missed. If complete, no payment is due.',
    `Reference: ${request.reference}`,
    `Memo: ${request.memo}`,
    'Manual settlement only. M2I never holds funds, pays automatically, or monitors settlement.'
  ].filter(Boolean).join('\n');
}

function withPaymentRequestText(request) {
  const next = {
    ...request,
    memo: `M2I ${request.reference}`
  };
  if (next.asset === 'USDt') next.payment_uri = createPaymentUri(next);
  next.request_text = paymentRequestText(next);
  return next;
}

export function normalizePaymentRequestReference(request, { challengeCode, challengeId, createdAt, referenceSuffix } = {}) {
  if (!request) return null;
  const currentReference = String(request.reference || '');
  const currentSuffix = referenceHasSuffix(currentReference) ? currentReference.split(':').slice(1).join(':') : '';
  const hasChallengeContext = Boolean(challengeId || createdAt);
  const suffix = cleanText(
    referenceSuffix || (hasChallengeContext ? createPaymentReferenceSuffix({ challengeId, challengeCode, createdAt, request }) : currentSuffix) || createPaymentReferenceSuffix({ challengeId, challengeCode, createdAt, request }),
    32
  );
  const reference = createReference(challengeCode || currentReference.split(':')[0] || 'M2I', suffix);
  if (request.reference === reference && request.memo === `M2I ${reference}` && request.request_text?.includes(`Reference: ${reference}`)) return request;
  return withPaymentRequestText({ ...request, reference });
}

export function normalizePaymentRequests(paymentRequests = [], context = {}) {
  return paymentRequests.map((request) => normalizePaymentRequestReference(request, context)).filter(Boolean);
}

export function createUsdtPaymentRequest({ amount, recipient, network = 'ton', challengeCode, claimHash, referenceSuffix }) {
  const normalizedAmount = normalizeAmount(amount);
  const normalizedNetwork = cleanText(network, 24).toLowerCase();
  const cleanRecipient = cleanText(recipient, 220);
  if (!normalizedAmount || !cleanRecipient || !SUPPORTED_USDT_NETWORKS.has(normalizedNetwork)) return null;

  const reference = createReference(challengeCode, referenceSuffix || claimHash);
  const request = {
    asset: 'USDt',
    amount: normalizedAmount,
    network: normalizedNetwork,
    recipient: cleanRecipient,
    reference,
    custody: 'user-paid',
    instruction: `Stake if missed: ${normalizedAmount.toFixed(2)} USDt on ${normalizedNetwork.toUpperCase()} to ${cleanRecipient}`,
    memo: `M2I ${reference}`,
    settlement_model: 'payment-request-only'
  };

  return withPaymentRequestText(request);
}

export function createSatsPaymentRequest({ amountSats, recipient, paymentUri, instructions, challengeCode, claimHash, referenceSuffix }) {
  const sats = normalizeSats(amountSats);
  const cleanRecipient = cleanText(recipient, 320);
  const cleanPaymentUri = cleanText(paymentUri, 520);
  const cleanInstructions = cleanText(instructions, 800);
  if (!sats && !cleanRecipient && !cleanPaymentUri && !cleanInstructions) return null;

  const reference = createReference(challengeCode, referenceSuffix || claimHash);
  const instruction = cleanInstructions || [
    sats ? `Stake if missed: ${sats} sats` : 'Stake if missed: sats',
    cleanRecipient ? `to team jar / recipient ${cleanRecipient}` : '',
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

  return withPaymentRequestText({ ...request, payment_uri: cleanPaymentUri });
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
