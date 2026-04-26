import { callGemma } from '@/lib/googleAI'

jest.mock('@google/generative-ai')

import { GoogleGenerativeAI } from '@google/generative-ai'

const mockGenerateContent = jest.fn()
const mockGetGenerativeModel = jest.fn(() => ({ generateContent: mockGenerateContent }))

beforeEach(() => {
  // resetAllMocks also flushes the once-queue, preventing cross-test leakage
  jest.resetAllMocks()
  jest.mocked(GoogleGenerativeAI).mockImplementation(
    () => ({ getGenerativeModel: mockGetGenerativeModel }) as unknown as InstanceType<typeof GoogleGenerativeAI>
  )
  mockGetGenerativeModel.mockReturnValue({ generateContent: mockGenerateContent })
})

const successResult = {
  response: {
    text: () => 'Hello from Gemma',
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 8, totalTokenCount: 13 },
  },
}

const baseConfig = { model: 'gemma-3-27b-it', systemPrompt: 'Be helpful' }

describe('callGemma', () => {
  it('returns response on successful call', async () => {
    mockGenerateContent.mockResolvedValue(successResult)

    const result = await callGemma('test-key', baseConfig, 'Hello')

    expect(result.text).toBe('Hello from Gemma')
    expect(result.finishReason).toBe('STOP')
    expect(result.totalTokenCount).toBe(13)
  })

  it('retries without systemInstruction when model does not support developer instructions', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('Developer instruction is not enabled for models/gemma-3-1b-it'))
      .mockResolvedValueOnce(successResult)

    const result = await callGemma('test-key', { ...baseConfig, model: 'gemma-3-1b-it' }, 'Hello')

    expect(result.text).toBe('Hello from Gemma')
    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(2)
    // Second call must not include systemInstruction
    expect(mockGetGenerativeModel).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({ systemInstruction: expect.anything() })
    )
  })

  it('throws UPSTREAM_ERROR for other API errors', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API quota exceeded'))

    await expect(callGemma('test-key', baseConfig, 'Hello')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    })
  })
})
