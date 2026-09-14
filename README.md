# rspack: `this.importModule()` resolves a pitch-loader-wrapped `type: "asset"` module to the pitch loader's own source, not the real target's content

Minimal reproduction for a bug found while migrating a large monorepo's webpack build to rspack. Same config,
compiled by both bundlers side by side: webpack handles it correctly, rspack does not.

## Environment

- `@rspack/core`: 2.2.3 (also reproduced on 2.2.2)
- `webpack`: 5.108.4 (for comparison, unpatched)
- Node: 22.18.0

## Reproduction

```bash
npm install
node build.mjs
```

Expected output:

```
webpack: CORRECT - resolved to /assets/<hash>.txt containing the real target.txt content
rspack: CORRUPTED - resolved to data:text/plain;base64,aW1wb3J0IGFzc2V0VXJsIGZyb20g...
rspack: that value decodes to: import assetUrl from "/path/to/src/target.txt"; export default assetUrl;...
```

## Summary

A *pitch loader* - a loader whose `pitch` function returns a small generated module
(`import assetUrl from "<request>"; export default assetUrl;`) instead of processing the file's real bytes - is
the standard way to get a resolved URL back from `this.importModule()` for an asset module (calling
`importModule()` on the asset directly returns its inlined content, not its path). `this.importModule()` is
supposed to compile and evaluate that generated module, yielding the real target's URL as its `default` export.

`src/target.txt` is matched to `type: "asset"` (webpack/rspack's auto inline-vs-resource type, via
`parser.dataUrlCondition.maxSize`) and is 2001 bytes - well over any reasonable `maxSize`, so it must resolve to
a real resource file, never inlined.

- **webpack**: resolves correctly, to a resource file containing `target.txt`'s real content.
- **rspack**: resolves to a `data:` URI (already wrong - the file's too big to inline) whose base64-decoded
  "content" is the *pitch loader's own generated source text*, verbatim, not `target.txt`'s content.

rspack never re-enters the pipeline to compile the pitch loader's returned string as its own module (parse
`import`/`export`, resolve the nested import, evaluate it) - it uses that string directly as the module's final
content, for both the inline-size decision and the emitted bytes.

## Not just the size check

`maxSize: 0` (always resource, never inline) still reproduces it: rspack emits a real-looking resource file at a
real hashed path, but the file's contents are the pitch loader's source text, not `target.txt`'s. So this isn't
rspack mis-measuring the pitch output's length against `maxSize` - it uses the pitch loader's returned string as
the asset's content either way.

## Narrowing

`type: "asset/resource"` (no auto inline/resource decision) does **not** reproduce this - only `type: "asset"`
does. So it's specific to that code path (or its interaction with a pitch-shortcircuited module), not to
`this.importModule()` + pitch loaders in general.

## Files

- `pitch-loader.cjs` - generates `import assetUrl from "<request>"; export default assetUrl;`.
- `parent-loader.cjs` - resolves `src/target.txt` via `this.importModule()` + `pitch-loader.cjs`, exposing the
  result as `globalThis.RESOLVED`.
- `src/target.txt` - the target asset, 2001 bytes.
- `src/index.marker` - build entry point, matched to `parent-loader.cjs` by extension.
- `build.mjs` - builds with both bundlers, evaluates each bundle in an isolated `vm` context, decodes whatever
  `globalThis.RESOLVED` turned out to be, and compares it against `target.txt`'s real content.
