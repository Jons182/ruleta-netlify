// Lógica del servidor (independiente de Netlify para poder probarla en local).
// Datos en el almacén:
//   insc/<cedula>/<datos> -> nombre y hora codificados en la clave: la lista completa sale de UN solo list(),
//                            sin leer cada blob (una entrada por persona: inscripciones simultáneas no se pisan)
//   asistentes/<cedula>   -> formato anterior (un JSON por persona); se migra solo al leerlo
//   estado               -> { premios: [...], ganadores: [...] }  (solo lo escribe el administrador)
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const ESTADO = "estado";
const CONFIG_PIN = "config/pin";   // { sal, hash } del PIN creado desde la app (si no hay variable ADMIN_PIN)
const PREFIJO = "insc/";
const LEGADO = "asistentes/";
const claveDe = (a) => `${PREFIJO}${a.cedula}/${Buffer.from(JSON.stringify([a.nombre, a.hora])).toString("base64url")}`;
const desdeClave = (key) => {
  const [, cedula, datos] = key.split("/");
  const [nombre, hora] = JSON.parse(Buffer.from(datos, "base64url").toString());
  return { nombre, cedula, hora };
};
const RE_CEDULA = /^\d{4,15}$/;
const RE_ID = /^[\w-]{1,40}$/;

class ErrorCliente extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const texto = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const cedulaDe = (v) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/[.\s-]/g, "") : "");

const igual = (a, b) => {
  const h = (s) => createHash("sha256").update(String(s)).digest();
  return timingSafeEqual(h(a), h(b));
};

async function leerJSON(req) {
  const raw = await req.text();
  if (raw.length > 200_000) throw new ErrorCliente("Solicitud demasiado grande", 413);
  try { return JSON.parse(raw || "{}"); } catch { throw new ErrorCliente("JSON inválido"); }
}

async function leerEstado(store) {
  const e = await store.get(ESTADO, { type: "json" });
  return { premios: Array.isArray(e?.premios) ? e.premios : [], ganadores: Array.isArray(e?.ganadores) ? e.ganadores : [] };
}

async function leerAsistentes(store) {
  const [{ blobs }, legado] = await Promise.all([store.list({ prefix: PREFIJO }), store.list({ prefix: LEGADO })]);
  const lista = blobs.map((b) => desdeClave(b.key));
  for (const b of legado.blobs) {                    // migración única del formato anterior
    const a = await store.get(b.key, { type: "json" });
    if (a) { await store.set(claveDe(a), "1"); lista.push(a); }
    await store.delete(b.key);
  }
  const vistos = new Set();                          // si una cédula quedó doble (envíos simultáneos), vale la primera
  return lista.sort((a, b) => a.hora.localeCompare(b.hora)).filter((a) => !vistos.has(a.cedula) && vistos.add(a.cedula));
}

// claves de una persona (formato nuevo y anterior) y sus datos
async function buscar(store, cedula) {
  const [{ blobs }, legado] = await Promise.all([store.list({ prefix: PREFIJO + cedula + "/" }), store.get(LEGADO + cedula, { type: "json" })]);
  return { claves: [...blobs.map((b) => b.key), ...(legado ? [LEGADO + cedula] : [])], asistente: blobs[0] ? desdeClave(blobs[0].key) : legado };
}

async function estadoCompleto(store) {
  const [estado, asistentes] = await Promise.all([leerEstado(store), leerAsistentes(store)]);
  return { asistentes, ...estado };
}

async function registrar(store, body) {
  const nombre = texto(body.nombre, 80);
  const cedula = cedulaDe(body.cedula);
  if (nombre.length < 3 || !/\p{L}/u.test(nombre)) throw new ErrorCliente("Escribe tu nombre completo");
  if (!RE_CEDULA.test(cedula)) throw new ErrorCliente("La cédula debe tener solo números (4 a 15 dígitos)");
  if ((await buscar(store, cedula)).asistente) throw new ErrorCliente("Esta cédula ya está inscrita", 409);
  await store.set(claveDe({ nombre, cedula, hora: new Date().toISOString() }), "1");
  return json({ ok: true, nombre }, 201);
}

function validarPremios(lista, ganadores) {
  if (!Array.isArray(lista) || lista.length > 200) throw new ErrorCliente("Lista de premios inválida");
  const ids = new Set();
  return lista.map((p) => {
    const id = typeof p?.id === "string" && RE_ID.test(p.id) ? p.id : null;
    const nombre = texto(p?.nombre, 80);
    const cantidad = Number(p?.cantidad);
    if (!id || ids.has(id)) throw new ErrorCliente("Premio con identificador inválido");
    ids.add(id);
    if (!nombre) throw new ErrorCliente("Todos los premios necesitan un nombre");
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 500) throw new ErrorCliente(`Cantidad inválida en "${nombre}"`);
    const entregados = ganadores.filter((g) => g.premioId === id).length;
    if (cantidad < entregados) throw new ErrorCliente(`"${nombre}" ya tiene ${entregados} ganadores; la cantidad no puede ser menor`);
    const excluidos = Array.isArray(p.excluidos) ? [...new Set(p.excluidos.map(cedulaDe).filter((c) => RE_CEDULA.test(c)))] : [];
    return { id, nombre, cantidad, excluidos };
  });
}

