import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import type { PluginCreator } from "postcss";

// Sub-path deployment: set VITE_BASE_URL=/vehix/ in production
const base = process.env.VITE_BASE_URL || "/";

/**
 * PostCSS plugin to strip empty :is() pseudo-class selectors.
 *
 * Tailwind CSS v4's @apply processing can generate invalid empty :is()
 * when variants like motion-reduce: are @apply'd to pseudo-elements
 * (e.g. ::after, ::before). This PostCSS plugin runs after Tailwind's
 * transform and fixes the CSS before minification.
 */
const postcssStripEmptyIs: PluginCreator<{}> = () => {
  // Recursively remove empty :is() and :not() pseudo-classes.
  // Tailwind v4 can generate :is() and :not(:is()) with no arguments
  // when @apply variants are used on pseudo-elements.
  const strip = (s: string): string => {
    const prev = s;
    s = s.replace(/:not\(\s*:is\(\s*\)\s*\)/g, ""); // :not(:is()) → ""
    s = s.replace(/:is\(\s*\)/g, "");                 // :is() → ""
    s = s.replace(/:not\(\s*\)/g, "");                // :not() → ""
    return s === prev ? s : strip(s);
  };
  return {
    postcssPlugin: "postcss-strip-empty-is",
    Rule(rule) {
      rule.selector = strip(rule.selector);
    },
    AtRule(atRule) {
      if (atRule.params) {
        atRule.params = strip(atRule.params);
      }
    },
  };
};
postcssStripEmptyIs.postcss = true;

/**
 * Vite plugin to strip empty :is() pseudo-class from final CSS bundle.
 * Belt-and-suspenders: PostCSS handles individual files; this catches
 * any remaining occurrences in the concatenated output.
 */
function stripEmptyIsPseudo(): Plugin {
  return {
    name: "strip-empty-is-pseudo",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (
          chunk.type === "asset" &&
          typeof chunk.source === "string" &&
          fileName.endsWith(".css")
        ) {
          const before = chunk.source.length;
          chunk.source = chunk.source.replace(/:is\(\s*\)/g, "");
          if (chunk.source.length !== before) {
            const removed = (before - chunk.source.length) / ":is()".length;
            this.info(`removed ${removed} empty :is() from ${fileName}`);
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripEmptyIsPseudo()],
  css: {
    postcss: {
      plugins: [postcssStripEmptyIs({})],
    },
  },
  base,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/mcp": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
