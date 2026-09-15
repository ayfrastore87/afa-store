"use client";

import { useRef, useState } from "react";
import { MapPin, Minus, Plus } from "lucide-react";

import type { DeliveryCoordinates } from "@/lib/coordinates";

const TILE_SIZE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;

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

type Props = {
    center: DeliveryCoordinates;
    zoom: number;
    onCenterChange: (coords: DeliveryCoordinates) => void;
    onZoomChange: (zoom: number) => void;
    onInteractionStart: () => void;
    onInteractionEnd: () => void;
    fullscreen?: boolean;
};

/**
 * Interactive OpenStreetMap (no API key, no SDK) with a Grab/Gojek-style center
 * pin. The map is fully controlled via `center` + `zoom`; dragging pans the map
 * and reports the new center through `onCenterChange`. The pin never moves from
 * the viewport center, is non-interactive (pointer-events: none), and sits above
 * the tiles with a shadow so it stays visible on every map color. OSM attribution
 * is always shown.
 */
export function CheckoutLocationMap({ center, zoom, onCenterChange, onZoomChange, onInteractionStart, onInteractionEnd, fullscreen = false }: Props) {
    const [pan, setPan] = useState<PanState>({ dx: 0, dy: 0 });
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

    const changeZoom = (delta: number) => {
        onZoomChange(clamp(zoom + delta, MIN_ZOOM, MAX_ZOOM));
    };

    const onPointerDown = (e: React.PointerEvent) => {
        dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
        setDragging(true);
        onInteractionStart();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
        setPan({ dx, dy });
    };

    const finishPan = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        dragRef.current = null;
        setDragging(false);
        onInteractionEnd();
        if (!drag) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (drag.moved) {
            const cx = lonToTileXFloat(center.longitude, zoom);
            const cy = latToTileYFloat(center.latitude, zoom);
            const newLon = tileXToLon(clamp(cx - dx / TILE_SIZE, 0, Math.pow(2, zoom)), zoom);
            const newLat = tileYToLat(clamp(cy - dy / TILE_SIZE, 0, Math.pow(2, zoom)), zoom);
            onCenterChange({ latitude: newLat, longitude: newLon });
        }
        setPan({ dx: 0, dy: 0 });
    };

    const cancelPan = () => {
        dragRef.current = null;
        setDragging(false);
        onInteractionEnd();
        setPan({ dx: 0, dy: 0 });
    };

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
        <div
            role="application"
            aria-label="Peta pilihan lokasi"
            className={fullscreen ? "relative h-full w-full touch-none select-none overflow-hidden bg-[#e7e4da]" : "relative h-[300px] w-full touch-none select-none overflow-hidden rounded-2xl border border-[#C9A45B]/30 bg-[#e7e4da] sm:h-[360px]"}
            style={{ cursor: dragging ? "grabbing" : "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishPan}
            onPointerCancel={cancelPan}
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

            {/* Center pin — always visible, non-interactive, above the tiles */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                <div className={`flex flex-col items-center transition-transform duration-150 ease-out ${dragging ? "-translate-y-2" : ""}`}>
                    <MapPin size={42} strokeWidth={2} className="-mb-1 text-[#D64545] drop-shadow-[0_4px_6px_rgba(0,0,0,0.55)]" />
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-[#184D47] shadow-[0_1px_3px_rgba(0,0,0,0.6)]" />
                    <span className="mt-1.5 whitespace-nowrap rounded-full bg-black/75 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow">
                        TITIK PENGIRIMAN
                    </span>
                </div>
            </div>

            <div className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden rounded-xl border border-[#ded9cc] bg-white/95 shadow-sm">
                <button type="button" onClick={() => changeZoom(1)} aria-label="Perbesar peta" className="grid h-9 w-9 place-items-center text-[#184C3A] hover:bg-[#F0E7D8]"><Plus size={16} /></button>
                <button type="button" onClick={() => changeZoom(-1)} aria-label="Perkecil peta" className="grid h-9 w-9 place-items-center border-t border-[#ded9cc] text-[#184C3A] hover:bg-[#F0E7D8]"><Minus size={16} /></button>
            </div>

            <div className="pointer-events-none absolute bottom-0 right-0 z-20 rounded-tl-md bg-white/80 px-2 py-0.5 text-[10px] text-[#6D6558]">
                © OpenStreetMap contributors
            </div>
        </div>
    );
}
