// Minimal repro: this.importModule() combined with a pitch loader, targeting a module handled by
// type: "asset" (webpack/rspack's auto inline-vs-resource asset type), resolves to the pitch
// loader's own generated JS source text under rspack instead of the real target file's content -
// with webpack but not with rspack.

// Usage: npm install && node build.mjs
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { fileURLToPath } from "node:url";
import webpack from "webpack";
import { rspack } from "@rspack/core";

const dir = path.dirname(fileURLToPath(import.meta.url));
const realContent = fs.readFileSync(path.join(dir, "src/target.txt"), "utf-8");

// type: "asset" (not "asset/resource") triggers the bug - it's webpack/rspack's auto
// inline-vs-resource asset type, decided by parser.dataUrlCondition.maxSize. src/target.txt is
// 2001 bytes, well over maxSize, so it must resolve to a real resource file, never be inlined.
const config = (outDir) => ({
    mode: "production",
    devtool: false,
    context: dir,
    entry: path.join(dir, "src/index.marker"),
    output: { path: path.join(dir, outDir), filename: "bundle.js", publicPath: "/assets/" },
    module: {
        rules: [
            {
                test: /\.txt$/,
                type: "asset",
                parser: { dataUrlCondition: { maxSize: 1024 } },
            },
            { test: /\.marker$/, use: [path.resolve(dir, "parent-loader.cjs")] },
        ],
    },
    optimization: { minimize: false },
});

function evaluateAndGetResolved(bundlePath) {
    const code = fs.readFileSync(bundlePath, "utf-8");
    const context = vm.createContext({ console });
    vm.runInContext(code, context);
    return context.RESOLVED;
}

function run(compiler, outDir) {
    return new Promise((resolve, reject) => {
        compiler.run((err, stats) => {
            if (err || stats.hasErrors()) {
                reject(err ?? new Error(stats.toString({ preset: "errors-only" })));
                return;
            }
            compiler.close(() => resolve(path.join(dir, outDir, "bundle.js")));
        });
    });
}

function resolveActualContent(resolved, outDir) {
    if (resolved.startsWith("data:")) {
        return Buffer.from(resolved.split(",")[1], "base64").toString("utf-8");
    }
    return fs.readFileSync(path.join(dir, outDir, path.basename(resolved)), "utf-8");
}

async function check(name, compiler, outDir) {
    const bundlePath = await run(compiler, outDir);
    const resolved = evaluateAndGetResolved(bundlePath);
    const actualContent = resolveActualContent(resolved, outDir);

    if (actualContent === realContent) {
        console.log(`${name}: CORRECT - resolved to ${resolved.startsWith("data:") ? "an inlined data URI" : resolved} containing the real target.txt content`);
    } else {
        console.log(`${name}: CORRUPTED - resolved to ${resolved.slice(0, 80)}${resolved.length > 80 ? "..." : ""}`);
        console.log(`${name}: that value decodes to: ${actualContent.slice(0, 120)}${actualContent.length > 120 ? "..." : ""}`);
    }
}

await check("webpack", webpack(config("dist-webpack")), "dist-webpack");
await check("rspack", rspack(config("dist-rspack")), "dist-rspack");
