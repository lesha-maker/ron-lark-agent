import crypto from 'node:crypto';

export function verifyWhatsAppSignature({ appSecret, signature, rawBody }) {
  if (!appSecret) return true;
  if (!signature?.startsWith('sha256=')) return false;

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const received = signature.slice('sha256='.length);

  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(received, 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
