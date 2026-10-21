'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle } from 'lucide-react';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/components/public/lang';
import { tripText } from '@/lib/copy/trip';
import { placeById, type Catalog } from '@/lib/pricing';
import type { BuilderState } from './state';

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };

/** polygon approximating a circle of `km` around a point */
function circle(lat: number, lng: number, km: number, steps = 72): number[][] {
  const out: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    out.push([lng + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a), lat + (km / 110.57) * Math.cos(a)]);
  }
  return out;
}

const token = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

const PIN_BASE = 'grid place-items-center rounded-full border-2 border-surface font-semibold shadow-e2 cursor-pointer';

interface Props {
  catalog: Catalog;
  state: Pick<BuilderState, 'pickupId' | 'stops' | 'cat' | 'roundTrip'>;
  onToggle: (placeId: string) => void;
}

export function TripMap({ catalog, state, onToggle }: Props) {
  const { lang } = useLang();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const toggleRef = useRef(onToggle);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileIssue, setTileIssue] = useState(false);

  useEffect(() => {
    toggleRef.current = onToggle;
  }, [onToggle]);

  const base = useMemo(() => placeById(catalog, catalog.basePlaceId), [catalog]);

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
            layers: [
              { id: 'bg', type: 'background', paint: { 'background-color': token('--map-bg', '#E4ECE6') } },
              { id: 'osm', type: 'raster', source: 'osm' },
            ],
          },
        });
        mapRef.current = map;
        map.on('error', () => setTileIssue(true));
        map.on('load', () => {
          if (!map) return;
          const zones = catalog.rules.zones.filter((z) => z.max_km !== null).sort((a, b) => (b.max_km ?? 0) - (a.max_km ?? 0));
          zones.forEach((z) => {
            map!.addSource(`zone-${z.id}`, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circle(base.lat, base.lng, z.max_km ?? 0)] } } });
            map!.addLayer({ id: `zone-${z.id}-fill`, type: 'fill', source: `zone-${z.id}`, paint: { 'fill-color': token(`--map-z${z.id}`, '#D3E0D7'), 'fill-opacity': 0.45 } });
            map!.addLayer({ id: `zone-${z.id}-line`, type: 'line', source: `zone-${z.id}`, paint: { 'line-color': token('--map-ring-label', '#4F6A5F'), 'line-width': 1, 'line-dasharray': [3, 3], 'line-opacity': 0.7 } });
          });
          map.addSource('route', { type: 'geojson', data: EMPTY });
          map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': token('--brand-solid', '#C2410C'), 'line-width': 4 } });
          setReady(true);
        });
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
  }, [catalog, base]);

  const stopKey = state.stops.map((s) => s.placeId).join(',');

  // pins + route
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
        el.innerHTML = '';
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
    const src = map.getSource('route') as { setData: (d: FC) => void } | undefined;
    src?.setData(pts.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) } }] } : EMPTY);
  }, [ready, catalog, state.pickupId, stopKey, state.cat, state.roundTrip, state.stops, lang]);

  // frame the trip when the set of places changes
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;
    const pk = placeById(catalog, state.pickupId);
    const pts = [pk, ...state.stops.map((s) => placeById(catalog, s.placeId))];
    const b = new ml.LngLatBounds([pk.lng, pk.lat], [pk.lng, pk.lat]);
    pts.forEach((p) => b.extend([p.lng, p.lat]));
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
