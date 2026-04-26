import { encrypt, decrypt } from '@/lib/encrypt'

describe('encrypt', () => {
  it('round-trip: encrypt then decrypt returns original plaintext', () => {
    const plaintext = 'AIzaSy-my-secret-google-api-key-12345678'
    const { encryptedKey, iv } = encrypt(plaintext)
    expect(decrypt(encryptedKey, iv)).toBe(plaintext)
  })

  it('two encryptions of same string produce different IVs', () => {
    const plaintext = 'same-input-string'
    const first = encrypt(plaintext)
    const second = encrypt(plaintext)
    expect(first.iv).not.toBe(second.iv)
    expect(first.encryptedKey).not.toBe(second.encryptedKey)
  })

  it('decryption with wrong ENCRYPTION_SECRET throws', () => {
    const { encryptedKey, iv } = encrypt('secret-value')
    const original = process.env.ENCRYPTION_SECRET
    process.env.ENCRYPTION_SECRET = Buffer.from('wrong-key-wrong-key-wrong-key-xx').toString('base64')
    try {
      expect(() => decrypt(encryptedKey, iv)).toThrow()
    } finally {
      process.env.ENCRYPTION_SECRET = original
    }
  })

  it('decryption with tampered ciphertext throws (GCM auth tag fails)', () => {
    const { encryptedKey, iv } = encrypt('another-secret')
    const tampered = Buffer.from(encryptedKey, 'base64')
    tampered[tampered.length - 1] ^= 0xff
    expect(() => decrypt(tampered.toString('base64'), iv)).toThrow()
  })
})
