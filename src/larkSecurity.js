import crypto from 'node:crypto';

export function verifyLarkSignature({ timestamp, nonce, encryptKey, rawBody, signature }) {
  if (!timestamp || !nonce || !encryptKey || !rawBody || !signature) return false;

  const expected = crypto
    .createHash('sha256')
    .update(Buffer.concat([Buffer.from(`${timestamp}${nonce}${encryptKey}`, 'utf8'), rawBody]))
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function decryptLarkPayload(encrypt, encryptKey) {
  if (!encrypt || !encryptKey) {
    throw new Error('Encrypted Lark payload requires LARK_ENCRYPT_KEY.');
  }

  const encryptedBuffer = Buffer.from(encrypt, 'base64');
  if (encryptedBuffer.length <= 16) {
    throw new Error('Encrypted Lark payload is too short.');
  }

  const key = crypto.createHash('sha256').update(encryptKey, 'utf8').digest();
  const iv = encryptedBuffer.subarray(0, 16);
  const ciphertext = encryptedBuffer.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(plaintext.toString('utf8'));
}

export function encryptForTest(payload, encryptKey, iv = Buffer.alloc(16, 1)) {
  const key = crypto.createHash('sha256').update(encryptKey, 'utf8').digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);

  return Buffer.concat([iv, ciphertext]).toString('base64');
}

