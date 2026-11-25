// argon: trims the build output in ../argon after `vite build`.
// - asm.js builds of libav are only used by browsers without WebAssembly
//   (~50 MB), so they are dropped to keep the site repo small.
// - _headers is a Cloudflare Pages file that GitHub Pages ignores.
// - sitemap.xml would point at the wrong paths.
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const out = new URL("../argon/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const libav = join(out, "_libav");

let removed = 0;
for (const file of await readdir(libav)) {
    if (file.includes(".asm.")) {
        await rm(join(libav, file));
        removed++;
    }
}
await rm(join(out, "_headers"), { force: true });
// the generated sitemap lists root paths (itschu.gg/about), not /argon ones
await rm(join(out, "sitemap.xml"), { force: true });

console.log(`prune-build: removed ${removed} asm.js files, _headers and sitemap.xml from ${out}`);
