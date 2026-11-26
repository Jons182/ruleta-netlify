// Efectos de sonido sintetizados con Web Audio (sin archivos). Compartido por el inicio y la ruleta.
// El navegador solo permite sonar después de un clic o toque en la página (o en el mismo sitio, en Chrome).
const Sonidos = (() => {
  let ctx = null, salida = null, ruidoBuf = null, aplausoBuf = null;
  let silencio = false;
  try { silencio = localStorage.getItem("ruleta-sonido") === "off"; } catch (e) {}

  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        salida = ctx.createDynamicsCompressor();   // evita saturar cuando suenan varias cosas a la vez
        salida.connect(ctx.destination);
      } catch (e) { return null; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  // siActivo: solo suena si el audio ya está permitido (si no, se omite en vez de sonar tarde al primer clic)
  function tocar(fn, siActivo) {
    if (silencio) return;
    const c = ensure(); if (!c) return;
    if (c.state === "running") fn(c, c.currentTime);
    else if (!siActivo) c.resume().then(() => fn(c, c.currentTime)).catch(() => {});
  }

  function tono(c, t, freq, dur, { type = "sine", vol = 0.1, hasta = null, ataque = 0.005 } = {}) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(salida); o.start(t); o.stop(t + dur + 0.02);
  }

  function ruido(c) {
    if (!ruidoBuf) {
      ruidoBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = ruidoBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(); s.buffer = ruidoBuf; s.loop = true;
    return s;
  }

  // ráfaga de ruido filtrado: soplido, barrido o golpe de aire
  function soplo(c, t, dur, { desde = 400, hasta = 4000, vol = 0.25, q = 1.2, tipo = "bandpass", pico = 0.4 } = {}) {
    const s = ruido(c), f = c.createBiquadFilter(), g = c.createGain();
    f.type = tipo; f.Q.value = q;
    f.frequency.setValueAtTime(desde, t); f.frequency.exponentialRampToValueAtTime(hasta, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * pico);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(salida);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // aplausos pregrabados en un solo buffer: tocarlos es 1 nodo, no 140 palmadas sueltas
  function aplauso(c) {
    if (aplausoBuf) return aplausoBuf;
    const sr = c.sampleRate, buf = c.createBuffer(1, Math.floor(sr * 3.4), sr), d = buf.getChannelData(0);
    for (let i = 0; i < 140; i++) {
      const at = 0.05 + Math.pow(Math.random(), 1.6) * 3.2, n = Math.floor((0.05 + Math.random() * 0.04) * sr);
      const ini = Math.floor(at * sr), amp = 0.9 * (1 - at / 3.6);
      for (let j = 0; j < n && ini + j < d.length; j++) d[ini + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (n * 0.25));
    }
    return (aplausoBuf = buf);
  }

  const boom = (c, t, vol = 0.6) => {
    tono(c, t, 120, 0.7, { vol, hasta: 38 });
    soplo(c, t, 0.35, { desde: 900, hasta: 120, vol: vol * 0.5, tipo: "lowpass", q: 0.7, pico: 0.05 });
  };

  return {
    ensure,
    get silencio() { return silencio; },
    setSilencio(v) { silencio = !!v; try { localStorage.setItem("ruleta-sonido", v ? "off" : "on"); } catch (e) {} },

    // clic de la flecha al pasar cada nombre: madera corta
    tick: () => tocar((c, t) => {
      tono(c, t, 1700 + Math.random() * 300, 0.035, { type: "triangle", vol: 0.09, ataque: 0.002 });
      soplo(c, t, 0.025, { desde: 3000, hasta: 2500, vol: 0.08, q: 2, pico: 0.1 });
    }),

    // despegue al lanzar la ruleta
    girar: () => tocar((c, t) => {
      setTimeout(() => aplauso(c), 1500);
      soplo(c, t, 0.9, { desde: 250, hasta: 3500, vol: 0.28, pico: 0.3 });
      tono(c, t, 180, 0.7, { type: "sawtooth", vol: 0.035, hasta: 720 });
    }),

    ganador: () => tocar((c, t) => {
      boom(c, t, 0.5);
      [523, 659, 784, 1047].forEach((f, i) => tono(c, t + 0.08 + i * 0.11, f, 0.3, { type: "triangle", vol: 0.13 }));
      [523, 659, 784, 1047, 1319].forEach((f) => tono(c, t + 0.56, f, 1.6, { type: "triangle", vol: 0.07, ataque: 0.02 }));
    }),

    // cuando aterrizan las letras del nombre
    impacto: () => tocar((c, t) => {
      boom(c, t, 0.7);
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = aplauso(c); f.type = "bandpass"; f.frequency.value = 2000; f.Q.value = 0.7; g.gain.value = 0.35;
      s.connect(f); f.connect(g); g.connect(salida); s.start(t);
    }),

    // botón EMPEZAR: dura menos que la cortina, que corta el audio al navegar
    empezar: () => tocar((c, t) => {
      soplo(c, t, 0.75, { desde: 200, hasta: 6000, vol: 0.3, pico: 0.7 });
      [392, 523, 659, 784, 1047].forEach((f, i) => tono(c, t + i * 0.07, f, 0.35, { type: "triangle", vol: 0.1 }));
    }),

    // la ruleta entra girando
    llegada: () => tocar((c, t) => {
      soplo(c, t, 0.9, { desde: 5000, hasta: 250, vol: 0.25, pico: 0.2 });
      boom(c, t + 0.75, 0.45);
      tono(c, t + 0.8, 784, 0.5, { type: "triangle", vol: 0.08 });
      tono(c, t + 0.9, 1047, 0.7, { type: "triangle", vol: 0.08 });
    }, true),

    // nuevo inscrito en el inicio
    ding: () => tocar((c, t) => {
      tono(c, t, 1319, 0.6, { vol: 0.12 });
      tono(c, t + 0.09, 1760, 0.8, { vol: 0.1 });
    }, true),

    // botones (Continuar, cambiar de premio)
    pop: () => tocar((c, t) => tono(c, t, 520, 0.09, { vol: 0.1, hasta: 900 })),
  };
})();
