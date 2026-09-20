import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(projectRoot, "floor-plan.html");
const outputPath = resolve(projectRoot, "dist/floor-plan.html");
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
const scripts = await Promise.all(scriptTags.map((match) => readAsset(match[1])));
const bundledScript = `<script data-bundled-scripts>\n${scripts.join("\n\n")}\n</script>`;
const portableHtml = withStyles
  .replace(scriptPattern, "")
  .replace("</body>", `${bundledScript}\n  </body>`);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, portableHtml, "utf8");
console.log(`Generated ${outputPath}`);
