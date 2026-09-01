import crypto from 'node:crypto';

export function reportAccessToken({ dateKey, secret }) {
  if (!dateKey || !secret) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(`ron-daily-report:${dateKey}`)
    .digest('hex')
    .slice(0, 32);
}

export function dailyReportUrl({ publicBaseUrl, dateKey, secret }) {
  const token = reportAccessToken({ dateKey, secret });
  const params = new URLSearchParams({ date: dateKey });
  if (token) params.set('token', token);
  return `${publicBaseUrl.replace(/\/$/, '')}/api/accounts/newspaper?${params.toString()}`;
}

export function isValidReportAccess({ dateKey, secret, providedToken }) {
  const expectedToken = reportAccessToken({ dateKey, secret });
  if (!expectedToken || !providedToken) return false;

  const left = Buffer.from(expectedToken);
  const right = Buffer.from(providedToken);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
