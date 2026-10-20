import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TARIFAS, MONEDA } from './tarifas.js';
import { validarSolicitud } from './validacion.js';
import { calcularPresupuesto } from './calculo.js';

const app = express();

// Solo se interpretan cuerpos con Content-Type: application/json
app.use(express.json());

// GET /api/estado — comprobación de que el servicio funciona
app.get('/api/estado', (req, res) => {
  res.json({ status: 'ok' });
});

// GET /api/tarifas — tarifas que usa el servidor
app.get('/api/tarifas', (req, res) => {
  res.json({ moneda: MONEDA, tarifas: TARIFAS });
});

// POST /api/presupuesto — valida y calcula
app.post('/api/presupuesto', (req, res) => {
  if (!req.is('application/json')) {
    return res.status(400).json({
      error: 'Solicitud incorrecta',
      detalles: ['La petición debe usar la cabecera Content-Type: application/json.'],
    });
  }

  const resultado = validarSolicitud(req.body);
  if (!resultado.ok) {
    return res.status(400).json({ error: 'Solicitud incorrecta', detalles: resultado.errores });
  }

  res.status(200).json(calcularPresupuesto(resultado.datos));
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
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
