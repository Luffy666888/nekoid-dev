import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const directory = new URL("../scripts/fixtures/persona-photo-eval/", import.meta.url);
const sources = JSON.parse(await readFile(new URL("sources.json", directory), "utf8"));
await mkdir(new URL("images/", directory), { recursive: true });
for (const source of sources) {
  const destination = new URL(`images/${source.file}`, directory);
  let existing;
  try {
    existing = await readFile(destination);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (existing && createHash("sha256").update(existing).digest("hex") === source.sha256) {
    console.log(`${source.file}: verified`);
    continue;
  }
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`${source.file}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
    throw Error(
      `${source.file}: source changed; review and version the dataset, do not silently overwrite`,
    );
  await writeFile(destination, bytes);
  console.log(`${source.file}: restored`);
}
