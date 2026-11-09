/**
 * Límite sencillo de peticiones por IP y minuto (en memoria).
 * Protege la clave de OpenAI de un uso abusivo en el despliegue público.
 * En Vercel cada instancia tiene su propia memoria: es una protección básica.
 */
export function limitarPorIP({ maximo = 10, ventanaMs = 60_000 } = {}) {
  const registro = new Map();
  return (req, res, next) => {
    const ahora = Date.now();
    const ip = req.ip ?? 'desconocida';
    const recientes = (registro.get(ip) ?? []).filter((t) => ahora - t < ventanaMs);
    if (recientes.length >= maximo) {
      res.set('Retry-After', String(Math.ceil(ventanaMs / 1000)));
      return res.status(429).json({ error: 'Demasiadas solicitudes seguidas. Espera un minuto y vuelve a intentarlo.', reintentar: true });
    }
    recientes.push(ahora);
    registro.set(ip, recientes);
    if (registro.size > 5000) registro.clear();
    next();
  };
}
