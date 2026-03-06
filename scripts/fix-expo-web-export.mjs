import { readFile, writeFile } from "node:fs/promises";

const targetPath = process.argv[2];

if (!targetPath) {
  throw new Error("Target HTML path is required.");
}

const html = await readFile(targetPath, "utf8");
const nextHtml = html.replace(
  /<script\s+src="(\/_expo\/static\/js\/web\/[^"]+\.js)"\s+defer><\/script>/g,
  '<script type="module" src="$1" defer></script>'
);

if (html !== nextHtml) {
  await writeFile(targetPath, nextHtml, "utf8");
}
