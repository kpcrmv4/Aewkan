import { describe, expect, it } from 'vitest';
import { classifyPaste, fitPair, inServiceArea, isAllowedMapHost, makeSlug, parseCoordsFromUrl, parseTypedCoords } from '@/features/admin-settings/coords';

describe('P2B-02-04 coordinates from map links', () => {
  it('reads the viewport from @lat,lng,zoom', () => {
    expect(parseCoordsFromUrl('https://www.google.com/maps/place/Wat+Phra+That/@18.8048,98.9217,17z')).toEqual({ lat: 18.8048, lng: 98.9217 });
  });
  it('prefers the pin (!3d!4d) over the viewport centre', () => {
    const url = 'https://www.google.com/maps/place/Wat/@18.79,98.98,17z/data=!4m6!3m5!1s0x0:0x1!8m2!3d18.7931!4d98.9892!16s';
    expect(parseCoordsFromUrl(url)).toEqual({ lat: 18.7931, lng: 98.9892 });
  });
  it('reads ?q=lat,lng and url-encoded commas', () => {
    expect(parseCoordsFromUrl('https://www.google.com/maps?q=18.7877,99.0003')).toEqual({ lat: 18.7877, lng: 99.0003 });
    expect(parseCoordsFromUrl('https://maps.google.com/?q=18.7877%2C99.0003')).toEqual({ lat: 18.7877, lng: 99.0003 });
  });
  it('reads ll=, query= and the /search/ path form', () => {
    expect(parseCoordsFromUrl('https://maps.google.com/?ll=18.80,98.95&z=14')).toEqual({ lat: 18.8, lng: 98.95 });
    expect(parseCoordsFromUrl('https://www.google.com/maps/search/?api=1&query=18.81,98.96')).toEqual({ lat: 18.81, lng: 98.96 });
    expect(parseCoordsFromUrl('https://www.google.com/maps/search/18.82,98.97')).toEqual({ lat: 18.82, lng: 98.97 });
  });
  it('reads OSM mlat/mlon and the #map= hash', () => {
    expect(parseCoordsFromUrl('https://www.openstreetmap.org/?mlat=18.7668&mlon=98.9627#map=15/18.7&lng=1')).toEqual({ lat: 18.7668, lng: 98.9627 });
    expect(parseCoordsFromUrl('https://www.openstreetmap.org/#map=16/18.7877/99.0003')).toEqual({ lat: 18.7877, lng: 99.0003 });
  });
  it('returns null for a link without coordinates', () => {
    expect(parseCoordsFromUrl('https://www.google.com/maps/place/Wat+Phra+That')).toBeNull();
    expect(parseCoordsFromUrl('https://maps.app.goo.gl/abc123')).toBeNull();
    expect(parseCoordsFromUrl('not a url')).toBeNull();
  });
  it('ignores coordinates outside the service area', () => {
    expect(parseCoordsFromUrl('https://www.google.com/maps/@35.6,139.7,15z')).toBeNull();
  });
});

describe('P2B-02-05 typed coordinates', () => {
  it('accepts comma, space and tight forms', () => {
    expect(parseTypedCoords('18.80, 98.92')).toEqual({ lat: 18.8, lng: 98.92 });
    expect(parseTypedCoords('18.80 98.92')).toEqual({ lat: 18.8, lng: 98.92 });
    expect(parseTypedCoords(' 18.80,98.92 ')).toEqual({ lat: 18.8, lng: 98.92 });
  });
  it('swaps lng,lat when that is the only reading inside the service area', () => {
    expect(parseTypedCoords('98.92, 18.80')).toEqual({ lat: 18.8, lng: 98.92 });
    expect(fitPair(98.92, 18.8)).toEqual({ lat: 18.8, lng: 98.92 });
  });
  it('rejects points outside Thailand and non-numbers', () => {
    expect(parseTypedCoords('51.5, -0.12')).toBeNull();
    expect(parseTypedCoords('abc, def')).toBeNull();
    expect(parseTypedCoords('18.8')).toBeNull();
    expect(inServiceArea({ lat: 18.8, lng: 98.9 })).toBe(true);
    expect(inServiceArea({ lat: 4, lng: 98.9 })).toBe(false);
  });
});

describe('classifyPaste', () => {
  it('tells typed coordinates, full links, short links and junk apart', () => {
    expect(classifyPaste('18.80, 98.92').kind).toBe('coords');
    expect(classifyPaste('https://www.google.com/maps/@18.8,98.9,15z').kind).toBe('link');
    expect(classifyPaste('วัดสุเทพ https://maps.app.goo.gl/AbCd123').kind).toBe('short_link');
    expect(classifyPaste('https://example.com/?q=18.8,98.9').kind).toBe('link'); // coordinates are read, nothing is fetched
    expect(classifyPaste('hello').kind).toBe('unknown');
    expect(classifyPaste('').kind).toBe('unknown');
  });
});

describe('hosts and slugs', () => {
  it('allows only Google and OSM map hosts', () => {
    for (const h of ['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com', 'www.google.co.th', 'www.openstreetmap.org', 'osm.org']) expect(isAllowedMapHost(h)).toBe(true);
    for (const h of ['evil.com', 'google.com.evil.com', 'localhost', '127.0.0.1', '169.254.169.254', 'notgoogle.com', 'maps.google.evil.com']) expect(isAllowedMapHost(h)).toBe(false);
  });
  it('makeSlug fits the database check', () => {
    const re = /^[a-z0-9][a-z0-9-]{1,48}$/;
    expect(makeSlug('Wat Phra That Doi Suthep', () => 'ab12')).toBe('wat-phra-that-doi-suthep-ab12');
    expect(re.test(makeSlug('Wat Phra That Doi Suthep Temple And More Words Than Fit', () => 'zz99'))).toBe(true);
    expect(re.test(makeSlug('วัด', () => 'q1w2'))).toBe(true);
    expect(makeSlug('วัด', () => 'q1w2')).toBe('place-q1w2');
  });
});
