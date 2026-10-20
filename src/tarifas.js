// Tarifas oficiales del servidor. Son la única fuente de precios:
// nada de lo que envíe el cliente puede modificarlas.
export const MONEDA = 'EUR';

export const TARIFAS = Object.freeze({
  landing: 300, // incluye la primera página
  corporativa: 600, // incluye la primera página
  paginaAdicional: 50, // cada página a partir de la segunda
  formulario: 80,
  segundoIdioma: 150,
});

export const TIPOS_VALIDOS = Object.freeze(['landing', 'corporativa']);

export const PAGINAS_MIN = 1;
export const PAGINAS_MAX = 20;
