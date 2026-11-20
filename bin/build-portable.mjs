import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(projectRoot, "floor-plan.html");
const outputPath = resolve(projectRoot, "dist/index.html");
const source = await readFile(sourcePath, "utf8");

const localPath = (url) => url.split("?", 1)[0];
const readAsset = (relativePath) => readFile(resolve(projectRoot, localPath(relativePath)), "utf8");

const stylesheetPattern = /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g;
const stylesheetLinks = [...source.matchAll(stylesheetPattern)];
const styles = await Promise.all(stylesheetLinks.map((match) => readAsset(match[1])));
const bundledStyles = `<style data-bundled-styles>\n${styles.join("\n\n")}\n</style>`;
const withStyles = source
  .replace(stylesheetPattern, "")
  .replace("</head>", `${bundledStyles}\n  </head>`);

const scriptPattern = /\s*<script\s+src="([^"]+)"\s+defer><\/script>/g;
const scriptTags = [...withStyles.matchAll(scriptPattern)];
const scripts = await Promise.all(scriptTags.map(async (match) => {
  if (localPath(match[1]) === "src/config/window-library.js") {
    const librarySource = await readFile(resolve(projectRoot, "lib/windows.json5"), "utf8");
    const library = vm.runInNewContext("(" + librarySource + ")", Object.create(null));
    if (!library || typeof library !== "object" || Array.isArray(library)) {
      throw new Error("lib/windows.json5 must contain a model object");
    }
    return "window.FloorPlanWindowLibrary = " + JSON.stringify(library) + ";";
  }
  if (localPath(match[1]) === "src/config/catalog.js") {
    const items = JSON.parse(await readFile(resolve(projectRoot, "lib/items.json"), "utf8"));
    if (!items || typeof items !== "object" || Array.isArray(items)) {
      throw new Error("lib/items.json must contain an item object");
    }
    const context = { window: {}, module: { exports: {} }, require: () => items };
    vm.runInNewContext(await readAsset(match[1]), context);
    return "window.FloorPlanCatalog = " + JSON.stringify(context.window.FloorPlanCatalog) + ";";
  }
  return readAsset(match[1]);
}));
const bundledScript = `<script data-bundled-scripts>\n${scripts.join("\n\n")}\n</script>`;
const portableHtml = withStyles
  .replace(scriptPattern, "")
  .replace("</body>", `${bundledScript}\n  </body>`);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, portableHtml, "utf8");
console.log(`Generated ${outputPath}`);
