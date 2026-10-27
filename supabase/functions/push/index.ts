// Supabase Edge Function: sends a phone push for every new row in public.notifications.
// Deploy:   supabase functions deploy push --no-verify-jwt
// Secret:   supabase secrets set PUSH_WEBHOOK_SECRET=<long random string>
// Webhook:  Dashboard > Database > Webhooks > create: table notifications, event INSERT,
//           type "Supabase Edge Functions" > push, add header  x-webhook-secret: <same string>
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to functions automatically.)
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface NotificationRow {
  user_id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('PUSH_WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const payload = (await req.json()) as { type?: string; record?: NotificationRow };
  const n = payload.record;
  if (payload.type !== 'INSERT' || !n) return new Response('ignored');

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: rows, error } = await db.from('device_tokens').select('token').eq('user_id', n.user_id);
  if (error) return new Response(error.message, { status: 500 });
  const tokens = (rows ?? []).map((r) => r.token as string);
  if (tokens.length === 0) return new Response('no devices');

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(
      tokens.map((to) => ({ to, title: n.title, body: n.body, data: n.data ?? {}, sound: null, channelId: 'default' })),
    ),
  });
  const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };

  // drop tokens Expo says no longer exist (app uninstalled)
  const dead = (out.data ?? []).map((t, i) => (t.details?.error === 'DeviceNotRegistered' ? tokens[i] : null)).filter((t): t is string => !!t);
  if (dead.length) await db.from('device_tokens').delete().in('token', dead);

  return new Response(`sent ${tokens.length}`);
});
