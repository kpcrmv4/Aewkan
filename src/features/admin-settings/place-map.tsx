'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle } from 'lucide-react';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { PLACES_COPY as C } from '@/lib/copy/settings';
import type { Coords } from './coords';

/** Chiang Mai city centre: where the map opens when there is no pin yet */
const CENTER: [number, number] = [98.9853, 18.7883];
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * MapLibre + OpenStreetMap raster tiles (same setup as the customer trip map,
 * without its SVG overlay — here only one draggable pin is needed).
 * Click or drag to set the point; `point` set from outside (pasted link, typed
 * coordinates) moves the pin and recentres the map.
 */
export function PlaceMap({ point, onPick }: { point: Coords | null; onPick: (c: Coords) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const pickRef = useRef(onPick);
  const emitted = useRef<Coords | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileIssue, setTileIssue] = useState(false);

  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

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
          center: CENTER,
          zoom: 10,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' } },
            layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
          },
        });
        mapRef.current = map;
        map.on('click', (e) => {
          const c = { lat: round6(e.lngLat.lat), lng: round6(e.lngLat.lng) };
          emitted.current = c;
          pickRef.current(c);
        });
        map.on('error', (e) => {
          if ((e as { sourceId?: string }).sourceId === 'osm') setTileIssue(true);
        });
        map.on('load', () => setReady(true));
        // the style may be slow behind a proxy: the pin must work before 'load'
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // the pin follows `point`
  const lat = point?.lat ?? null;
  const lng = point?.lng ?? null;
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;
    if (lat === null || lng === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'place-pin');
      el.className = 'size-6 cursor-grab rounded-full border-[3px] border-surface bg-brand-solid shadow-e2';
      const marker = new ml.Marker({ element: el, draggable: true }).setLngLat([lng, lat]).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        const c = { lat: round6(p.lat), lng: round6(p.lng) };
        emitted.current = c;
        pickRef.current(c);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
    // recentre only when the point came from outside the map (paste / typing)
    const e = emitted.current;
    if (!e || e.lat !== lat || e.lng !== lng) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 300 });
  }, [ready, lat, lng]);

  return (
    <div>
      {(failed || tileIssue) && (
        <p role="status" className="mb-2 flex items-start gap-2 rounded-sm bg-status-pending-bg px-3 py-2 text-sm text-status-pending">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{failed ? C.loc.mapFailed : C.loc.tilesFailed}</span>
        </p>
      )}
      <div className={failed ? 'hidden' : 'relative'}>
        <div ref={box} role="region" aria-label={C.loc.mapAria} className="h-60 w-full overflow-hidden rounded-sm border border-line bg-map-bg sm:h-72" data-testid="place-map" />
        {!ready && !failed && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-token">{C.loc.mapLoading}</div>}
      </div>
    </div>
  );
}
