"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

import type { DeliveryCoordinates } from "@/lib/coordinates";

const TILE_SIZE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 16;
const DEFAULT_CENTER: DeliveryCoordinates = { latitude: -6.2, longitude: 106.816666 };

function lonToTileXFloat(lon: number, zoom: number) {
    return ((lon + 180) / 360) * Math.pow(2, zoom);
}

function latToTileYFloat(lat: number, zoom: number) {
    const rad = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
}

function tileXToLon(x: number, zoom: number) {
    return (x / Math.pow(2, zoom)) * 360 - 180;
}

function tileYToLat(y: number, zoom: number) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

type PanState = { dx: number; dy: number };

/**
 * Interactive OpenStreetMap (no API key, no SDK). Supports click-to-place,
 * drag-to-pan, zoom buttons, and a center crosshair. The marker is always at the
 * viewport center; when the user clicks or finishes panning, the center is
 * reported as the selected coordinate. OSM attribution is always shown.
 */
export function CheckoutLocationMap({ value, onChange }: { value: DeliveryCoordinates | null; onChange: (coords: DeliveryCoordinates) => void }) {
    const [center, setCenter] = useState<DeliveryCoordinates>(value ?? DEFAULT_CENTER);
    const [zoom, setZoom] = useState(DEFAULT_ZOOM);
    const [pan, setPan] = useState<PanState>({ dx: 0, dy: 0 });
    const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

    useEffect(() => {
        if (value) setCenter(value);
    }, [value]);

    const commitPan = useCallback((dx: number, dy: number) => {
        setCenter((c) => {
            const cx = lonToTileXFloat(c.longitude, zoom);
            const cy = latToTileYFloat(c.latitude, zoom);
            const newLon = tileXToLon(clamp(cx - dx / TILE_SIZE, 0, Math.pow(2, zoom)), zoom);
            const newLat = tileYToLat(clamp(cy - dy / TILE_SIZE, 0, Math.pow(2, zoom)), zoom);
            return { latitude: newLat, longitude: newLon };
        });
        setPan({ dx: 0, dy: 0 });
    }, [zoom]);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragRef.current) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
        setPan({ dx, dy });
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!drag.moved) {
            onChange(center);
        } else {
            commitPan(dx, dy);
        }
    }, [center, onChange, commitPan]);

    const changeZoom = useCallback((delta: number) => {
        setZoom((z) => clamp(z + delta, MIN_ZOOM, MAX_ZOOM));
    }, []);

    const centerX = lonToTileXFloat(center.longitude, zoom);
    const centerY = latToTileYFloat(center.latitude, zoom);
    const baseTileX = Math.floor(centerX);
    const baseTileY = Math.floor(centerY);
    const fracX = centerX - baseTileX;
    const fracY = centerY - baseTileY;

    const tiles: { key: string; x: number; y: number; left: number; top: number }[] = [];
    const radius = 2;
    for (let ty = -radius; ty <= radius; ty++) {
        for (let tx = -radius; tx <= radius; tx++) {
            const tileX = baseTileX + tx;
            const tileY = baseTileY + ty;
            if (tileX < 0 || tileY < 0 || tileX >= Math.pow(2, zoom) || tileY >= Math.pow(2, zoom)) continue;
            tiles.push({
                key: `${zoom}/${tileX}/${tileY}`,
                x: tileX,
                y: tileY,
                left: (tx - fracX) * TILE_SIZE + pan.dx,
                top: (ty - fracY) * TILE_SIZE + pan.dy,
            });
        }
    }

    return (
        <div className="space-y-2">
            <div
                role="application"
                aria-label="Peta pilihan lokasi"
                className="relative h-72 w-full touch-none select-none overflow-hidden rounded-2xl border border-[#C9A45B]/30 bg-[#e7e4da] sm:h-80"
                style={{ cursor: "grab" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => { dragRef.current = null; setPan({ dx: 0, dy: 0 }); }}
            >
                {tiles.map((tile) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        key={tile.key}
                        src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        className="absolute"
                        style={{ left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
                    />
                ))}

                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    {value ? (
                        <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-[#184D47] text-white shadow-md">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>
                        </span>
                    ) : (
                        <span className="block h-6 w-6 rounded-full border-2 border-[#184D47]/70 bg-[#184D47]/20" />
                    )}
                </div>

                <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-[#ded9cc] bg-white/95 shadow-sm">
                    <button type="button" onClick={() => changeZoom(1)} aria-label="Perbesar peta" className="grid h-9 w-9 place-items-center text-[#184C3A] hover:bg-[#F0E7D8]"><Plus size={16} /></button>
                    <button type="button" onClick={() => changeZoom(-1)} aria-label="Perkecil peta" className="grid h-9 w-9 place-items-center border-t border-[#ded9cc] text-[#184C3A] hover:bg-[#F0E7D8]"><Minus size={16} /></button>
                </div>

                <div className="pointer-events-none absolute bottom-0 right-0 rounded-tl-md bg-white/80 px-2 py-0.5 text-[10px] text-[#6D6558]">
                    © OpenStreetMap contributors
                </div>
            </div>
            <p className="text-xs text-[#6D6558]">Seret untuk menggeser peta, klik untuk memilih titik lokasi.</p>
        </div>
    );
}
