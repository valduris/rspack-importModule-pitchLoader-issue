// Minimal pitch loader, structurally identical to the pattern used to make
// `this.importModule()` return a resolved asset URL instead of the asset's inlined content
// (webpack's `this.importModule("./asset.ext")` on an asset module returns the module's actual
// content, not its path - a pitch loader that regenerates a plain JS re-export is the documented
// way around that).
exports.pitch = function pitchLoader(remainingRequest) {
    return `import assetUrl from ${JSON.stringify(remainingRequest)}; export default assetUrl;`;
};
