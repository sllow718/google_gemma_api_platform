import { buildPostmanCollection } from '@/lib/postman'

describe('buildPostmanCollection', () => {
  it('creates an importable collection with variables and request body', () => {
    const collection = buildPostmanCollection(
      'api-id-123',
      'https://example.com',
      'gmp_platform_key_123'
    )

    expect(collection.info.name).toContain('Gemma API Platform')
    expect(collection.item).toHaveLength(1)
    expect(collection.item[0].request.method).toBe('POST')
    expect(collection.item[0].request.url.raw).toBe('https://example.com/api/v1/api-id-123/call')
    expect(collection.item[0].request.header).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'X-API-Key', value: '{{platformApiKey}}' }),
      ])
    )
    expect(collection.variable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'configId', value: 'api-id-123' }),
        expect.objectContaining({ key: 'platformApiKey', value: 'gmp_platform_key_123' }),
      ])
    )
  })
})
