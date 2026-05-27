import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#e4e5e8",
        surface: "#ffffff",
        "surface-mid": "#d8d9dc",
        "surface-low": "#dddee1",
        "surface-subtle": "#d8d9dc",

        primary: "#1e1b4b",
        "primary-dark": "#0f0d2b",
        "primary-light": "#e0e7ff",
        "primary-muted": "#c7d2fe",

        ink: "#0f172a",
        "ink-secondary": "#475569",
        "ink-muted": "#94a3b8",

        border: "#d0d1d5",
        "border-subtle": "#d8d9dc",

        // legacy aliases mapped to new cohesive values
        secondary: "#1e1b4b",
        "secondary-light": "#6366f1",
        "secondary-bg": "#e0e7ff",
        "secondary-text": "#1e1b4b",
        tertiary: "#0f172a",
        "tertiary-bg": "#f8f8f9",
        "on-surface": "#0f172a",
        "on-surface-muted": "#64748b",
      },
      fontFamily: {
        display: ["var(--font-bricolage)", "sans-serif"],
        body: ["var(--font-dm-sans)", "sans-serif"],
        label: ["var(--font-dm-sans)", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 6px rgba(0,0,0,0.07), 0 10px 28px rgba(0,0,0,0.08)",
        "card-hover": "0 6px 16px rgba(0,0,0,0.09), 0 20px 48px rgba(0,0,0,0.10)",
        sidebar: "none",
        sm: "0 1px 4px rgba(0,0,0,0.08)",
        // Neomorphic shadows — tuned for #e4e5e8 gray field
        "neo-active": "6px 6px 18px rgba(0,0,0,0.14), -4px -4px 12px rgba(255,255,255,0.95)",
        "neo-hover":  "3px 3px 10px rgba(0,0,0,0.09), -2px -2px 7px rgba(255,255,255,0.85)",
        "neo-inset":  "inset 2px 2px 7px rgba(0,0,0,0.09), inset -2px -2px 6px rgba(255,255,255,0.90)",
      },
      borderRadius: {
        card: "1.25rem",
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      backgroundImage: {
        "indigo-subtle": "linear-gradient(135deg, #e4e5e8 0%, #d8daff 100%)",
        "brand-gradient": "linear-gradient(135deg, #6366f1 0%, #14b8a6 100%)",
        "warm-base": "linear-gradient(180deg, #e4e5e8 0%, #dddee1 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
