import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyReportUrl, isValidReportAccess, reportAccessToken } from '../src/reportAccess.js';

test('creates and validates date-specific report access tokens', () => {
  const token = reportAccessToken({ dateKey: '2026-09-01', secret: 'secret' });

  assert.equal(token.length, 32);
  assert.equal(isValidReportAccess({ dateKey: '2026-09-01', secret: 'secret', providedToken: token }), true);
  assert.equal(isValidReportAccess({ dateKey: '2026-09-02', secret: 'secret', providedToken: token }), false);
});

test('adds token to daily report URL', () => {
  const url = dailyReportUrl({
    publicBaseUrl: 'https://ron.example.com/',
    dateKey: '2026-09-01',
    secret: 'secret',
  });

  assert.match(url, /^https:\/\/ron\.example\.com\/api\/accounts\/newspaper\?date=2026-09-01&token=/);
});
