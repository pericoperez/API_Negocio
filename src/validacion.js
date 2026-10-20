import { TIPOS_VALIDOS, PAGINAS_MIN, PAGINAS_MAX } from './tarifas.js';

const CAMPOS_OBLIGATORIOS = ['tipo', 'paginas', 'formulario', 'segundoIdioma'];

/**
 * Valida el cuerpo de una solicitud de presupuesto.
 * Devuelve { ok: true, datos } con SOLO los cuatro campos permitidos
 * (las propiedades adicionales se descartan), o { ok: false, errores }.
 */
export function validarSolicitud(body) {
  // El cuerpo debe ser un objeto JSON (no null, no array, no primitivo)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errores: ['El cuerpo de la solicitud debe ser un objeto JSON.'] };
  }

  const errores = [];

  for (const campo of CAMPOS_OBLIGATORIOS) {
    if (!Object.hasOwn(body, campo)) {
      errores.push(`Falta el campo obligatorio "${campo}".`);
    }
  }
  if (errores.length > 0) return { ok: false, errores };

  const { tipo, paginas, formulario, segundoIdioma } = body;

  if (!TIPOS_VALIDOS.includes(tipo)) {
    errores.push(`"tipo" debe ser "landing" o "corporativa" (recibido: ${JSON.stringify(tipo)}).`);
  }

  // Number.isInteger rechaza "4" (string), 2.5, NaN e Infinity
  if (!Number.isInteger(paginas) || paginas < PAGINAS_MIN || paginas > PAGINAS_MAX) {
    errores.push(
      `"paginas" debe ser un número entero entre ${PAGINAS_MIN} y ${PAGINAS_MAX} (recibido: ${JSON.stringify(paginas)}).`
    );
  }

  // typeof estricto: la cadena "false" no es un booleano
  if (typeof formulario !== 'boolean') {
    errores.push(`"formulario" debe ser un booleano true o false (recibido: ${JSON.stringify(formulario)}).`);
  }
  if (typeof segundoIdioma !== 'boolean') {
    errores.push(`"segundoIdioma" debe ser un booleano true o false (recibido: ${JSON.stringify(segundoIdioma)}).`);
  }

  if (errores.length > 0) return { ok: false, errores };

  return { ok: true, datos: { tipo, paginas, formulario, segundoIdioma } };
}
