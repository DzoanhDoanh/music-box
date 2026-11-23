import { test, expect } from '@playwright/test';
import { defaultRaceConfig } from '../../src/shared/duck-race/contracts';
import { attach, command, setup, advance, path } from './fixture';

test.beforeEach(setup);

test('all racers keep moving through jittery polls, then reconnect and verify the same finish', async ({
  page,
  context,
}, info) => {
  await attach(context, 0, [180, 1200, 300, 1500, 200, 900, 1700, 250]);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const created = await command({
    action: 'create',
    name: 'Đua liên tục',
    config: { ...defaultRaceConfig, mode: 'CUSTOM', duration: 60 },
    entries: Array.from({ length: 12 }, (_, i) => ({
      name: 'Vịt ' + (i + 1),
      skin: 'YELLOW',
      team: '',
    })),
  });
  const id = created.race!.id;
  await command({ action: 'start' }, id);
  await advance(id, 12000);
  await page.goto(path + '/' + id);
  const desktop = info.project.name === 'desktop';
  const canvas = page.locator('.duck-stage canvas');
  if (desktop) await expect(canvas).toHaveAttribute('data-performance', /positions/);
  else await expect(page.getByLabel('Cuộc đua 2D')).toBeVisible();
  const samples: { positions: number[]; elapsed: number }[] = [];
  for (let i = 0; i < (desktop ? 5 : 40); i++) {
    const sample = desktop
      ? await canvas.evaluate((element) => {
          const data = JSON.parse((element as HTMLCanvasElement).dataset.performance!);
          return { positions: data.positions as number[], elapsed: data.raceElapsed as number };
        })
      : await page.locator('.duck-stage').evaluate((element) => ({
          positions: [...element.querySelectorAll<HTMLElement>('.duck-flat-lane i')].map((duck) =>
            parseFloat(duck.style.left),
          ),
          elapsed: parseFloat(element.querySelector('.duck-pill small')!.textContent!),
        }));
    samples.push(sample);
    expect(sample.positions).toHaveLength(12);
    await expect(page.locator('.duck-stage-top')).not.toContainText('ĐANG CHỜ DỮ LIỆU');
    await page.waitForTimeout(desktop ? 2800 : 250);
  }
  for (let i = 1; i < samples.length; i++) {
    expect(samples[i].elapsed).toBeGreaterThan(samples[i - 1].elapsed);
    samples[i].positions.forEach((p, j) =>
      expect(p, `duck ${j}, sample ${i}`).toBeGreaterThan(samples[i - 1].positions[j]),
    );
  }
  await info.attach('live-movement-samples', {
    body: JSON.stringify(samples),
    contentType: 'application/json',
  });
  await page
    .locator('.duck-stage')
    .screenshot({ path: `test-results/duck/movement-${info.project.name}.png` });
  await context.setOffline(true);
  await expect(page.locator('.duck-stage-top')).toContainText('ĐANG CHỜ DỮ LIỆU', {
    timeout: 12000,
  });
  await context.setOffline(false);
  await expect(page.locator('.duck-stage-top')).not.toContainText('ĐANG CHỜ DỮ LIỆU', {
    timeout: 15000,
  });
  await advance(id, 70000);
  await expect(page.getByRole('heading', { name: 'Bảng về đích' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Kiểm chứng cuộc đua' }).click();
  await expect(
    page.getByText('Cam kết, đội hình và thứ hạng đều khớp.', { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
