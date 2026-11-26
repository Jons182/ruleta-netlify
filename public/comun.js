// Compartido por inicio, inscripción y configuración. Se carga en <head> (sin defer) para fijar el tema antes de pintar.
(function () {
  let tema = null;
  try { tema = localStorage.getItem("ruleta-tema"); } catch (e) {}
  document.documentElement.dataset.theme = tema || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
})();

const PIN_KEY = "ruleta-pin";

// Sin forzar devuelve el PIN guardado (o ""), sin preguntar: el servidor dice si hace falta crearlo o escribirlo.
function obtenerPin(forzar) {
  let pin = null;
  try { pin = sessionStorage.getItem(PIN_KEY); } catch (e) {}
  if (!forzar) return pin || "";
  pin = prompt(pin ? "PIN incorrecto. Escribe el PIN de administrador:" : "PIN de administrador:");
  if (!pin) throw new Error("Se necesita el PIN de administrador");
  try { sessionStorage.setItem(PIN_KEY, pin); } catch (e) {}
  return pin;
}

// Primera vez: todavía no hay PIN en el servidor; se crea aquí y queda guardado para todos los equipos.
async function crearPin() {
  const pin = prompt("Primera vez: crea el PIN de administrador (mínimo 4 caracteres).\nLo pedirán el inicio, la configuración y la ruleta.");
  if (!pin) throw new Error("Se necesita crear el PIN de administrador");
  if (prompt("Escribe el PIN otra vez para confirmar:") !== pin) throw new Error("Los PIN no coinciden. Recarga e inténtalo de nuevo.");
  const r = await fetch("/api/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "No se pudo crear el PIN");
  try { sessionStorage.setItem(PIN_KEY, pin); } catch (e) {}
}

// Llamada al servidor. admin=true envía el PIN; si es incorrecto lo vuelve a pedir una vez.
async function api(ruta, { method = "GET", body, admin = true } = {}, reintento = false) {
  const headers = { "content-type": "application/json" };
  if (admin) headers["x-admin-pin"] = obtenerPin(reintento);
  const r = await fetch("/api/" + ruta, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (r.status === 428 && data.crearPin) { await crearPin(); return api(ruta, { method, body, admin }); }
  if (r.status === 401 && admin && !reintento) return api(ruta, { method, body, admin }, true);
  if (!r.ok) { const e = new Error(data.error || "Error " + r.status); e.status = r.status; throw e; }
  return data;
}

const fmtHora = (iso) => new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function alternarTema() {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("ruleta-tema", t); } catch (e) {}
}
