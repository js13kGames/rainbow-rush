import { defineConfig, type Plugin } from "vite";

const internalPropertyPattern = new RegExp(
  `^(?:${[
    "age",
    "alive",
    "angle",
    "attackKind",
    "baseY",
    "blinkOffset",
    "blinkPeriod",
    "dashVx",
    "dashVy",
    "death",
    "depth",
    "enemies",
    "enemyBlinkImages",
    "enemyChargeImages",
    "enemyDashChargeImages",
    "enemyImages",
    "enemyLaughImages",
    "facing",
    "hue",
    "kill",
    "launch",
    "life",
    "music",
    "pathKind",
    "pause",
    "phase",
    "player",
    "playerImages",
    "previousX",
    "previousY",
    "projectile",
    "projectileImages",
    "popupColor",
    "popupText",
    "radius",
    "resume",
    "rideAgain",
    "size",
    "skipTutorial",
    "source",
    "speed",
    "startGame",
    "stateDuration",
    "stateTimer",
    "toggle",
    "tone",
    "turn",
    "unlock",
    "vx",
    "vy",
    "weakness",
  ].join("|")})$`,
);

const inlineEntryScript = (): Plugin => ({
  name: "inline-entry-script",
  enforce: "post",
  generateBundle(_options, bundle) {
    const html = bundle["index.html"];
    if (!html || html.type !== "asset" || typeof html.source !== "string") {
      this.error("Built index.html is unavailable for script inlining");
    }

    const scripts = Object.values(bundle).filter((output) => output.type === "chunk");
    if (scripts.length !== 1) {
      this.error(`Expected one JavaScript bundle, found ${scripts.length}`);
    }

    const [script] = scripts;
    const escapedFileName = script.fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const scriptTag = new RegExp(`<script\\b(?=[^>]*\\bsrc=["'](?:\\./)?${escapedFileName}["'])[^>]*>\\s*</script>`);
    const inlineCode = script.code.replaceAll("</script", "<\\/script");
    const inlinedHtml = html.source.replace(scriptTag, `<script type="module">${inlineCode}</script>`);

    if (inlinedHtml === html.source) {
      this.error(`Could not find ${script.fileName} reference in index.html`);
    }

    html.source = inlinedHtml;
    delete bundle[script.fileName];
  },
});

export default defineConfig({
  base: "./",
  plugins: [inlineEntryScript()],
  build: {
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    emptyOutDir: true,
    minify: "terser",
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    sourcemap: false,
    target: "es2022",
    terserOptions: {
      ecma: 2022,
      module: true,
      compress: {
        ecma: 2022,
        passes: 5,
        toplevel: true,
        drop_console: true,
        drop_debugger: true,
        pure_getters: true,
        arguments: true,
        unsafe: true,
        unsafe_arrows: true,
        unsafe_comps: true,
        unsafe_Function: true,
        unsafe_math: true,
        unsafe_methods: true,
        unsafe_proto: true,
        unsafe_regexp: true,
        unsafe_undefined: true,
      },
      mangle: {
        toplevel: true,
        properties: {
          regex: internalPropertyPattern,
        },
      },
      format: {
        ecma: 2022,
        comments: false,
        semicolons: false,
      },
    },
    rolldownOptions: {
      output: {
        assetFileNames: "assets/[name][extname]",
        chunkFileNames: "assets/[name].js",
        entryFileNames: "assets/game.js",
      },
    },
  },
});
