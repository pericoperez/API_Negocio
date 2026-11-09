// Pruebas del asistente con IA. OpenAI se sustituye por un servidor falso local
// (OPENAI_BASE_URL) para que las pruebas sean deterministas, gratuitas y sin clave real.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let respuestaFalsa; // (cuerpoPeticion) => { status, json }
let peticionesOpenAI = [];

const openaiFalso = http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (c) => (cuerpo += c));
  req.on('end', () => {
    const peticion = JSON.parse(cuerpo || '{}');
    peticionesOpenAI.push({ url: req.url, auth: req.headers.authorization, cuerpo: peticion });
    const { status, json } = respuestaFalsa(peticion);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(typeof json === 'string' ? json : JSON.stringify(json));
  });
});

/** Respuesta con el formato de Chat Completions cuyo contenido es `contenido`.
 *  Si es un objeto sin "valida", se completa como solicitud válida. */
const completado = (contenido, extra = {}) => {
  if (contenido && typeof contenido === 'object' && !('valida' in contenido)) {
    contenido = { valida: true, motivoInvalida: '', sugerencias: [], ...contenido };
  }
  return {
  status: 200,
  json: {
    id: 'chatcmpl-prueba',
    object: 'chat.completion',
    created: 0,
    model: 'falso',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: typeof contenido === 'string' ? contenido : JSON.stringify(contenido), refusal: null },
        ...extra,
      },
    ],
  },
  };
};

let server;
let url;

before(async () => {
  await new Promise((r) => openaiFalso.listen(0, r));
  process.env.OPENAI_API_KEY = 'sk-prueba-falsa';
  process.env.OPENAI_BASE_URL = `http://localhost:${openaiFalso.address().port}/v1`;
  process.env.LIMITE_IA_POR_MINUTO = '1000';
  const { default: app } = await import('../src/app.js');
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  url = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  openaiFalso.close();
});

beforeEach(() => {
  peticionesOpenAI = [];
  process.env.OPENAI_API_KEY = 'sk-prueba-falsa';
});

