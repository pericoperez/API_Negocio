import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TARIFAS, MONEDA } from './tarifas.js';
import { validarSolicitud } from './validacion.js';
import { calcularPresupuesto } from './calculo.js';
import { CATALOGO, reglaPrecio } from './catalogo.js';
import { validarSolicitudIA, pedirPropuestaIA, ErrorIA, CLIENTE_MAX, DESCRIPCION_MAX, DESCRIPCION_MIN } from './ia.js';
import { validarSeleccion, calcularPresupuestoFinal } from './presupuestoFinal.js';
import { generarPDF } from './pdf.js';
import { limitarPorIP } from './limite.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // Vercel pone la IP real en X-Forwarded-For

// Solo se interpretan cuerpos con Content-Type: application/json (máx. 20 kB)
app.use(express.json({ limit: '20kb' }));

const exigirJSON = (req, res, next) => {
  if (!req.is('application/json')) {
    return res.status(400).json({
      error: 'Solicitud incorrecta',
      detalles: ['La petición debe usar la cabecera Content-Type: application/json.'],
    });
  }
  next();
};

// GET /api/estado — comprobación de que el servicio funciona
app.get('/api/estado', (req, res) => {
  res.json({ status: 'ok', ia: Boolean(process.env.OPENAI_API_KEY) });
});

// GET /api/tarifas — tarifas que usa el servidor
app.get('/api/tarifas', (req, res) => {
  res.json({ moneda: MONEDA, tarifas: TARIFAS });
});

// POST /api/presupuesto — calculadora del ejercicio anterior (sin cambios)
app.post('/api/presupuesto', exigirJSON, (req, res) => {
  const resultado = validarSolicitud(req.body);
  if (!resultado.ok) {
    return res.status(400).json({ error: 'Solicitud incorrecta', detalles: resultado.errores });
  }
  res.status(200).json(calcularPresupuesto(resultado.datos));
});

// ---------------------------------------------------------------------------
// Asistente con IA
// ---------------------------------------------------------------------------

// GET /api/catalogo — servicios disponibles con su precio y límites del formulario
app.get('/api/catalogo', (req, res) => {
  res.json({
    moneda: MONEDA,
    servicios: CATALOGO.map((s) => ({ ...s, regla: reglaPrecio(s) })),
    limites: { clienteMax: CLIENTE_MAX, descripcionMin: DESCRIPCION_MIN, descripcionMax: DESCRIPCION_MAX },
  });
});

// POST /api/propuesta — { cliente, descripcion } → propuesta de servicios de la IA ya validada
app.post('/api/propuesta', exigirJSON, limitarPorIP({ maximo: Number(process.env.LIMITE_IA_POR_MINUTO) || 10 }), async (req, res) => {
  const v = validarSolicitudIA(req.body);
  if (!v.ok) return res.status(400).json({ error: 'Solicitud incorrecta', detalles: v.errores });

  try {
    const propuesta = await pedirPropuestaIA(v.datos.descripcion);
    // Mensaje que no es una solicitud de web (o sin servicios del catálogo): no hay propuesta
    if (!propuesta.valida) {
      return res.status(422).json({
        error: 'Mensaje no válido',
        invalida: true,
        motivo: propuesta.motivo,
        sugerencias: propuesta.sugerencias,
      });
    }
    res.json({ cliente: v.datos.cliente, ...propuesta });
  } catch (err) {
    if (err instanceof ErrorIA) {
      console.error('[IA]', err.message, err.causa?.status ?? '', err.causa?.message ?? '');
      return res.status(err.status).json({ error: err.message, reintentar: true });
    }
    throw err;
  }
});

// POST /api/presupuesto/detalle — selección confirmada → importes calculados por el servidor
app.post('/api/presupuesto/detalle', exigirJSON, (req, res) => {
  const v = validarSeleccion(req.body);
  if (!v.ok) return res.status(400).json({ error: 'Solicitud incorrecta', detalles: v.errores });
  res.json(calcularPresupuestoFinal(v.datos));
});

// POST /api/presupuesto/pdf — misma validación y cálculo, devuelto como PDF
app.post('/api/presupuesto/pdf', exigirJSON, async (req, res) => {
  const v = validarSeleccion(req.body);
  if (!v.ok) return res.status(400).json({ error: 'Solicitud incorrecta', detalles: v.errores });

  const presupuesto = calcularPresupuestoFinal(v.datos);
  const pdf = await generarPDF(presupuesto);
  const nombre = `presupuesto-${presupuesto.cliente.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'cliente'}-${presupuesto.fecha}.pdf`;
  res
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nombre}"`,
      'Content-Length': pdf.length,
      'X-Total-Presupuesto': String(presupuesto.total),
    })
    .send(pdf);
});

// Interfaz React compilada (opcional): se sirve si existe cliente/dist
const dist = fileURLToPath(new URL('../cliente/dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
}

// Rutas inexistentes
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// JSON mal formado u otros errores
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Solicitud incorrecta',
      detalles: ['El cuerpo no es un JSON válido.'],
    });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
