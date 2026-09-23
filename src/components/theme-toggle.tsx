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
    <button type="button" onClick={toggleTheme} aria-label={dark ? "Aktifkan mode terang" : "Aktifkan mode gelap"} title={dark ? "Aktifkan mode terang" : "Aktifkan mode gelap"} aria-pressed={dark} className="theme-toggle grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#C9A45B]/35 bg-[#F8F5EE]/80 text-[#A7833A] transition hover:border-[#C9A45B]/60 hover:bg-[#C9A45B]/10 md:h-9 md:w-9">
      {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}
