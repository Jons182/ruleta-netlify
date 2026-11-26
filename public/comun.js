// Compartido por todas las páginas. Se carga en <head> (sin defer) para fijar el tema antes de pintar.
(function () {
  let tema = null;
  try { tema = localStorage.getItem("ruleta-tema"); } catch (e) {}
  document.documentElement.dataset.theme = tema || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
})();

const PIN_KEY = "ruleta-pin";

// Modal propio sobre <dialog>: Escape cierra, el foco queda dentro y se pinta encima de todo (top layer).
// Los estilos se inyectan aquí porque la ruleta no carga marca.css.
function estilosDialogo() {
  if (document.getElementById("dlg-estilos")) return;
  const s = document.createElement("style");
  s.id = "dlg-estilos";
  s.textContent = `
    .dlg{margin:auto;border:none;padding:0;border-radius:20px;width:min(92vw,420px);background:var(--surface,#fff);color:var(--text,#0b0146);
      box-shadow:0 24px 60px rgba(11,1,70,.35);font-family:'Barlow',system-ui,sans-serif}
    .dlg::backdrop{background:rgba(11,1,70,.55)}
    .dlg[open]{animation:dlg-entra .22s cubic-bezier(.2,1.3,.4,1)}
    @keyframes dlg-entra{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}
    .dlg form{display:flex;flex-direction:column;gap:14px;padding:24px;border-top:6px solid var(--green,#56b167)}
    .dlg h2{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:26px;line-height:1.1;margin:0}
    .dlg p{margin:0;line-height:1.45;white-space:pre-line;color:var(--muted,#5d5a7a)}
    .dlg label{display:flex;flex-direction:column;gap:6px;font-weight:600}
    .dlg input{font:inherit;font-size:18px;padding:12px 14px;border-radius:12px;border:1px solid var(--line,rgba(11,1,70,.15));
      background:var(--surface2,#f1f6ef);color:inherit;outline:none}
    .dlg input:focus{border-color:var(--green,#56b167)}
    .dlg .dlg-error{color:var(--red,#c62f3a);font-weight:600}
    .dlg .dlg-acciones{display:flex;gap:10px;justify-content:flex-end;margin-top:4px}
    .dlg button{font:inherit;font-weight:600;font-size:16px;min-height:44px;padding:10px 20px;border-radius:12px;cursor:pointer;
      border:1px solid var(--line,rgba(11,1,70,.15));background:var(--surface2,#f1f6ef);color:inherit}
    .dlg button.ok{background:#2e6e3b;border-color:transparent;color:#fff}
    .dlg button.ok.peligro{background:#b3262f}
    .dlg button:hover{filter:brightness(1.06)}
    .dlg button:focus-visible,.dlg input:focus-visible{outline:3px solid var(--lime,#a3c91d);outline-offset:2px}
    :root[data-theme="dark"] .dlg{--red:#ff6b75}
    @media (prefers-reduced-motion:reduce){.dlg[open]{animation:none}}`;
  document.head.append(s);
}

