import app from './app.js';

// En local se carga .env si existe (Node >= 20.12). En Vercel las variables vienen del panel.
if (typeof process.loadEnvFile === "function") {
  try { process.loadEnvFile(); } catch { /* sin .env */ }
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API de presupuestos escuchando en http://localhost:${PORT}`);
});
