import { TARIFAS, PAGINAS_MAX } from './tarifas.js';

/**
 * Catálogo de servicios. Es el mismo del ejercicio anterior (src/tarifas.js),
 * expresado como lista de servicios con identificador, nombre, descripción
 * y regla de precio. Los precios SIEMPRE salen de TARIFAS.
 *
 * - grupo "base": tipo de web. El presupuesto necesita exactamente uno.
 * - unidad "pagina": el precio se multiplica por una cantidad que hay que indicar.
 */
export const CATALOGO = Object.freeze([
  {
    id: 'landing',
    nombre: 'Web tipo landing',
    descripcion:
      'Página única orientada a captar clientes o presentar un producto: diseño adaptable a móvil, secciones de contenido y enlaces de contacto. Incluye la primera página.',
    grupo: 'base',
    precio: TARIFAS.landing,
    unidad: null,
  },
  {
    id: 'corporativa',
    nombre: 'Web corporativa',
    descripcion:
      'Web completa de empresa o negocio con menú de navegación y varias secciones (inicio, quiénes somos, servicios, contacto…). Incluye la primera página.',
    grupo: 'base',
    precio: TARIFAS.corporativa,
    unidad: null,
  },
  {
    id: 'paginas-adicionales',
    nombre: 'Páginas adicionales',
    descripcion:
      'Cada página extra a partir de la segunda (por ejemplo: carta, galería, equipo, blog estático). Se cobra por página.',
    grupo: 'extra',
    precio: TARIFAS.paginaAdicional,
    unidad: 'pagina',
    cantidadMin: 1,
    cantidadMax: PAGINAS_MAX - 1,
  },
  {
    id: 'formulario',
    nombre: 'Formulario',
    descripcion:
      'Un formulario web que envía los datos por correo electrónico (contacto, solicitud de reserva, presupuesto…). No incluye sistemas de pago ni gestión de disponibilidad en tiempo real.',
    grupo: 'extra',
    precio: TARIFAS.formulario,
    unidad: null,
  },
  {
    id: 'segundo-idioma',
    nombre: 'Segundo idioma',
    descripcion:
      'Versión completa de la web en un segundo idioma con selector de idioma. El cliente aporta los textos traducidos.',
    grupo: 'extra',
    precio: TARIFAS.segundoIdioma,
    unidad: null,
  },
]);

export const IDS_CATALOGO = Object.freeze(CATALOGO.map((s) => s.id));

export function buscarServicio(id) {
  return CATALOGO.find((s) => s.id === id) ?? null;
}

/** Texto legible de la regla de precio (para la interfaz y el PDF). */
export function reglaPrecio(servicio) {
  return servicio.unidad === 'pagina' ? `${servicio.precio} € por página` : `${servicio.precio} € (precio fijo)`;
}

/**
 * Catálogo que se envía a la IA: SIN precios, para que el modelo no pueda
 * citarlos ni inventarlos. Solo necesita saber qué incluye cada servicio.
 */
export function catalogoParaIA() {
  return CATALOGO.map(({ id, nombre, descripcion, grupo, unidad }) => ({
    id,
    nombre,
    descripcion,
    tipo: grupo === 'base' ? 'tipo de web (elegir solo uno)' : 'extra',
    requiereCantidad: unidad === 'pagina' ? 'sí: número de páginas adicionales' : 'no',
  }));
}
