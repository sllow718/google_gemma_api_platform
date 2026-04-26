// Zod schemas for all request bodies and env vars
import { z } from 'zod'

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[0-9]/, 'Must contain digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  name: z.string().min(2).max(100),
})

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const CreateApiSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  topK: z.number().int().positive().nullable().optional(),
  maxOutputTokens: z.number().int().min(1).max(8192).nullable().optional(),
  stopSequences: z.array(z.string()).optional(),
  safetySettings: z.array(z.object({ category: z.string(), threshold: z.string() })).optional(),
  systemPrompt: z.string().optional(),
})

export const UpdateApiSchema = CreateApiSchema.partial()

export const CallApiSchema = z.object({
  prompt: z.string().min(1).max(32000),
  overrides: z
    .object({
      temperature: z.number().min(0).max(2).nullable().optional(),
      maxOutputTokens: z.number().int().min(1).max(8192).nullable().optional(),
    })
    .optional(),
})

export const AddApiKeySchema = z.object({
  apiKey: z.string().min(1),
})

export const EnvSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_SECRET: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SHARED_TIER_DAILY_LIMIT: z.coerce.number().int().positive().default(50),
  NEXT_PUBLIC_APP_URL: z.string().url(),
})
