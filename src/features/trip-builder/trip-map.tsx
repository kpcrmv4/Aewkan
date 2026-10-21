'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle } from 'lucide-react';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/components/public/lang';
import { tripText } from '@/lib/copy/trip';
import { placeById, type Catalog } from '@/lib/pricing';
import type { BuilderState } from './state';

const PIN_BASE = 'grid place-items-center rounded-full border-2 border-surface font-semibold shadow-e2 cursor-pointer';
const KM_PER_DEG_LAT = 110.57;

interface Props {
  catalog: Catalog;
  state: Pick<BuilderState, 'pickupId' | 'stops' | 'cat' | 'roundTrip'>;
  onToggle: (placeId: string) => void;
}

/**
 * MapLibre + OpenStreetMap raster tiles. Zones and the route are drawn as an SVG
 * overlay re-projected on every frame (no GeoJSON sources) so they do not depend
 * on MapLibre's web worker, which a bundled app cannot always locate.
 */
export function TripMap({ catalog, state, onToggle }: Props) {
  const { lang } = useLang();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const toggleRef = useRef(onToggle);
  const circles = useRef<Array<SVGCircleElement | null>>([]);
  const line = useRef<SVGPolylineElement | null>(null);
  const routePts = useRef<Array<[number, number]>>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileIssue, setTileIssue] = useState(false);

  useEffect(() => {
    toggleRef.current = onToggle;
  }, [onToggle]);

  const base = useMemo(() => placeById(catalog, catalog.basePlaceId), [catalog]);
  const zones = useMemo(() => catalog.rules.zones.filter((z) => z.max_km !== null).sort((a, b) => (b.max_km ?? 0) - (a.max_km ?? 0)), [catalog]);

  /** place the zone circles and the route line for the current camera */
  const sync = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.project([base.lng, base.lat]);
    zones.forEach((z, i) => {
      const el = circles.current[i];
      if (!el) return;
      const edge = map.project([base.lng, base.lat + (z.max_km ?? 0) / KM_PER_DEG_LAT]);
      el.setAttribute('cx', String(c.x));
      el.setAttribute('cy', String(c.y));
      el.setAttribute('r', String(Math.abs(c.y - edge.y)));
    });
    line.current?.setAttribute(
      'points',
      routePts.current
        .map(([lng, lat]) => {
          const p = map.project([lng, lat]);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(' '),
    );
  }, [base, zones]);

  // create the map once
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    (async () => {
      try {
        const ml = await import('maplibre-gl');
        if (cancelled || !box.current) return;
        mlRef.current = ml;
        map = new ml.Map({
          container: box.current,
          center: [base.lng, base.lat],
          zoom: 9,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' } },
            layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
          },
        });
        mapRef.current = map;
        // overlay goes under the pins: right after the canvas, before the markers (both live in the canvas container)
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('data-testid', 'trip-map-overlay');
        svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';
        circles.current = zones.map((z) => {
          const c = document.createElementNS(NS, 'circle');
          c.setAttribute('fill', `var(--map-z${z.id}, var(--map-z2))`);
          c.setAttribute('fill-opacity', '0.5');
          c.setAttribute('stroke', 'var(--map-ring-label)');
          c.setAttribute('stroke-dasharray', '4 4');
          c.setAttribute('stroke-opacity', '0.7');
          svg.appendChild(c);
          return c;
        });
        const pl = document.createElementNS(NS, 'polyline');
        pl.setAttribute('fill', 'none');
        pl.setAttribute('stroke', 'var(--brand-solid)');
        pl.setAttribute('stroke-width', '4');
        pl.setAttribute('stroke-linecap', 'round');
        pl.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(pl);
        line.current = pl;
        map.getCanvas().after(svg);
        // only tile failures matter to the customer; other internal errors are not shown
        map.on('error', (e) => {
          if ((e as { sourceId?: string }).sourceId === 'osm') setTileIssue(true);
        });
        map.on('render', sync);
        map.on('load', () => setReady(true));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [catalog, base, zones, sync]);

  const stopKey = state.stops.map((s) => s.placeId).join(',');

  // pins + route points
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const ids = state.stops.map((s) => s.placeId);
    for (const p of catalog.places) {
      const idx = ids.indexOf(p.id);
      const isPickup = p.id === state.pickupId;
      if (!isPickup && idx < 0 && p.category === 'pickup') continue;
      if (!isPickup && idx < 0 && state.cat !== 'all' && p.category !== state.cat) continue;
      const name = lang === 'en' ? p.name_en : p.name_th;
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', isPickup ? `${tripText(lang, 'pickupHere')}: ${name}` : name);
      el.setAttribute('data-pin', p.id);
      if (isPickup) {
        el.className = `${PIN_BASE} size-6 bg-ink`;
        el.disabled = true;
      } else if (idx >= 0) {
        el.className = `${PIN_BASE} size-7 bg-brand-solid text-xs text-on-brand ${p.is_mountain ? 'ring-2 ring-brand' : ''}`;
        el.textContent = String(idx + 1);
        el.onclick = () => toggleRef.current(p.id);
      } else {
        el.className = `${PIN_BASE} size-4 bg-surface ${p.is_mountain ? 'border-brand' : 'border-ink-2'}`;
        el.onclick = () => toggleRef.current(p.id);
      }
      el.title = name;
      markers.current.push(new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
    }
    const pk = placeById(catalog, state.pickupId);
    const pts = [pk, ...ids.map((id) => placeById(catalog, id))];
    if (state.roundTrip && ids.length) pts.push(pk);
    routePts.current = pts.length > 1 ? pts.map((p) => [p.lng, p.lat] as [number, number]) : [];
    sync();
  }, [ready, catalog, state.pickupId, stopKey, state.cat, state.roundTrip, state.stops, lang, sync]);

  // frame the trip when the set of places changes
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;
    const pk = placeById(catalog, state.pickupId);
    const b = new ml.LngLatBounds([pk.lng, pk.lat], [pk.lng, pk.lat]);
    state.stops.forEach((s) => {
      const p = placeById(catalog, s.placeId);
      b.extend([p.lng, p.lat]);
    });
    map.fitBounds(b, { padding: 48, maxZoom: 11, duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, catalog, state.pickupId, stopKey]);

  return (
    <div>
      {(failed || tileIssue) && (
        <p role="status" className="m-3 flex items-start gap-2 rounded-sm bg-status-pending-bg px-3 py-2 text-sm text-status-pending">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{tripText(lang, failed ? 'mapNotice' : 'tilesNotice')}</span>
        </p>
      )}
      <div className={failed ? 'hidden' : 'relative'}>
        <div ref={box} role="region" aria-label={tripText(lang, 'mapAria')} className="h-[340px] w-full bg-map-bg sm:h-[440px] lg:h-[520px]" data-testid="trip-map" />
        {!ready && !failed && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-token">{tripText(lang, 'mapLoading')}</div>}
      </div>
    </div>
  );
}
