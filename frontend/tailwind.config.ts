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
        background: "#eef0f3",
        surface: "#ffffff",
        "surface-mid": "#f4f4f5",
        "surface-low": "#fafafa",
        "surface-subtle": "#fcfcfc",

        primary: "#18181b",
        "primary-dark": "#09090b",
        "primary-light": "#f4f4f5",
        "primary-muted": "#e4e4e7",

        ink: "#18181b",
        "ink-secondary": "#71717a",
        "ink-muted": "#a1a1aa",

        border: "#e4e4e7",
        "border-subtle": "#f4f4f5",

        // legacy aliases mapped to new cohesive values
        secondary: "#18181b",
        "secondary-light": "#71717a",
        "secondary-bg": "#f4f4f5",
        "secondary-text": "#18181b",
        tertiary: "#27272a",
        "tertiary-bg": "#fafafa",
        "on-surface": "#18181b",
        "on-surface-muted": "#a1a1aa",
      },
      fontFamily: {
        display: ["var(--font-bricolage)", "sans-serif"],
        body: ["var(--font-dm-sans)", "sans-serif"],
        label: ["var(--font-dm-sans)", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 20px -2px rgba(24,24,27,0.03), 0 2px 6px -1px rgba(24,24,27,0.02)",
        "card-hover": "0 10px 30px -4px rgba(24,24,27,0.06), 0 4px 12px -2px rgba(24,24,27,0.03)",
        sidebar: "0 4px 30px rgba(0,0,0,0.02)",
        sm: "0 1px 2px rgba(0,0,0,0.03)",
      },
      borderRadius: {
        card: "2rem",
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      backgroundImage: {
        "indigo-subtle": "linear-gradient(135deg, #eef0f3 0%, #ffffff 100%)",
        "brand-gradient": "linear-gradient(135deg, #18181b 0%, #3f3f46 100%)",
        "warm-base": "linear-gradient(180deg, #eef0f3 0%, #f4f5f7 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
