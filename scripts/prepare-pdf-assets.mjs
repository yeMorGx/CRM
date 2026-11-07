import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("pdfjs-dist/package.json"));
const destination = join(process.cwd(), "public", "pdfjs");
await mkdir(destination, { recursive: true });
await cp(join(source, "build/pdf.worker.min.mjs"), join(destination, "pdf.worker.min.mjs"));
await cp(join(source, "LICENSE"), join(destination, "LICENSE"));
for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(join(source, folder), join(destination, folder), { recursive: true });
}
