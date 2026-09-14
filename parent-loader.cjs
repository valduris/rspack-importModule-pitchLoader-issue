// A loader that resolves another module's real asset URL via this.importModule() + a pitch
// loader (pitch-loader.cjs), then exposes the resolved value as a global for the test harness
// to read after evaluating the bundle.
const path = require("node:path");

module.exports = function parentLoader() {
    const callback = this.async();
    const pitchLoaderPath = path.resolve(__dirname, "pitch-loader.cjs");
    const request = `!!${pitchLoaderPath}!${path.resolve(__dirname, "src/target.txt")}`;

    this.importModule(request, {}, (err, exports) => {
        if (err) {
            callback(err);
            return;
        }
        const resolved = exports && typeof exports === "object" && "default" in exports ? exports.default : exports;
        callback(null, `globalThis.RESOLVED = ${JSON.stringify(resolved)};`);
    });
};
