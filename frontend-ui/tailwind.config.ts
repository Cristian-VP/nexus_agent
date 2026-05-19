import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        cardForeground: "hsl(var(--card-foreground))",
        border: "hsl(var(--border))",
        muted: "hsl(var(--muted))",
        mutedForeground: "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        accentForeground: "hsl(var(--accent-foreground))"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.35)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"]
      },
      backgroundImage: {
        "mesh-gradient":
          "radial-gradient(circle at 20% 20%, rgba(255, 159, 67, 0.24), transparent 0 28%), radial-gradient(circle at 80% 0%, rgba(0, 209, 178, 0.18), transparent 0 24%), radial-gradient(circle at 80% 80%, rgba(99, 102, 241, 0.24), transparent 0 22%), linear-gradient(180deg, rgba(6, 10, 24, 0.98), rgba(9, 15, 32, 1))"
      }
    }
  },
  plugins: []
};

export default config;