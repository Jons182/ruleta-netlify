# Ruleta · Soluciones Hospitalarias de la Costa

| Página | Para qué | Quién la abre |
|---|---|---|
| `/` (inicio) | QR de inscripción + contador de inscritos | Se proyecta |
| `/inscripcion.html` | Formulario de nombre y cédula | Los asistentes, al escanear el QR |
| `/config.html` | Premios, quién participa, asistencia, Excel, reinicios | Administrador |
| `/ruleta.html` | La ruleta | Se proyecta |

Inicio, configuración y ruleta piden el **PIN de administrador** una vez por pestaña.
La inscripción es la única página pública.

## Publicar en Netlify

Usa la herramienta de línea de comandos o un repositorio Git. **Arrastrar la carpeta a Netlify Drop no sirve**,
porque no publica las funciones del servidor.

### Opción A: desde este computador

```bash
npm install
npx netlify-cli login
npx netlify-cli sites:create
npx netlify-cli env:set ADMIN_PIN "tu-pin-secreto"
npx netlify-cli deploy --prod
```

### Opción B: con GitHub

1. Sube esta carpeta a un repositorio.
2. En Netlify: *Add new site → Import an existing project* y elige el repositorio (no necesita comando de build).
3. En *Site configuration → Environment variables*, crea `ADMIN_PIN` con tu PIN y vuelve a desplegar.

Los datos se guardan en **Netlify Blobs**, incluido en Netlify sin configurar nada más.

## Probar en local

```bash
node dev.mjs
```

Abre http://localhost:8888 (PIN `1234`). Los datos de prueba viven en memoria y se borran al cerrar.
Pruebas de la lógica del servidor: `npm test`.

## Cambiar la ruleta

`public/ruleta.html` se genera a partir de `fuente/ruleta.src.html`. Edita la fuente y ejecuta `npm run build-ruleta`.
Los textos y colores están en `CONFIG`, al inicio del script.

## Durante el evento

- **Reiniciar sorteo** borra los ganadores: todos vuelven a participar y los premios quedan sin entregar.
- **Borrar inscritos y ganadores** deja el evento en blanco y conserva la lista de premios.
- Exporta a Excel antes de cualquiera de los dos.
