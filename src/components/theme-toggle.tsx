"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const dark = mounted && theme === "dark";

  useEffect(() => setMounted(true), []);

  return (
    <button type="button" onClick={toggleTheme} aria-label={dark ? "Aktifkan mode terang" : "Aktifkan mode malam"} title={dark ? "Aktifkan mode terang" : "Aktifkan mode malam"} aria-pressed={dark} className="theme-toggle fixed bottom-5 left-5 z-[100] grid h-11 w-11 place-items-center rounded-full border border-[#C9A45B]/50 bg-[#F8F5EE]/90 text-[#A7833A] shadow-lg backdrop-blur transition hover:scale-105">
      {dark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}
