import { describe, expect, it, vi } from 'vitest';
import { LinkError, MAX_HOPS, resolveMapLink } from '@/features/admin-settings/resolve-link';

const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

describe('P2B-02-06 short links', () => {
  it('follows redirects by hand and reads coordinates from the final Location', async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
      if (url.startsWith('https://maps.app.goo.gl/')) return redirect('https://www.google.com/maps/place/Wat/@18.8048,98.9217,17z/data=!3d18.8048!4d98.9217');
      throw new Error(`unexpected fetch ${url}`);
    });
    expect(await resolveMapLink('วัดสุเทพ https://maps.app.goo.gl/AbCd123', fetchMock)).toEqual({ lat: 18.8048, lng: 98.9217 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('follows two hops through allowed hosts', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith('https://goo.gl/') ? redirect('https://maps.app.goo.gl/x') : redirect('https://www.google.com/maps?q=18.79,98.98'),
    );
    expect(await resolveMapLink('https://goo.gl/maps/abc', fetchMock)).toEqual({ lat: 18.79, lng: 98.98 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not touch the network when the link already has coordinates', async () => {
    const fetchMock = vi.fn();
    expect(await resolveMapLink('https://www.google.com/maps/@18.8,98.9,15z', fetchMock)).toEqual({ lat: 18.8, lng: 98.9 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses other hosts, http and ports without fetching', async () => {
    const fetchMock = vi.fn();
    for (const bad of ['https://evil.com/maps', 'http://maps.app.goo.gl/x', 'https://169.254.169.254/latest', 'https://maps.app.goo.gl:8443/x', 'https://user:pw@maps.app.goo.gl/x']) {
      await expect(resolveMapLink(bad, fetchMock)).rejects.toMatchObject({ code: 'link_not_allowed' });
    }
    await expect(resolveMapLink('no link here', fetchMock)).rejects.toBeInstanceOf(LinkError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a redirect that leaves the allowed hosts', async () => {
    const fetchMock = vi.fn(async () => redirect('https://internal.example.com/secret'));
    await expect(resolveMapLink('https://maps.app.goo.gl/x', fetchMock)).rejects.toMatchObject({ code: 'link_not_allowed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after MAX_HOPS requests on a redirect loop', async () => {
    const fetchMock = vi.fn(async () => redirect('https://maps.app.goo.gl/loop'));
    await expect(resolveMapLink('https://maps.app.goo.gl/loop', fetchMock)).rejects.toMatchObject({ code: 'link_unresolved' });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(MAX_HOPS);
    expect(MAX_HOPS).toBe(5);
  });

  it('reports an unresolved link when the page is not a redirect or the request fails', async () => {
    await expect(resolveMapLink('https://maps.app.goo.gl/x', vi.fn(async () => new Response('ok', { status: 200 })))).rejects.toMatchObject({ code: 'link_unresolved' });
    await expect(resolveMapLink('https://maps.app.goo.gl/x', vi.fn(async () => Promise.reject(new Error('timeout'))))).rejects.toMatchObject({ code: 'link_unresolved' });
  });
});
