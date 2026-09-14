// this.importModule() on an asset module returns its content, not its path - a pitch loader
// that re-exports it as a plain JS module makes it resolve to a URL instead.
exports.pitch = function pitchLoader(remainingRequest) {
    return `import assetUrl from ${JSON.stringify(remainingRequest)}; export default assetUrl;`;
};
