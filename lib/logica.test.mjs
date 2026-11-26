// node --test lib/logica.test.mjs   (prueba la lógica del servidor con un almacén en memoria)
import test from "node:test";
import assert from "node:assert/strict";
import { crearHandler } from "./logica.mjs";

process.env.ADMIN_PIN = "9999";
const nuevo = (mem = new Map()) => {
  return crearHandler(() => ({
    get: async (k) => (mem.has(k) ? JSON.parse(mem.get(k)) : null),
    setJSON: async (k, v) => { mem.set(k, JSON.stringify(v)); },
    set: async (k, v) => { mem.set(k, JSON.stringify(v)); },
    delete: async (k) => { mem.delete(k); },
    list: async ({ prefix }) => ({ blobs: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  }));
};
const llamar = async (api, metodo, ruta, body, pin = "9999") => {
  const r = await api(new Request("http://x/api/" + ruta, {
    method: metodo, headers: { "x-admin-pin": pin }, body: body && JSON.stringify(body),
  }));
  return { status: r.status, data: await r.json() };
};

test("flujo completo", async () => {
  const api = nuevo();
  assert.equal((await llamar(api, "POST", "registro", { nombre: "  Ana   Pérez ", cedula: "1.234.567" }, "")).status, 201);
  assert.equal((await llamar(api, "POST", "registro", { nombre: "Otra", cedula: "1234567" }, "")).status, 409, "cédula repetida");
  assert.equal((await llamar(api, "POST", "registro", { nombre: "Al", cedula: "12" }, "")).status, 400);
  await llamar(api, "POST", "registro", { nombre: "Luis Gómez", cedula: "7654321" }, "");

  assert.equal((await llamar(api, "GET", "estado", null, "mal")).status, 401, "PIN incorrecto");
  let { data } = await llamar(api, "GET", "estado");
  assert.equal(data.asistentes[0].nombre, "Ana Pérez");
  assert.equal(data.asistentes[0].cedula, "1234567");

  ({ data } = await llamar(api, "PUT", "premios", { premios: [{ id: "tv", nombre: "TV", cantidad: 1, excluidos: ["7654321"] }] }));
  assert.equal(data.premios[0].excluidos.length, 1);

  assert.equal((await llamar(api, "POST", "ganador", { premioId: "tv", cedula: "7654321" })).status, 409, "excluido no gana");
  assert.equal((await llamar(api, "POST", "ganador", { premioId: "tv", cedula: "1234567" })).status, 200);
  assert.equal((await llamar(api, "POST", "ganador", { premioId: "tv", cedula: "1234567" })).status, 200, "reintento idempotente");
  ({ data } = await llamar(api, "GET", "estado"));
  assert.equal(data.ganadores.length, 1);

  assert.equal((await llamar(api, "PUT", "premios", { premios: [{ id: "tv", nombre: "TV", cantidad: 0 }] })).status, 400);
  ({ data } = await llamar(api, "POST", "reiniciar"));
  assert.equal(data.ganadores.length, 0);
  assert.equal(data.premios.length, 1, "reiniciar conserva la lista de premios");

  ({ data } = await llamar(api, "DELETE", "asistentes"));
  assert.equal(data.asistentes.length, 0);
});

test("sin ADMIN_PIN: el PIN se crea desde la app una sola vez", async () => {
  const antes = process.env.ADMIN_PIN;
  delete process.env.ADMIN_PIN;
  try {
    const api = nuevo();
    assert.equal((await llamar(api, "POST", "registro", { nombre: "Ana Pérez", cedula: "1234567" }, "")).status, 201, "inscripción no necesita PIN");
    const sinPin = await llamar(api, "GET", "estado", null, "");
    assert.equal(sinPin.status, 428);
    assert.equal(sinPin.data.crearPin, true);
    assert.equal((await llamar(api, "POST", "pin", { pin: "12" }, "")).status, 400, "PIN muy corto");
    assert.equal((await llamar(api, "POST", "pin", { pin: "4321" }, "")).status, 201);
    assert.equal((await llamar(api, "POST", "pin", { pin: "0000" }, "")).status, 401, "nadie más puede crear otro PIN");
    assert.equal((await llamar(api, "GET", "estado", null, "mal")).status, 401);
    const ok = await llamar(api, "GET", "estado", null, "4321");
    assert.equal(ok.status, 200);
    assert.equal(ok.data.asistentes.length, 1);
  } finally { process.env.ADMIN_PIN = antes; }
});

test("migra inscritos del formato anterior y los lee en una sola lista", async () => {
  const mem = new Map([["asistentes/1111111", JSON.stringify({ nombre: "Legado Uno", cedula: "1111111", hora: "2026-11-01T10:00:00.000Z" })]]);
  const api = nuevo(mem);
  assert.equal((await llamar(api, "POST", "registro", { nombre: "Legado Otro", cedula: "1111111" }, "")).status, 409, "la cédula antigua cuenta como inscrita");
  await llamar(api, "POST", "registro", { nombre: "José Ñúñez / Díaz", cedula: "2222222" }, "");
  const { data } = await llamar(api, "GET", "estado");
  assert.deepEqual(data.asistentes.map((a) => a.nombre), ["Legado Uno", "José Ñúñez / Díaz"]);
  assert.ok(![...mem.keys()].some((k) => k.startsWith("asistentes/")), "el formato anterior se migró");
  await llamar(api, "PUT", "premios", { premios: [{ id: "b", nombre: "Bono", cantidad: 1 }] });
  assert.equal((await llamar(api, "POST", "ganador", { premioId: "b", cedula: "2222222" })).data.ganadores[0].nombre, "José Ñúñez / Díaz");
  assert.equal((await llamar(api, "DELETE", "asistentes/1111111")).data.asistentes.length, 1);
});

test("el QR (código de evento) cambia solo al borrar inscritos", async () => {
  const api = nuevo();
  const e1 = (await llamar(api, "GET", "estado")).data.evento;
  assert.match(e1, /^[0-9a-f]{8}$/);
  assert.equal((await llamar(api, "POST", "registro", { nombre: "Sin Código", cedula: "1010101" }, "")).status, 409, "sin código no inscribe");
  assert.equal((await llamar(api, "POST", "registro", { nombre: "Con Código", cedula: "1010101", evento: e1 }, "")).status, 201);
  assert.equal((await llamar(api, "POST", "reiniciar")).data.evento, e1, "reiniciar sorteo conserva el QR");
  const e2 = (await llamar(api, "DELETE", "asistentes")).data.evento;
  assert.notEqual(e2, e1, "borrar inscritos genera QR nuevo");
  assert.equal((await llamar(api, "POST", "registro", { nombre: "QR Viejo", cedula: "2020202", evento: e1 }, "")).status, 409, "el QR viejo deja de servir");
  assert.equal((await llamar(api, "POST", "registro", { nombre: "QR Nuevo", cedula: "2020202", evento: e2 }, "")).status, 201);
});
