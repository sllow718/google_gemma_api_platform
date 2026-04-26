type PostmanCollection = {
  info: {
    name: string
    schema: string
    description: string
  }
  item: Array<{
    name: string
    request: {
      method: string
      header: Array<{ key: string; value: string }>
      body: {
        mode: 'raw'
        raw: string
      }
      url: {
        raw: string
        host: string[]
        path: string[]
      }
    }
    response: unknown[]
  }>
  variable: Array<{
    key: string
    value: string
    type: string
  }>
}

export function buildPostmanCollection(configId: string, baseUrl: string, platformApiKey: string): PostmanCollection {
  const rawUrl = `${baseUrl}/api/v1/${configId}/call`

  return {
    info: {
      name: 'Gemma API Platform - Quickstart',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description:
        'Import this collection into Postman, set your variables, and send a call to your saved Gemma configuration.',
    },
    item: [
      {
        name: 'Call saved Gemma API',
        request: {
          method: 'POST',
          header: [
            { key: 'Content-Type', value: 'application/json' },
            { key: 'X-API-Key', value: '{{platformApiKey}}' },
          ],
          body: {
            mode: 'raw',
            raw: JSON.stringify(
              {
                prompt: 'Your prompt here',
                overrides: {
                  temperature: 0.7,
                  maxOutputTokens: 1024,
                },
              },
              null,
              2
            ),
          },
          url: {
            raw: rawUrl,
            host: ['{{baseUrl}}'],
            path: ['api', 'v1', '{{configId}}', 'call'],
          },
        },
        response: [],
      },
    ],
    variable: [
      { key: 'baseUrl', value: baseUrl, type: 'string' },
      { key: 'configId', value: configId, type: 'string' },
      { key: 'platformApiKey', value: platformApiKey, type: 'string' },
    ],
  }
}
