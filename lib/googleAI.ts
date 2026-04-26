// Google Generative AI SDK wrapper

export interface GemmaResponse {
  text: string
  model: string
  finishReason: string
  promptTokenCount: number
  responseTokenCount: number
  totalTokenCount: number
  latencyMs: number
}

export interface GemmaModel {
  id: string
  displayName: string
  inputTokenLimit: number
  outputTokenLimit: number
}

export async function callGemma(
  _apiKey: string,
  _config: object,
  _prompt: string
): Promise<GemmaResponse> {
  throw new Error('Not implemented')
}

export async function listGemmaModels(_apiKey: string): Promise<GemmaModel[]> {
  throw new Error('Not implemented')
}
