# rspack: `this.importModule()` resolves a pitch-loader-wrapped `type: "asset"` module to the pitch loader's own source, not the real target's content

Minimal reproduction for a bug found while migrating a large monorepo's webpack build to rspack. The same exact
config, compiled by both bundlers side by side: webpack handles it correctly, rspack does not.

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

A common pattern for resolving another module's real build-time URL from inside a loader (used e.g. to resolve a
texture reference inside a 3D model file) is a *pitch loader*: a loader whose `pitch` function returns a small
generated JS module (`import assetUrl from "<request>"; export default assetUrl;`) instead of processing the
requested file's actual bytes. Calling `this.importModule()` on that pitch-loader-wrapped request is supposed to
compile and evaluate the generated module, yielding the real target's resolved URL as the `default` export -
this is the documented way to get a URL string back from `importModule()` for an asset module, since calling
`importModule()` on the asset module directly returns its inlined content instead of its path.

With `optimization`/`module.rules` matching the target file to `type: "asset"` (webpack/rspack's auto
inline-vs-resource asset type, controlled by `parser.dataUrlCondition.maxSize`), this repro's `src/target.txt` is
2001 bytes - comfortably over any reasonable `maxSize`, so it must always resolve to a real resource file, never
be inlined.

- **webpack**: resolves correctly to a real resource file containing `target.txt`'s actual content.
- **rspack**: resolves to a `data:` URI - already wrong, since the file is far too large to inline - and the
  "content" of that data URI, once base64-decoded, isn't `target.txt`'s content at all. It's the *pitch loader's
  own generated JS source text*, verbatim: `import assetUrl from "<path to target.txt>"; export default assetUrl;`.

rspack never re-enters the pipeline to compile the pitch loader's returned string as its own JS module (parse the
`import`/`export`, resolve the nested import, evaluate it) - it treats that returned string as the module's
final, literal byte-content directly, for both the inline-size decision and the actual emitted bytes.

## It isn't just about the size check

Forcing `parser.dataUrlCondition.maxSize: 0` (always resource, never inline) still reproduces the underlying bug,
just differently: rspack then emits a plausible-looking resource file at a real hashed path - but the *file
itself* contains the pitch loader's generated JS source text, not `target.txt`'s real content. So this isn't
rspack mis-measuring the pitch loader's output length against `maxSize` (~150 bytes vs. the real 2001-byte file) -
it's using the pitch loader's returned string as the asset's content in both code paths, inline or not.

## Narrowing

`type: "asset/resource"` (no auto inline/resource decision) does **not** reproduce this - only `type: "asset"`
(the auto-deciding variant) does. So the bug is specific to that code path, or to its interaction with a
pitch-shortcircuited module, rather than to `this.importModule()` + pitch loaders in general.

## Files

- `pitch-loader.cjs` - the pitch loader, generating `import assetUrl from "<request>"; export default assetUrl;`.
- `parent-loader.cjs` - calls `this.importModule()` on `src/target.txt` wrapped by `pitch-loader.cjs`, and exposes
  the resolved value as `globalThis.RESOLVED` for the test harness to read.
- `src/target.txt` - the real target asset, 2001 bytes.
- `src/index.marker` - the build entry point; matched to `parent-loader.cjs` by extension.
- `build.mjs` - builds `src/index.marker` with both webpack and rspack under the identical config, evaluates each
  output bundle in an isolated `vm` context, decodes whatever `globalThis.RESOLVED` turned out to be (a `data:`
  URI, or a path to read from the output directory), and compares it against `target.txt`'s real content.
