import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = dirname(fileURLToPath(import.meta.url));
const svg = await readFile(join(root, "yui-home-mark.svg"), "utf8");
const outDir = join(root, "out");
await mkdir(outDir, { recursive: true });

function render(size) {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "#14120f",
  })
    .render()
    .asPng();
}

await writeFile(join(outDir, "yui-home-alexa-1024.png"), render(1024));
await writeFile(join(outDir, "yui-home-alexa-512.png"), render(512));
await writeFile(join(outDir, "yui-home-alexa-108.png"), render(108));
console.log("ok");
