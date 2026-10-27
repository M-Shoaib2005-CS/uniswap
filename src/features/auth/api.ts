import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

/**
 * Where email links send the student. In the installed app this is a small web page (docs/auth) that opens the app,
 * which is far more reliable than redirecting an email link straight to a custom scheme.
 * Both addresses must be listed under Supabase > Authentication > URL Configuration > Redirect URLs.
 */
export const AUTH_BRIDGE_URL = 'https://m-shoaib2005-cs.github.io/uniswap/auth/';
export const authRedirect = () => (Constants.executionEnvironment === 'storeClient' ? Linking.createURL('auth-callback') : AUTH_BRIDGE_URL);

export async function signUp(params: { email: string; password: string; fullName: string }): Promise<{ needsVerification: boolean; alreadyRegistered: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: { full_name: params.fullName }, emailRedirectTo: authRedirect() },
  });
  if (error) throw error;
  // Supabase hides whether an address exists; an empty identities list means "already registered".
  const already = !!data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
  return { needsVerification: !data.session, alreadyRegistered: already };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function resendVerification(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authRedirect() } });
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirect() });
  if (error) throw error;
}

export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
