"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";

export default function AdminThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const dark = mounted && theme === "dark";

    useEffect(() => setMounted(true), []);

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? "Aktifkan Light Mode" : "Aktifkan Night Mode"}
            title={dark ? "Light Mode" : "Night Mode"}
            aria-pressed={dark}
            className="admin-theme-toggle"
        >
            {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            <span>{dark ? "Light" : "Night"}</span>
        </button>
    );
}