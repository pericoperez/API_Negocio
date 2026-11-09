import { CATALOGO, buscarServicio, reglaPrecio } from './catalogo.js';
import { MONEDA } from './tarifas.js';
import { CLIENTE_MAX } from './ia.js';

export const RESUMEN_MAX = 1000;
export const ACLARACIONES_MAX = 15;
export const ACLARACION_LARGO_MAX = 300;

/**
 * Valida la selección CONFIRMADA por el usuario.
 * Cuerpo esperado:
 *   { cliente, resumen, servicios: [{ id, cantidad? }], aclaraciones?: [string] }
 * Cualquier precio o total enviado por el cliente se ignora.
 */
export function validarSeleccion(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errores: ['El cuerpo de la solicitud debe ser un objeto JSON.'] };
  }
  const errores = [];

  const cliente = typeof body.cliente === 'string' ? body.cliente.trim() : '';
  if (!cliente) errores.push('Falta el nombre del cliente o empresa.');
  else if (cliente.length > CLIENTE_MAX) errores.push(`El nombre del cliente no puede superar ${CLIENTE_MAX} caracteres.`);

  const resumen = typeof body.resumen === 'string' ? body.resumen.trim() : '';
  if (!resumen) errores.push('Falta el resumen del proyecto.');
  else if (resumen.length > RESUMEN_MAX) errores.push(`El resumen no puede superar ${RESUMEN_MAX} caracteres.`);

  let aclaraciones = [];
  if (body.aclaraciones !== undefined) {
    if (!Array.isArray(body.aclaraciones) || body.aclaraciones.some((a) => typeof a !== 'string')) {
      errores.push('"aclaraciones" debe ser una lista de textos.');
    } else {
      aclaraciones = body.aclaraciones.map((a) => a.trim()).filter(Boolean);
      if (aclaraciones.length > ACLARACIONES_MAX) errores.push(`Como máximo ${ACLARACIONES_MAX} aclaraciones.`);
      if (aclaraciones.some((a) => a.length > ACLARACION_LARGO_MAX))
        errores.push(`Cada aclaración puede tener como máximo ${ACLARACION_LARGO_MAX} caracteres.`);
    }
  }

  const servicios = [];
  if (!Array.isArray(body.servicios) || body.servicios.length === 0) {
    errores.push('Selecciona al menos un servicio.');
  } else {
    const vistos = new Set();
    for (const item of body.servicios) {
      const id = item?.id;
      const servicio = typeof id === 'string' ? buscarServicio(id) : null;
      if (!servicio) {
        errores.push(`El servicio ${JSON.stringify(id)} no existe en el catálogo.`);
        continue;
      }
      if (vistos.has(id)) {
        errores.push(`El servicio "${servicio.nombre}" está repetido.`);
        continue;
      }
      vistos.add(id);

      let cantidad = 1;
      if (servicio.unidad) {
        const c = item.cantidad;
        if (!Number.isInteger(c) || c < servicio.cantidadMin || c > servicio.cantidadMax) {
          errores.push(
            `Indica cuántas ${servicio.nombre.toLowerCase()} necesitas (número entero entre ${servicio.cantidadMin} y ${servicio.cantidadMax}).`
          );
          continue;
        }
        cantidad = c;
      }
      servicios.push({ id, cantidad });
    }

    const tipos = servicios.filter((s) => buscarServicio(s.id).grupo === 'base');
    if (tipos.length === 0) errores.push('Elige un tipo de web (landing o corporativa).');
    if (tipos.length > 1) errores.push('Elige solo un tipo de web (landing o corporativa).');
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: { cliente, resumen, servicios, aclaraciones } };
}

/**
 * Calcula el presupuesto con las tarifas del servidor. Independiente de Express.
 */
export function calcularPresupuestoFinal({ cliente, resumen, servicios, aclaraciones }, fecha = new Date()) {
  // Se recorren en el orden del catálogo para un documento estable
  const lineas = CATALOGO.filter((s) => servicios.some((x) => x.id === s.id)).map((s) => {
    const { cantidad } = servicios.find((x) => x.id === s.id);
    return {
      id: s.id,
      nombre: s.nombre,
      descripcion: s.descripcion,
      regla: reglaPrecio(s),
      cantidad,
      precioUnitario: s.precio,
      importe: s.precio * cantidad,
    };
  });

  return {
    cliente,
    fecha: fecha.toISOString().slice(0, 10),
    resumen,
    lineas,
    total: lineas.reduce((suma, l) => suma + l.importe, 0),
    moneda: MONEDA,
    aclaraciones,
  };
}
