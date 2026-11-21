import assert from 'node:assert/strict';
import test from 'node:test';
import { ReverseGeocoder } from '../apps/attendance-service/src/location/reverse-geocoder.ts';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('reverse geocoder resolves a readable Indonesian address through a fixed provider endpoint', async () => {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: new URL(String(input)), headers: new Headers(init?.headers) });
    return response({ display_name: 'Jalan Sudirman 10, Jakarta Selatan, DKI Jakarta, Indonesia' });
  };
  const geocoder = new ReverseGeocoder(fetcher as typeof fetch, async () => undefined, () => 1000);
  const result = await geocoder.reverse(-6.20, 106.82);
  assert.equal(result, 'Jalan Sudirman 10, Jakarta Selatan, DKI Jakarta, Indonesia');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.origin, 'https://nominatim.openstreetmap.org');
  assert.equal(calls[0]?.url.pathname, '/reverse');
  assert.equal(calls[0]?.url.searchParams.get('accept-language'), 'id');
  assert.equal(calls[0]?.url.searchParams.get('format'), 'jsonv2');
  assert.match(calls[0]?.headers.get('user-agent') ?? '', /CompanyPlatform/i);
});

test('reverse geocoder sanitizes multiline provider data and reuses cached results', async () => {
  let calls = 0;
  const fetcher = async (): Promise<Response> => {
    calls += 1;
    return response({ display_name: '  Jalan Mawar\n 5,  Bandung\t, Indonesia  ' });
  };
  const geocoder = new ReverseGeocoder(fetcher as typeof fetch, async () => undefined, () => 1000);
  assert.equal(await geocoder.reverse(-6.9, 107.6), 'Jalan Mawar 5, Bandung , Indonesia');
  assert.equal(await geocoder.reverse(-6.9, 107.6), 'Jalan Mawar 5, Bandung , Indonesia');
  assert.equal(calls, 1);
});

test('reverse geocoder does not fabricate addresses on provider failure or empty result', async () => {
  const down = new ReverseGeocoder((async () => response({ error: 'not found' }, 404)) as typeof fetch);
  assert.equal(await down.reverse(-6.2, 106.8), null);
  const missing = new ReverseGeocoder((async () => response({ display_name: '' })) as typeof fetch);
  assert.equal(await missing.reverse(-6.2, 106.8), null);
});

test('reverse geocoder spaces uncached requests to respect the one-per-second public limit', async () => {
  let time = 1000;
  const delays: number[] = [];
  const fetcher = async (): Promise<Response> => response({ display_name: 'DKI Jakarta, Indonesia' });
  const sleep = async (ms: number): Promise<void> => { delays.push(ms); time += ms; };
  const geocoder = new ReverseGeocoder(fetcher as typeof fetch, sleep, () => time);
  await geocoder.reverse(-6.2, 106.8);
  await geocoder.reverse(-6.3, 106.9);
  assert.deepEqual(delays, [1000]);
});
