import app from './app.js';

// En local se carga .env si existe (Node >= 20.12). En Vercel las variables vienen del panel.
if (typeof process.loadEnvFile === "function") {
  // Ruta absoluta a la raíz del proyecto: funciona aunque se arranque desde otra carpeta
  const rutaEnv = new URL('../.env', import.meta.url);
  try { process.loadEnvFile(rutaEnv); } catch { /* sin .env */ }
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API de presupuestos escuchando en http://localhost:${PORT}`);
});