async function registrarGanador(store, body) {
  const premioId = typeof body.premioId === "string" ? body.premioId : "";
  const cedula = cedulaDe(body.cedula);
  const estado = await leerEstado(store);
  const premio = estado.premios.find((p) => p.id === premioId);
  if (!premio) throw new ErrorCliente("Ese premio ya no existe", 409);
  const previo = estado.ganadores.find((g) => g.cedula === cedula);
  if (previo && previo.premioId === premioId) return json(await estadoCompleto(store)); // reintento del mismo guardado
  if (previo) throw new ErrorCliente(`${previo.nombre} ya ganó "${previo.premio}"`, 409);
  if (estado.ganadores.filter((g) => g.premioId === premioId).length >= premio.cantidad)
    throw new ErrorCliente(`"${premio.nombre}" ya se entregó completo`, 409);
  if (premio.excluidos.includes(cedula)) throw new ErrorCliente("Esa persona no participa en este premio", 409);
  const { asistente } = await buscar(store, cedula);
  if (!asistente) throw new ErrorCliente("Esa persona ya no está inscrita", 409);
  estado.ganadores.push({ premioId, premio: premio.nombre, cedula, nombre: asistente.nombre, hora: new Date().toISOString() });
  await store.setJSON(ESTADO, estado);
  return json(await estadoCompleto(store));
}

export function crearHandler(abrirStore) {
  return async (req) => {
    try {
      const ruta = new URL(req.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
      const metodo = req.method;
      const store = abrirStore();

      // única ruta pública: la inscripción desde el QR
      if (ruta === "registro" && metodo === "POST") return await registrar(store, await leerJSON(req));

      // PIN: la variable ADMIN_PIN de Netlify manda; si no existe, el que se creó desde la app
      const enviado = req.headers.get("x-admin-pin") || "";
      const pinEnv = process.env.ADMIN_PIN;
      if (pinEnv) {
        if (!igual(enviado, pinEnv)) return json({ error: "PIN incorrecto" }, 401);
      } else {
        const guardado = await store.get(CONFIG_PIN, { type: "json" });
        if (!guardado) {
          // shortcut: el primero en crear el PIN queda como administrador; créalo apenas publiques
          if (ruta !== "pin" || metodo !== "POST") return json({ error: "Crea el PIN de administrador", crearPin: true }, 428);
          const nuevo = String((await leerJSON(req)).pin || "");
          if (nuevo.length < 4 || nuevo.length > 64) throw new ErrorCliente("El PIN debe tener entre 4 y 64 caracteres");
          const sal = randomBytes(16).toString("hex");
          await store.setJSON(CONFIG_PIN, { sal, hash: scryptSync(nuevo, sal, 32).toString("hex") });
          return json({ ok: true }, 201);
        }
        const hash = scryptSync(enviado, guardado.sal, 32);
        if (!timingSafeEqual(hash, Buffer.from(guardado.hash, "hex"))) return json({ error: "PIN incorrecto" }, 401);
      }

      if (ruta === "estado" && metodo === "GET") return json(await estadoCompleto(store));

      if (ruta === "premios" && metodo === "PUT") {
        const estado = await leerEstado(store);
        estado.premios = validarPremios((await leerJSON(req)).premios, estado.ganadores);
        await store.setJSON(ESTADO, estado);
        return json(await estadoCompleto(store));
      }

      if (ruta === "ganador" && metodo === "POST") return await registrarGanador(store, await leerJSON(req));

      // reiniciar: todos vuelven a participar y los premios quedan sin entregar (la lista de premios se conserva)
      if (ruta === "reiniciar" && metodo === "POST") {
        const estado = await leerEstado(store);
        await store.setJSON(ESTADO, { premios: estado.premios, ganadores: [] });
        return json(await estadoCompleto(store));
      }

      if (ruta.startsWith("asistentes/") && metodo === "DELETE") {
        const cedula = cedulaDe(decodeURIComponent(ruta.slice("asistentes/".length)));
        if (!RE_CEDULA.test(cedula)) throw new ErrorCliente("Cédula inválida");
        await Promise.all((await buscar(store, cedula)).claves.map((k) => store.delete(k)));
        return json(await estadoCompleto(store));
      }

      // borrar todo el evento: inscritos y ganadores (los premios se conservan)
      if (ruta === "asistentes" && metodo === "DELETE") {
        const listas = await Promise.all([store.list({ prefix: PREFIJO }), store.list({ prefix: LEGADO })]);
        await Promise.all(listas.flatMap((l) => l.blobs).map((b) => store.delete(b.key)));
        const estado = await leerEstado(store);
        await store.setJSON(ESTADO, { premios: estado.premios.map((p) => ({ ...p, excluidos: [] })), ganadores: [] });
        return json(await estadoCompleto(store));
      }

      return json({ error: "No encontrado" }, 404);
    } catch (e) {
      if (e instanceof ErrorCliente) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Error del servidor" }, 500);
    }
  };
}
