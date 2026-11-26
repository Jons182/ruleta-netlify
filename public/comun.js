// Compartido por inicio, inscripción y configuración. Se carga en <head> (sin defer) para fijar el tema antes de pintar.
(function () {
  let tema = null;
  try { tema = localStorage.getItem("ruleta-tema"); } catch (e) {}
  document.documentElement.dataset.theme = tema || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
})();

const PIN_KEY = "ruleta-pin";

function obtenerPin(forzar) {
  let pin = null;
  try { pin = sessionStorage.getItem(PIN_KEY); } catch (e) {}
  if (!pin || forzar) {
    pin = prompt(forzar ? "PIN incorrecto. Escribe el PIN de administrador:" : "PIN de administrador:");
    if (!pin) throw new Error("Se necesita el PIN de administrador");
    try { sessionStorage.setItem(PIN_KEY, pin); } catch (e) {}
  }
  return pin;
}

// Llamada al servidor. admin=true envía el PIN; si es incorrecto lo vuelve a pedir una vez.
async function api(ruta, { method = "GET", body, admin = true } = {}, reintento = false) {
  const headers = { "content-type": "application/json" };
  if (admin) headers["x-admin-pin"] = obtenerPin(reintento);
  const r = await fetch("/api/" + ruta, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
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
