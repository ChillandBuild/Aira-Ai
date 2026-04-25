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
        background: "#f7f6f3",
        surface: "#ffffff",
        "surface-mid": "#ecfdf5",
        "surface-low": "#f0fdf4",
        "surface-subtle": "#fafaf8",

        primary: "#059669",
        "primary-dark": "#047857",
        "primary-light": "#d1fae5",
        "primary-muted": "#a7f3d0",

        ink: "#111827",
        "ink-secondary": "#4b5563",
        "ink-muted": "#9ca3af",

        border: "#e5e7eb",
        "border-subtle": "#f3f4f6",

        // legacy aliases kept for existing components
        secondary: "#059669",
        "secondary-light": "#34d399",
        "secondary-bg": "#d1fae5",
        "secondary-text": "#064e3b",
        tertiary: "#111827",
        "tertiary-bg": "#f0fdf4",
        "on-surface": "#111827",
        "on-surface-muted": "#6b7280",
      },
      fontFamily: {
        display: ["var(--font-bricolage)", "sans-serif"],
        body: ["var(--font-dm-sans)", "sans-serif"],
        label: ["var(--font-syne)", "sans-serif"],
        // legacy aliases
        mono: ["var(--font-syne)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(5,150,105,0.06)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.06), 0 16px 48px rgba(5,150,105,0.10)",
        sidebar: "4px 0 24px rgba(0,0,0,0.04)",
        sm: "0 1px 3px rgba(0,0,0,0.06)",
      },
      borderRadius: {
        card: "1.25rem",
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      backgroundImage: {
        "emerald-subtle": "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
        "emerald-vivid": "linear-gradient(135deg, #059669 0%, #047857 100%)",
        "warm-base": "linear-gradient(180deg, #f7f6f3 0%, #f3f2ef 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
