import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import assert from "node:assert/strict";

const root = resolve("public");
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
const files = await walk(join(root, "docs"));
const pages = files.filter(file => file.endsWith(".html"));
assert(pages.length >= 15, "Expected all documentation pages and a 404 page");
for (const path of ["index.html", "404.html", "docs/index.html", "docs/404.html", "docs/pagefind/pagefind.js"]) {
  assert((await stat(join(root, path))).isFile(), "Missing output: " + path);
}
let links = 0;
const failures = [];
for (const file of pages) {
  const html = await readFile(file, "utf8");
  const base = "https://docs.local/" + relative(root, file).replace(/index\.html$/, "");
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = new URL(match[1].replaceAll("&amp;", "&"), base);
    if (url.origin !== "https://docs.local") continue;
    const path = decodeURIComponent(url.pathname);
    let target = resolve(root, "." + path);
    assert(target.startsWith(root + "/") || target === root, "Path escapes build output");
    try {
      if ((await stat(target)).isDirectory()) target = join(target, "index.html");
      await stat(target);
      if (url.hash && target.endsWith(".html")) {
        const body = await readFile(target, "utf8");
        const id = decodeURIComponent(url.hash.slice(1));
        assert(body.includes('id="' + id + '"'), "Missing anchor " + id);
      }
      links++;
    } catch (error) {
      failures.push(relative(root, file) + " -> " + match[1] + ": " + error.message);
    }
  }
}
assert.equal(failures.length, 0, failures.join("\n"));
console.log("Verified " + pages.length + " HTML pages, " + links + " local links/assets/anchors, and Pagefind output.");
