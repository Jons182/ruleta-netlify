import { getStore } from "@netlify/blobs";
import { crearHandler } from "../../lib/logica.mjs";

// consistencia fuerte: lo que se acaba de guardar se ve de inmediato en la siguiente lectura
export default crearHandler(() => getStore({ name: "ruleta", consistency: "strong" }));

export const config = { path: "/api/*" };
