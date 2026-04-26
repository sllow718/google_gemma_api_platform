import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const AUTH_TAG_BYTES = 16
const IV_BYTES = 12

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) throw new Error('ENCRYPTION_SECRET not set')
  return Buffer.from(secret, 'base64')
}

export function encrypt(plaintext: string): { encryptedKey: string; iv: string } {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const combined = Buffer.concat([authTag, encrypted])
  return {
    encryptedKey: combined.toString('base64'),
    iv: iv.toString('base64'),
  }
}

export function decrypt(encryptedKey: string, iv: string): string {
  const key = getKey()
  const ivBuf = Buffer.from(iv, 'base64')
  const combined = Buffer.from(encryptedKey, 'base64')
  const authTag = combined.subarray(0, AUTH_TAG_BYTES)
  const encrypted = combined.subarray(AUTH_TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, key, ivBuf)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
