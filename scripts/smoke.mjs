const base = process.env.APP_BASE_URL;
if (!base) throw new Error('Set APP_BASE_URL to the deployment to verify.');
for (const path of ['/', '/join', '/api/v1/system/health']) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  if (path.endsWith('/health')) {
    const health = await response.json();
    if (health.status !== 'configured') throw new Error('Backend configuration missing');
  }
  console.log(`PASS ${path}`);
}
console.log('HTTP smoke only; playback and authenticated flows require separate verification.');
