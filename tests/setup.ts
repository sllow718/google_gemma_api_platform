// Load test env vars before any test module is imported
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.ENCRYPTION_SECRET = Buffer.from('test-encryption-secret-32-bytes!').toString('base64')
process.env.SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-service-role-key'
process.env.GOOGLE_API_KEY = 'test-google-api-key'
process.env.SHARED_TIER_DAILY_LIMIT = '50'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
