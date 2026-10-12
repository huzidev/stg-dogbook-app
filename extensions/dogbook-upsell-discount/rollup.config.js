// Shopify Function JS → WASM pipeline.
//
// Rollup bundles `src/run.js` into a single ESM file; Shopify's internal
// build step (invoked by `shopify app function build` when running
// `shopify app dev` or `deploy`) then runs Javy against the bundled output
// to produce `dist/function.wasm`.
//
// If building outside of the Shopify CLI, chain `javy compile dist/function.js
// -o dist/function.wasm` after this script.

export default {
  input: "./src/run.js",
  output: {
    file: "dist/function.js",
    format: "esm",
  },
};
