// Servidor de prueba local (no se usa en Netlify): `node dev.mjs` (o `node dev.mjs 100` con 100 inscritos de prueba)
// Guarda los datos en memoria; se pierden al cerrarlo. PIN local: 1234 (o la variable ADMIN_PIN).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { crearHandler } from "./lib/logica.mjs";

process.env.ADMIN_PIN ??= "1234";  // ADMIN_PIN="" simula Netlify sin variable (el PIN se crea desde la app)
const PORT = Number(process.env.PORT) || 8888;
const PUBLIC = join(import.meta.dirname, "public");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

const mem = new Map();
const store = {
  get: async (k) => (mem.has(k) ? JSON.parse(mem.get(k)) : null),
  setJSON: async (k, v) => { mem.set(k, JSON.stringify(v)); },
  set: async (k, v) => { mem.set(k, JSON.stringify(v)); },
  delete: async (k) => { mem.delete(k); },
  list: async ({ prefix = "" } = {}) => ({ blobs: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
};
const api = crearHandler(() => store);

const SEMILLA = Math.min(Number(process.argv[2]) || 0, 2000);
if (SEMILLA) {
  const nombres = ["Ana", "Carlos", "Luisa", "Jorge", "María Fernanda", "Andrés", "Paola", "Daniel", "Sofía", "Camilo", "Valentina", "Juan Pablo",
    "Laura", "Santiago", "Natalia", "Felipe", "Daniela", "Sebastián", "Carolina", "Mateo", "Juliana", "Alejandro", "Mariana", "Diego", "Isabella",
    "Nicolás", "Gabriela", "Óscar", "Ximena", "Ricardo"];
  const apellidos = ["Martínez", "Pérez", "Gómez", "Rodríguez", "Ruiz", "Castillo", "Herrera", "Ortiz", "Vargas", "Torres", "Mora", "Rojas",
    "Díaz", "Romero", "Suárez", "Jiménez", "Navarro", "Morales", "Ramírez", "Castro", "Mejía", "Ospina", "Salazar", "Cárdenas", "Peña",
    "Guerrero", "Rincón", "Ávila", "Barrios", "De la Hoz"];
  for (let i = 0; i < SEMILLA; i++) {
    const vuelta = Math.floor(i / nombres.length);   // cada vuelta cambia los apellidos para no repetir nombres
    const nombre = `${nombres[i % nombres.length]} ${apellidos[(i + vuelta * 7) % apellidos.length]} ${apellidos[(i * 13 + vuelta * 11 + 5) % apellidos.length]}`;
    const r = await api(new Request("http://localhost/api/registro", { method: "POST", body: JSON.stringify({ nombre, cedula: String(1000000 + i * 7919) }) }));
    if (r.status !== 201) throw new Error(`Siembra: ${nombre} → ${r.status} ${await r.text()}`);
  }
  console.log(`Sembrados ${SEMILLA} inscritos de prueba`);
}

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks);
      const r = await api(new Request("http://localhost" + req.url, { method: req.method, headers: req.headers, body }));
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text());
      return;
    }
    let ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (ruta.endsWith("/")) ruta += "index.html";
    const archivo = normalize(join(PUBLIC, ruta));
    if (!archivo.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
    const datos = await readFile(archivo).catch(() => readFile(archivo + ".html"));
    res.writeHead(200, { "content-type": TIPOS[extname(archivo)] || "text/html; charset=utf-8" }); res.end(datos);
  } catch { res.writeHead(404); res.end("No encontrado"); }
}).listen(PORT, () => console.log(`Ruleta local en http://localhost:${PORT} (PIN ${process.env.ADMIN_PIN})`));
