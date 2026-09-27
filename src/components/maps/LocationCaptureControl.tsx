"use client";
import { useState } from "react";
import { VisitLocationMap } from "./VisitLocationMap";

export type CapturedLocation = { latitude: number; longitude: number; accuracy: number; capturedAt: string };

export function LocationCaptureControl({ value, onChange }: { value: CapturedLocation | null; onChange: (location: CapturedLocation | null) => void }) {
  const [error, setError] = useState("");
  function locate() {
    setError("");
    if (!navigator.geolocation) return setError("Browser ini belum mendukung lokasi.");
    navigator.geolocation.getCurrentPosition((position) => onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date().toISOString() }), (problem) => setError(problem.code === 1 ? "Izin lokasi ditolak. Aktifkan izin lokasi lalu coba lagi." : "Lokasi tidak tersedia atau timeout. Coba lagi."), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }
  return <div className="rounded-xl border border-[#ded9cc] p-3"><button type="button" onClick={locate} className="min-h-11 rounded-xl border border-[#184C3A] px-4 font-black text-[#184C3A]">{value ? "PERBARUI LOKASI" : "GUNAKAN LOKASI SAYA"}</button>{value && <VisitLocationMap {...value} />}{error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}</div>;
}