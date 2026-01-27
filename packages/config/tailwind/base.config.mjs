/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        accent: {
          DEFAULT: "#61ABEA", // ani-blue
          400: "#61ABEA",
        },
        signal: {
          green: "#4ade80", // green-400
          red: "#ef4444",   // red-500
        },
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
      },
      fontFamily: {
        sans: ["var(--font-mono)", "monospace"],
        mono: ["var(--font-mono)", "monospace"],
        heading: ["var(--font-mono)", "monospace"],
      },
      animation: {
        'signal-pulse': 'signal-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'signal-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
