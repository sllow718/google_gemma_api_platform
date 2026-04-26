import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type GenerationConfig,
} from '@google/generative-ai'
import type { SafetySetting } from '@/lib/types'

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

export interface GemmaCallConfig {
  model: string
  temperature?: number | null
  topP?: number | null
  topK?: number | null
  maxOutputTokens?: number | null
  stopSequences?: string[]
  safetySettings?: SafetySetting[]
  systemPrompt?: string
}

export class GoogleAIError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'GoogleAIError'
    this.code = code
  }
}

export async function callGemma(
  apiKey: string,
  config: GemmaCallConfig,
  prompt: string
): Promise<GemmaResponse> {
  return _callGemma(apiKey, config, prompt, config.systemPrompt)
}

function mergeSystemPrompt(systemPrompt: string, prompt: string): string {
  return `System instruction:\n${systemPrompt}\n\nUser prompt:\n${prompt}`
}

async function _callGemma(
  apiKey: string,
  config: GemmaCallConfig,
  prompt: string,
  systemPrompt: string | undefined
): Promise<GemmaResponse> {
  const genAI = new GoogleGenerativeAI(apiKey)

  const generationConfig: GenerationConfig = {}
  if (config.temperature != null) generationConfig.temperature = config.temperature
  if (config.topP != null) generationConfig.topP = config.topP
  if (config.topK != null) generationConfig.topK = config.topK
  if (config.maxOutputTokens != null) generationConfig.maxOutputTokens = config.maxOutputTokens
  if (config.stopSequences?.length) generationConfig.stopSequences = config.stopSequences

  const model = genAI.getGenerativeModel({
    model: config.model,
    generationConfig,
    safetySettings: config.safetySettings?.map((s) => ({
      category: s.category as HarmCategory,
      threshold: s.threshold as HarmBlockThreshold,
    })),
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
  })

  const start = Date.now()
  try {
    const result = await model.generateContent(prompt)
    const latencyMs = Date.now() - start
    const response = result.response
    const candidate = response.candidates?.[0]
    const usage = response.usageMetadata

    return {
      text: response.text(),
      model: config.model,
      finishReason: candidate?.finishReason ?? 'STOP',
      promptTokenCount: usage?.promptTokenCount ?? 0,
      responseTokenCount: usage?.candidatesTokenCount ?? 0,
      totalTokenCount: usage?.totalTokenCount ?? 0,
      latencyMs,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (systemPrompt && msg.includes('Developer instruction is not enabled')) {
      return _callGemma(apiKey, config, mergeSystemPrompt(systemPrompt, prompt), undefined)
    }
    throw new GoogleAIError('UPSTREAM_ERROR', msg)
  }
}

let _modelsCache: { data: GemmaModel[]; expiresAt: number } | null = null
const MODELS_CACHE_TTL = 60 * 60 * 1000

interface RawModel {
  name: string
  displayName?: string
  inputTokenLimit?: number
  outputTokenLimit?: number
  supportedGenerationMethods?: string[]
}

export async function listGemmaModels(apiKey: string): Promise<GemmaModel[]> {
  if (_modelsCache && Date.now() < _modelsCache.expiresAt) return _modelsCache.data
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  let data: { models?: RawModel[] }
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new GoogleAIError('UPSTREAM_ERROR', `HTTP ${res.status}`)
    }
    data = (await res.json()) as { models?: RawModel[] }
  } catch (err) {
    if (err instanceof GoogleAIError) throw err
    throw new GoogleAIError('UPSTREAM_ERROR', err instanceof Error ? err.message : String(err))
  }

  const models = (data.models ?? [])
    .filter(
      (m) =>
        m.name.toLowerCase().includes('gemma') &&
        (m.supportedGenerationMethods ?? []).includes('generateContent')
    )
    .map((m) => ({
      id: m.name.replace(/^models\//, ''),
      displayName: m.displayName ?? m.name,
      inputTokenLimit: m.inputTokenLimit ?? 0,
      outputTokenLimit: m.outputTokenLimit ?? 0,
    }))
  _modelsCache = { data: models, expiresAt: Date.now() + MODELS_CACHE_TTL }
  return models
}
