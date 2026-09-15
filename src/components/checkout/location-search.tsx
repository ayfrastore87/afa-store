"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";

import type { LocationSearchResult } from "@/lib/geocoding-normalize";

type Props = {
    onSelect: (result: LocationSearchResult) => void;
};

/**
 * Debounced address/place search with stale-response protection. The browser
 * never calls Nominatim directly — it goes through GET /api/location/search.
 */
export function CheckoutLocationSearch({ onSelect }: Props) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<LocationSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState(false);
    const requestRef = useRef(0);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 3) { setResults([]); setOpen(false); setSearching(false); return; }
        const requestId = ++requestRef.current;
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const r = await fetch(`/api/location/search?q=${encodeURIComponent(q)}`);
                const d = await r.json().catch(() => ({}));
                if (requestId !== requestRef.current) return;
                setResults(d.results || []);
                setOpen(true);
            } catch {
                if (requestId === requestRef.current) setResults([]);
            } finally {
                if (requestId === requestRef.current) setSearching(false);
            }
        }, 450);
        return () => clearTimeout(timer);
    }, [query]);

    const choose = (result: LocationSearchResult) => {
        setQuery(result.displayName);
        setResults([]);
        setOpen(false);
        onSelect(result);
    };

    return (
        <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6D6558]" />
            <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => { if (results.length) setOpen(true); }}
                placeholder="Cari alamat, perumahan, jalan, atau tempat..."
                aria-label="Cari alamat atau nama tempat"
                role="combobox"
                aria-expanded={open && results.length > 0}
                aria-controls="location-suggestions"
                aria-autocomplete="list"
                className="min-h-11 w-full rounded-xl border border-[#C9A45B]/30 bg-white pl-9 pr-3"
            />
            {searching && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#6D6558]" />}

            {open && results.length > 0 && (
                <ul id="location-suggestions" role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-[#C9A45B]/30 bg-white shadow-lg">
                    {results.slice(0, 5).map((r, i) => (
                        <li key={`${r.latitude}-${r.longitude}-${i}`}>
                            <button type="button" onClick={() => choose(r)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[#F0E7D8]">
                                <MapPin size={14} className="mt-0.5 shrink-0 text-[#184D47]" />
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-[#123524]">{r.displayName || "Lokasi"}</span>
                                    <span className="block text-xs text-[#6D6558]">{[r.address.city, r.address.province].filter(Boolean).join(", ")}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
