// Punto de entrada para Vercel: la app Express completa como función serverless.
// vercel.json redirige /api/* aquí; la interfaz React se sirve como estáticos.
import app from '../src/app.js';

export default app;