// Devuelve los valores de los campos, true si no hay campos, o null si se cancela.
// validar(valores) devuelve un mensaje de error o "" para aceptar.
function dialogo({ titulo, mensaje = "", campos = [], aceptar = "Aceptar", cancelar = "Cancelar", peligro = false, validar }) {
  estilosDialogo();
  return new Promise((resolver) => {
    const d = document.createElement("dialog"), f = document.createElement("form");
    d.className = "dlg";
    d.setAttribute("aria-labelledby", "dlg-titulo");
    const h = document.createElement("h2");
    h.id = "dlg-titulo"; h.textContent = titulo; f.append(h);
    if (mensaje) { const p = document.createElement("p"); p.textContent = mensaje; f.append(p); }
    const inputs = campos.map((c) => {
      const l = document.createElement("label"), i = document.createElement("input");
      l.textContent = c.etiqueta; i.type = c.tipo || "text"; i.autocomplete = c.autocompletar || "off"; i.setAttribute("aria-label", c.etiqueta);
      l.append(i); f.append(l); return i;
    });
    const error = document.createElement("p");
    error.className = "dlg-error"; error.setAttribute("role", "alert"); error.hidden = true; f.append(error);
    const fila = document.createElement("div"), ok = document.createElement("button");
    fila.className = "dlg-acciones";
    let hecho = false;
    const cerrar = (valor) => { if (hecho) return; hecho = true; d.close(); d.remove(); resolver(valor); };
    if (cancelar) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = cancelar; b.addEventListener("click", () => cerrar(null)); fila.append(b);
    }
    ok.type = "submit"; ok.className = "ok" + (peligro ? " peligro" : ""); ok.textContent = aceptar;
    fila.append(ok); f.append(fila);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const valores = inputs.map((i) => i.value);
      const msg = validar ? validar(valores) : "";
      if (msg) { error.textContent = msg; error.hidden = false; (inputs[0] || ok).focus(); return; }
      cerrar(campos.length ? valores : true);
    });
    d.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(cancelar ? null : true); });
    d.append(f); document.body.append(d); d.showModal();
    (inputs[0] || ok).focus();
  });
}
const confirmar = (mensaje, opciones = {}) =>
  dialogo({ titulo: opciones.titulo || "¿Continuar?", mensaje, aceptar: opciones.aceptar || "Aceptar", peligro: opciones.peligro }).then((v) => v === true);
const avisar = (mensaje, titulo = "Aviso") => dialogo({ titulo, mensaje, cancelar: null });

// Si varias llamadas al servidor piden el PIN a la vez, comparten un solo modal.
let pidiendoPin = null, creandoPin = null;

// Sin forzar devuelve el PIN guardado (o ""), sin preguntar: el servidor dice si hace falta crearlo o escribirlo.
async function obtenerPin(forzar) {
  let pin = null;
  try { pin = sessionStorage.getItem(PIN_KEY); } catch (e) {}
  if (!forzar) return pin || "";
  pidiendoPin ||= dialogo({
    titulo: pin ? "PIN incorrecto" : "PIN de administrador",
    mensaje: pin ? "Vuelve a escribir el PIN de administrador." : "Escribe el PIN para continuar.",
    campos: [{ etiqueta: "PIN", tipo: "password", autocompletar: "current-password" }],
    aceptar: "Entrar",
    validar: ([v]) => (v ? "" : "Escribe el PIN."),
  }).finally(() => { pidiendoPin = null; });
  const r = await pidiendoPin;
  if (!r) throw new Error("Se necesita el PIN de administrador");
  try { sessionStorage.setItem(PIN_KEY, r[0]); } catch (e) {}
  return r[0];
}

// Primera vez: el PIN se crea aquí y queda guardado en el servidor para todos los equipos.
function crearPin() {
  creandoPin ||= (async () => {
    const r = await dialogo({
      titulo: "Crea el PIN de administrador",
      mensaje: "Lo pedirán el inicio, la configuración y la ruleta. Mínimo 4 caracteres.",
      campos: [{ etiqueta: "PIN nuevo", tipo: "password", autocompletar: "new-password" },
               { etiqueta: "Repite el PIN", tipo: "password", autocompletar: "new-password" }],
      aceptar: "Crear PIN",
      validar: ([a, b]) => (a.length < 4 ? "El PIN debe tener al menos 4 caracteres." : a !== b ? "Los PIN no coinciden." : ""),
    });
    if (!r) throw new Error("Se necesita crear el PIN de administrador");
    const res = await fetch("/api/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: r[0] }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "No se pudo crear el PIN");
    try { sessionStorage.setItem(PIN_KEY, r[0]); } catch (e) {}
  })().finally(() => { creandoPin = null; });
  return creandoPin;
}

// Llamada al servidor. admin=true envía el PIN; si es incorrecto lo vuelve a pedir una vez.
async function api(ruta, { method = "GET", body, admin = true } = {}, reintento = false) {
  const headers = { "content-type": "application/json" };
  if (admin) headers["x-admin-pin"] = await obtenerPin(reintento);
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
