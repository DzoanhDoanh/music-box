import { expect, type BrowserContext } from '@playwright/test';
import { gameFixture, fakeMusic, ids, room } from '../game-e2e/fixture';
import type { DuckSnapshot } from '../../src/shared/duck-race/contracts';
export const bridge = 'http://127.0.0.1:55443';
export const path = `/room/${room}/games/duck-race`;
export async function setup() {
  expect((await fetch(bridge + '/setup', { method: 'POST' })).ok).toBe(true);
}
export async function advance(race: string, elapsed: number) {
  expect(
    (await fetch(bridge + '/time', { method: 'POST', body: JSON.stringify({ race, elapsed }) })).ok,
  ).toBe(true);
}
export async function command(body: unknown, race = '', actor = ids[0]): Promise<DuckSnapshot> {
  const response = await fetch(bridge + '/duck-race' + (race ? '/' + race : ''), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fixture-actor': actor,
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  expect(response.ok, JSON.stringify(result)).toBe(true);
  return result;
}
export async function attach(context: BrowserContext, index = 0, readLatencies: number[] = []) {
  const fixture = gameFixture();
  await fixture.attach(context, index);
  await fakeMusic(context);
  let reads = 0;
  await context.route('**/api/v1/rooms/*/duck-race**', async (route) => {
    const request = route.request(),
      part = new URL(request.url()).pathname.split('/duck-race')[1];
    const latency =
      request.method() === 'GET' && readLatencies.length
        ? readLatencies[reads++ % readLatencies.length]
        : 0;
    if (latency) await new Promise((resolve) => setTimeout(resolve, latency * 0.3));
    const response = await fetch(bridge + '/duck-race' + part, {
      method: request.method(),
      headers: {
        'content-type': 'application/json',
        'x-fixture-actor': ids[index],
        'idempotency-key': request.headers()['idempotency-key'] ?? crypto.randomUUID(),
      },
      body: request.postData() ?? undefined,
    });
    if (latency) await new Promise((resolve) => setTimeout(resolve, latency * 0.7));
    await route.fulfill({
      status: response.status,
      body: await response.text(),
      contentType: 'application/json',
    });
  });
  return fixture;
}
