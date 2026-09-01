import crypto from 'node:crypto';

function timingSafeEqualString(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifySlackSignature({
  signingSecret,
  timestamp,
  signature,
  rawBody,
  toleranceSeconds = 300,
}) {
  if (!signingSecret || !timestamp || !signature || !rawBody) return false;

  const requestTime = Number(timestamp);
  if (!Number.isFinite(requestTime)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTime) > toleranceSeconds) return false;

  const baseString = `v0:${timestamp}:${rawBody.toString('utf8')}`;
  const expected = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(baseString, 'utf8')
    .digest('hex')}`;

  return timingSafeEqualString(expected, signature);
}
