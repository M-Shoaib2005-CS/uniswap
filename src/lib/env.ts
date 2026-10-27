export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const ALLOWED_EMAIL_DOMAIN = process.env.EXPO_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? 'student.uet.edu.pk';
export const PRIVACY_POLICY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and restart with: npx expo start -c',
  );
}
