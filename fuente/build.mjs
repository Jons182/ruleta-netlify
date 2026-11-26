// Compila fuente/ruleta.src.html (JSX) -> public/ruleta.html (JS normal, sin Babel en el navegador).
// Uso: npm install && npm run build-ruleta
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const Babel = require(process.env.BABEL_PATH || "@babel/standalone");
const dir = import.meta.dirname;
let html = readFileSync(join(dir, "ruleta.src.html"), "utf8");

const TAG_BABEL = /<script src="https:\/\/unpkg\.com\/@babel\/standalone@[\d.]+\/babel\.min\.js"><\/script>\r?\n/;
if (!TAG_BABEL.test(html)) throw new Error("no se encontró el <script> de Babel");
html = html.replace(TAG_BABEL, "");

const BLOQUE = /<script type="text\/babel">([\s\S]*?)<\/script>/;
const m = html.match(BLOQUE);
if (!m) throw new Error("no se encontró el bloque text/babel");
const { code } = Babel.transform(m[1], { presets: [["react", { runtime: "classic" }]] });
html = html.replace(BLOQUE, () => "<script>\n// Generado desde fuente/ruleta.src.html: edita allá y ejecuta npm run build-ruleta\n" + code + "\n</script>");

writeFileSync(join(dir, "..", "public", "ruleta.html"), html);
console.log("public/ruleta.html listo");
