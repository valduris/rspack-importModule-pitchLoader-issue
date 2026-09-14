// Resolves target.txt's URL via this.importModule() + pitch-loader.cjs, exposing it as a global
// for the test harness to read.
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
