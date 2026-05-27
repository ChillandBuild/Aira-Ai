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
        background: "#f8f8f9",
        surface: "#ffffff",
        "surface-mid": "#e0e7ff",
        "surface-low": "#e0e7ff",
        "surface-subtle": "#f8f8f9",

        primary: "#1e1b4b",
        "primary-dark": "#0f0d2b",
        "primary-light": "#e0e7ff",
        "primary-muted": "#c7d2fe",

        ink: "#0f172a",
        "ink-secondary": "#475569",
        "ink-muted": "#94a3b8",

        border: "#e2e8f0",
        "border-subtle": "#f1f5f9",

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
        card: "0 1px 3px rgba(0,0,0,0.03), 0 8px 32px rgba(30,27,75,0.04)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.04), 0 16px 48px rgba(30,27,75,0.08)",
        sidebar: "4px 0 24px rgba(0,0,0,0.03)",
        sm: "0 1px 3px rgba(0,0,0,0.04)",
      },
      borderRadius: {
        card: "1.25rem",
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      backgroundImage: {
        "indigo-subtle": "linear-gradient(135deg, #f8f8f9 0%, #e0e7ff 100%)",
        "brand-gradient": "linear-gradient(135deg, #6366f1 0%, #14b8a6 100%)",
        "warm-base": "linear-gradient(180deg, #f8f8f9 0%, #f1f5f9 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