const post = (ruta, body) =>
  fetch(`${url}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const RESTAURANTE = {
  cliente: 'Restaurante La Tortuga (ficticio)',
  descripcion: 'Necesito una web para un restaurante. Quiero mostrar la carta, tener un formulario para solicitar reservas y ofrecer el contenido en dos idiomas.',
};

// ---------------------------------------------------------------------------
// 1. Solicitud clara que encaja con el catálogo
// ---------------------------------------------------------------------------
test('Solicitud clara → 200 con servicios del catálogo y justificaciones', async () => {
  respuestaFalsa = () =>
    completado({
      resumen: 'Web corporativa para un restaurante con carta, reservas y dos idiomas.',
      servicios: [
        { id: 'segundo-idioma', justificacion: 'Pide dos idiomas.', cantidad: null },
        { id: 'corporativa', justificacion: 'Varias secciones.', cantidad: null },
        { id: 'paginas-adicionales', justificacion: 'Carta y reservas.', cantidad: 2 },
        { id: 'formulario', justificacion: 'Reservas.', cantidad: 7 }, // cantidad no aplicable → null
      ],
      dudas: [],
      noIncluidos: [],
    });

  const res = await post('/api/propuesta', RESTAURANTE);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.cliente, RESTAURANTE.cliente);
  assert.deepEqual(json.servicios.map((s) => s.id), ['corporativa', 'paginas-adicionales', 'formulario', 'segundo-idioma']);
  assert.equal(json.servicios.find((s) => s.id === 'paginas-adicionales').cantidad, 2);
  assert.equal(json.servicios.find((s) => s.id === 'formulario').cantidad, null);
  assert.ok(json.servicios.every((s) => s.justificacion.length > 0));
});

test('La petición a OpenAI sale del servidor con la clave, esquema estricto y catálogo SIN precios', async () => {
  respuestaFalsa = () => completado({ resumen: 'x', servicios: [], dudas: [], noIncluidos: [] });
  await post('/api/propuesta', RESTAURANTE);

  assert.equal(peticionesOpenAI.length, 1);
  const { url: ruta, auth, cuerpo } = peticionesOpenAI[0];
  assert.equal(ruta, '/v1/chat/completions');
  assert.equal(auth, 'Bearer sk-prueba-falsa');
  assert.equal(cuerpo.response_format.type, 'json_schema');
  assert.equal(cuerpo.response_format.json_schema.strict, true);
  const textoUsuario = cuerpo.messages.find((m) => m.role === 'user').content;
  assert.match(textoUsuario, /paginas-adicionales/);
  assert.match(textoUsuario, /Necesito una web para un restaurante/);
  assert.doesNotMatch(textoUsuario, /precio|€|\b(300|600|50|80|150)\b/i, 'el modelo no debe recibir precios');
});

// ---------------------------------------------------------------------------
// 2. Solicitud ambigua que necesita aclaraciones
// ---------------------------------------------------------------------------
test('Solicitud ambigua → dudas y cantidad pendiente (null)', async () => {
  respuestaFalsa = () =>
    completado({
      resumen: 'Web sencilla para darse a conocer.',
      servicios: [
        { id: 'landing', justificacion: 'Web sencilla.', cantidad: null },
        { id: 'corporativa', justificacion: 'O quizá corporativa.', cantidad: null }, // dos tipos → se queda el primero
        { id: 'paginas-adicionales', justificacion: 'Puede que más páginas.', cantidad: null },
      ],
      dudas: ['¿Cuántas páginas necesitas?', '   '],
      noIncluidos: [],
    });

  const res = await post('/api/propuesta', { cliente: 'Estudio Nube', descripcion: 'Quiero algo sencillo para que me conozcan.' });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json.servicios.map((s) => s.id), ['landing', 'paginas-adicionales']);
  assert.equal(json.servicios[1].cantidad, null);
  assert.equal(json.dudas[0], '¿Cuántas páginas necesitas?');
  assert.ok(json.dudas.some((d) => d.includes('confirma el tipo de web')));
  assert.equal(json.dudas.length, 2, 'las dudas vacías se descartan');
});

// ---------------------------------------------------------------------------
// 3. Petición de un servicio que no ofrecemos
// ---------------------------------------------------------------------------
test('Servicio no ofrecido → pendiente de valorar; ids inventados se descartan', async () => {
  respuestaFalsa = () =>
    completado({
      resumen: 'Tienda online de zapatos.',
      servicios: [
        { id: 'tienda-online', justificacion: 'Vender zapatos.', cantidad: null }, // no existe
        { id: 'corporativa', justificacion: 'Base.', cantidad: null },
      ],
      dudas: [],
      noIncluidos: [{ necesidad: 'Pago con tarjeta', motivo: 'No está en el catálogo.' }],
    });

  const res = await post('/api/propuesta', { cliente: 'Zapatería', descripcion: 'Quiero una tienda online con pago con tarjeta.' });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json.servicios.map((s) => s.id), ['corporativa']);
  assert.deepEqual(json.descartados, ['tienda-online']);
  assert.equal(json.pendientes[0].necesidad, 'Pago con tarjeta');
  assert.ok(json.pendientes.some((p) => p.necesidad.includes('tienda-online')));
});

// ---------------------------------------------------------------------------
// 4. Descripción vacía (no se llega a llamar a OpenAI)
// ---------------------------------------------------------------------------
const invalidas = [
  ['descripción vacía', { cliente: 'A', descripcion: '' }],
  ['descripción solo con espacios', { cliente: 'A', descripcion: '     ' }],
  ['sin descripción', { cliente: 'A' }],
  ['descripción demasiado larga', { cliente: 'A', descripcion: 'x'.repeat(2001) }],
  ['descripción no es texto', { cliente: 'A', descripcion: 123 }],
  ['cliente vacío', { cliente: ' ', descripcion: 'Una web para mi negocio' }],
  ['cliente demasiado largo', { cliente: 'x'.repeat(121), descripcion: 'Una web para mi negocio' }],
];
for (const [nombre, body] of invalidas) {
  test(`Solicitud inválida (${nombre}) → 400 sin llamar a OpenAI`, async () => {
    respuestaFalsa = () => assert.fail('no debería llamarse a OpenAI');
    const res = await post('/api/propuesta', body);
    assert.equal(res.status, 400);
    assert.ok((await res.json()).detalles.length >= 1);
    assert.equal(peticionesOpenAI.length, 0);
  });
}

// ---------------------------------------------------------------------------
// 5. Fallos en la llamada a OpenAI → mensaje claro y opción de reintentar
// ---------------------------------------------------------------------------
const fallos = [
  ['error 500 de OpenAI', () => ({ status: 500, json: { error: { message: 'boom' } } }), 502],
  ['clave rechazada (401)', () => ({ status: 401, json: { error: { message: 'bad key' } } }), 502],
  ['límite de uso (429)', () => ({ status: 429, json: { error: { message: 'rate' } } }), 503],
  ['contenido que no es JSON', () => completado('esto no es json'), 502],
  ['JSON sin los campos obligatorios', () => completado({ hola: 1 }), 502],
  ['el modelo rechaza la petición', () => completado('', { message: { role: 'assistant', content: null, refusal: 'No puedo.' } }), 502],
  ['respuesta cortada por longitud', () => completado('{"resumen":"a"', { finish_reason: 'length' }), 502],
];
for (const [nombre, falso, esperado] of fallos) {
  test(`Fallo de OpenAI (${nombre}) → ${esperado} con reintentar`, async () => {
    respuestaFalsa = falso;
    const res = await post('/api/propuesta', RESTAURANTE);
    assert.equal(res.status, esperado);
    const json = await res.json();
    assert.equal(json.reintentar, true);
    assert.equal(typeof json.error, 'string');
    assert.doesNotMatch(json.error, /sk-/, 'nunca se filtra la clave');
  });
}

test('Sin OPENAI_API_KEY configurada → 503', async () => {
  delete process.env.OPENAI_API_KEY;
  const res = await post('/api/propuesta', RESTAURANTE);
  assert.equal(res.status, 503);
});

test('Tras un fallo, reintentar funciona', async () => {
  respuestaFalsa = () => ({ status: 500, json: { error: { message: 'boom' } } });
  assert.equal((await post('/api/propuesta', RESTAURANTE)).status, 502);
  respuestaFalsa = () => completado({ resumen: 'ok', servicios: [{ id: 'landing', justificacion: 'x', cantidad: null }], dudas: [], noIncluidos: [] });
  assert.equal((await post('/api/propuesta', RESTAURANTE)).status, 200);
});

// ---------------------------------------------------------------------------
// 6. Modificación de servicios antes del PDF y cálculo en el servidor
// ---------------------------------------------------------------------------
const seleccion = {
  cliente: 'Restaurante La Tortuga (ficticio)',
  resumen: 'Web corporativa para un restaurante.',
  servicios: [{ id: 'corporativa' }, { id: 'paginas-adicionales', cantidad: 2 }, { id: 'formulario' }, { id: 'segundo-idioma' }],
  aclaraciones: ['¿Cuántas páginas tendrá la carta?'],
};

test('Detalle: importes calculados con las tarifas del servidor (600 + 2×50 + 80 + 150 = 930)', async () => {
  const res = await post('/api/presupuesto/detalle', seleccion);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.total, 930);
  assert.deepEqual(json.lineas.map((l) => [l.id, l.cantidad, l.importe]), [
    ['corporativa', 1, 600],
    ['paginas-adicionales', 2, 100],
    ['formulario', 1, 80],
    ['segundo-idioma', 1, 150],
  ]);
  assert.deepEqual(json.aclaraciones, seleccion.aclaraciones);
});

test('Modificación: quitar idioma, cambiar a landing y 5 páginas → 300 + 250 + 80 = 630', async () => {
  const modificada = {
    ...seleccion,
    servicios: [{ id: 'landing' }, { id: 'paginas-adicionales', cantidad: 5 }, { id: 'formulario' }],
  };
  const res = await post('/api/presupuesto/detalle', modificada);
  assert.equal((await res.json()).total, 630);
});

test('Los precios enviados por el cliente se ignoran', async () => {
  const trampa = {
    ...seleccion,
    total: 1,
    servicios: seleccion.servicios.map((s) => ({ ...s, precio: 0, importe: 0 })),
  };
  const res = await post('/api/presupuesto/detalle', trampa);
  assert.equal((await res.json()).total, 930);
});

const seleccionesInvalidas = [
  ['falta la cantidad de páginas', { servicios: [{ id: 'corporativa' }, { id: 'paginas-adicionales' }] }],
  ['cantidad fuera de rango', { servicios: [{ id: 'corporativa' }, { id: 'paginas-adicionales', cantidad: 20 }] }],
  ['cantidad decimal', { servicios: [{ id: 'corporativa' }, { id: 'paginas-adicionales', cantidad: 1.5 }] }],
  ['sin tipo de web', { servicios: [{ id: 'formulario' }] }],
  ['dos tipos de web', { servicios: [{ id: 'landing' }, { id: 'corporativa' }] }],
  ['servicio que no existe', { servicios: [{ id: 'landing' }, { id: 'hosting' }] }],
  ['servicio repetido', { servicios: [{ id: 'landing' }, { id: 'formulario' }, { id: 'formulario' }] }],
  ['sin servicios', { servicios: [] }],
  ['resumen vacío', { resumen: '' }],
  ['aclaraciones no son texto', { aclaraciones: [1, 2] }],
];
for (const [nombre, cambio] of seleccionesInvalidas) {
  test(`Selección inválida (${nombre}) → 400 en detalle y en PDF`, async () => {
    for (const ruta of ['/api/presupuesto/detalle', '/api/presupuesto/pdf']) {
      const res = await post(ruta, { ...seleccion, ...cambio });
      assert.equal(res.status, 400, ruta);
      assert.ok((await res.json()).detalles.length >= 1);
    }
  });
}

test('PDF: devuelve un PDF válido con el total calculado por el servidor', async () => {
  const res = await post('/api/presupuesto/pdf', { ...seleccion, total: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(res.headers.get('x-total-presupuesto'), '930');
  assert.match(res.headers.get('content-disposition'), /presupuesto-restaurante-la-tortuga-ficticio-\d{4}-\d{2}-\d{2}\.pdf/);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
});

test('PDF tras modificar la selección refleja el nuevo total', async () => {
  const res = await post('/api/presupuesto/pdf', { ...seleccion, servicios: [{ id: 'landing' }] });
  assert.equal(res.headers.get('x-total-presupuesto'), '300');
});

test('GET /api/catalogo devuelve los 5 servicios con id, nombre, descripción y precio', async () => {
  const json = await (await fetch(`${url}/api/catalogo`)).json();
  assert.deepEqual(json.servicios.map((s) => s.id), ['landing', 'corporativa', 'paginas-adicionales', 'formulario', 'segundo-idioma']);
  for (const s of json.servicios) {
    assert.ok(s.nombre && s.descripcion && Number.isFinite(s.precio) && s.regla);
  }
});

// ---------------------------------------------------------------------------
// 7. Mensaje no válido → 422 con motivo y mensajes sugeridos (no hay propuesta)
// ---------------------------------------------------------------------------
test('Mensaje no válido según la IA → 422 con motivo y sugerencias, sin propuesta', async () => {
  respuestaFalsa = () =>
    completado({
      valida: false,
      motivoInvalida: 'Tu mensaje no describe una página web.',
      sugerencias: ['Tengo un bar y quiero una web con la carta.', '  ', 'Quiero una landing para mi academia.'],
      resumen: '',
      servicios: [],
      dudas: [],
      noIncluidos: [],
    });
  const res = await post('/api/propuesta', { cliente: 'Prueba', descripcion: 'Dame una receta de tortilla' });
  assert.equal(res.status, 422);
  const json = await res.json();
  assert.equal(json.invalida, true);
  assert.equal(json.error, 'Mensaje no válido');
  assert.equal(json.motivo, 'Tu mensaje no describe una página web.');
  assert.deepEqual(json.sugerencias, ['Tengo un bar y quiero una web con la carta.', 'Quiero una landing para mi academia.']);
  assert.equal(json.servicios, undefined);
});

test('Mensaje no válido sin sugerencias del modelo → sugerencias por defecto', async () => {
  respuestaFalsa = () =>
    completado({ valida: false, motivoInvalida: '', sugerencias: [], resumen: '', servicios: [], dudas: [], noIncluidos: [] });
  const res = await post('/api/propuesta', { cliente: 'Prueba', descripcion: 'asdf asdf asdf' });
  assert.equal(res.status, 422);
  const json = await res.json();
  assert.ok(json.motivo.length > 0);
  assert.equal(json.sugerencias.length, 3);
});

test('La IA la da por válida pero no hay ningún servicio del catálogo → 422', async () => {
  respuestaFalsa = () =>
    completado({ resumen: 'App móvil.', servicios: [], dudas: [], noIncluidos: [{ necesidad: 'App móvil', motivo: 'No se ofrece.' }] });
  const res = await post('/api/propuesta', { cliente: 'Prueba', descripcion: 'Solo quiero una app móvil para iOS' });
  assert.equal(res.status, 422);
  const json = await res.json();
  assert.match(json.motivo, /App móvil/);
  assert.equal(json.sugerencias.length, 3);
});

test('Todos los servicios propuestos son inventados → 422', async () => {
  respuestaFalsa = () =>
    completado({ resumen: 'x', servicios: [{ id: 'hosting', justificacion: 'x', cantidad: null }], dudas: [], noIncluidos: [] });
  const res = await post('/api/propuesta', { cliente: 'Prueba', descripcion: 'Necesito alojamiento web' });
  assert.equal(res.status, 422);
});

test('El esquema enviado a OpenAI incluye valida, motivoInvalida y sugerencias', async () => {
  respuestaFalsa = () => completado({ resumen: 'x', servicios: [{ id: 'landing', justificacion: 'x', cantidad: null }], dudas: [], noIncluidos: [] });
  await post('/api/propuesta', RESTAURANTE);
  const req = peticionesOpenAI[0].cuerpo.response_format.json_schema.schema.required;
  for (const campo of ['valida', 'motivoInvalida', 'sugerencias']) assert.ok(req.includes(campo), campo);
});
