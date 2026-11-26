// node --test lib/logica.test.mjs   (prueba la lógica del servidor con un almacén en memoria)
import test from "node:test";
import assert from "node:assert/strict";
import { crearHandler } from "./logica.mjs";

process.env.ADMIN_PIN = "9999";
const nuevo = () => {
  const mem = new Map();
  return crearHandler(() => ({
    get: async (k) => (mem.has(k) ? JSON.parse(mem.get(k)) : null),
    setJSON: async (k, v) => { mem.set(k, JSON.stringify(v)); },
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
