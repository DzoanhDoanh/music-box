import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';

// Operator-only bootstrap. The account must already exist and be confirmed.
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/provision-admin.mjs email@example.com');
  process.exit(1);
}
try {
  const env = parseEnv(await readFile(new URL('../.dev.vars', import.meta.url), 'utf8'));
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let account;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error('Cannot read Auth users. Check the server key.');
    account = data.users.find((user) => user.email?.toLowerCase() === email);
    if (account || data.users.length < 100) break;
  }
  if (!account) throw new Error('Account not found. Create it in Supabase Authentication first.');
  if (account.is_anonymous || !account.email_confirmed_at)
    throw new Error('Only a confirmed, non-anonymous account can become an administrator.');
  const existing = await db
    .from('system_admins')
    .select('user_id')
    .eq('user_id', account.id)
    .maybeSingle();
  if (existing.error) throw new Error('Cannot read system_admins. Apply migrations first.');
  if (!existing.data) {
    const { error } = await db.from('system_admins').insert({ user_id: account.id });
    if (error) throw new Error('Could not provision administrator.');
  }
  const verified = await db
    .from('system_admins')
    .select('user_id')
    .eq('user_id', account.id)
    .single();
  if (verified.error || !verified.data) throw new Error('Administrator verification failed.');
  console.log(
    existing.data
      ? 'PASS account was already an administrator.'
      : 'PASS confirmed account provisioned as ROOMTUNE administrator.',
  );
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'Missing .dev.vars.' : error.message);
  process.exitCode = 1;
}
