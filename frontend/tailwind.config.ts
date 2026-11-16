import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          green: "#00ff88",
          red: "#ff4444",
          blue: "#4488ff",
          yellow: "#ffcc00",
        },
      },
      keyframes: {
        "pixel-shift": {
          "0%": { transform: "translate(0px, 0px)" },
          "25%": { transform: "translate(15px, 0px)" },
          "50%": { transform: "translate(15px, 15px)" },
          "75%": { transform: "translate(0px, 15px)" },
          "100%": { transform: "translate(0px, 0px)" },
        },
      },
      animation: {
        "pixel-shift": "pixel-shift 60s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
