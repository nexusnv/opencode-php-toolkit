// Package entrypoint for OpenCode directory loading.
//
// OpenCode resolves a plugin *directory* by loading `<dir>/index.ts` or
// `<dir>/index.js` — it does not consult package.json `main`. This shim
// re-exports the built plugin so both `file://` directory entries and
// published npm installs resolve. Run `npm run build` after editing `src/`.
export { default } from "./dist/index.js";
