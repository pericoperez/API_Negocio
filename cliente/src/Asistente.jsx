import { useEffect, useMemo, useState } from 'react';
import { AgentFace } from 'agentfaces/react';

/** Cara animada del asistente (agentfaces) con un bocadillo que explica qué está pasando. */
function CaraAsistente({ estado, mensaje }) {
  return (
    <div className="cara-asistente">
      <AgentFace state={estado} shape="circle" color="#8b5cf6" size={72} name="Asistente" label={mensaje} />
      <p className="bocadillo" aria-live="polite">{mensaje}</p>
    </div>
  );
}

const euros = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
const fechaLarga = (iso) =>
  new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));

// Datos ficticios para probar los casos pedidos
const EJEMPLOS = [
  {
    etiqueta: 'Solicitud clara',
    cliente: 'Restaurante La Tortuga (ficticio)',
    descripcion:
      'Necesito una web para un restaurante. Quiero mostrar la carta, tener un formulario para solicitar reservas y ofrecer el contenido en dos idiomas. Serían 4 páginas: inicio, carta, galería y reservas.',
  },
  {
    etiqueta: 'Solicitud ambigua',
    cliente: 'Estudio Pilates Nube (ficticio)',
    descripcion: 'Quiero algo sencillo para que la gente me conozca y me pueda escribir. Igual también en otro idioma, no lo sé.',
  },
  {
    etiqueta: 'Mensaje no válido',
    cliente: 'Prueba (ficticio)',
    descripcion: 'Hola, ¿me das una receta de tortilla de patatas?',
  },
  {
    etiqueta: 'Servicio no ofrecido',
    cliente: 'Zapatería Paso Firme (ficticio)',
    descripcion:
      'Quiero una tienda online para vender zapatos con pago con tarjeta, y una app móvil para los clientes. También necesito una página de contacto.',
  },
];

async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const tipo = res.headers.get('content-type') ?? '';
  if (tipo.includes('application/pdf')) return { status: res.status, blob: await res.blob() };
  let datos = null;
  try {
    datos = await res.json();
  } catch {
    datos = { error: `El servidor respondió con un error (${res.status}).` };
  }
  return { status: res.status, datos };
}

export default function Asistente() {
  const [catalogo, setCatalogo] = useState(null);
  const [limites, setLimites] = useState({ clienteMax: 120, descripcionMax: 2000 });
  const [paso, setPaso] = useState('solicitud');

  // Paso 1
  const [cliente, setCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null); // { mensaje, detalles, reintentar }
  const [invalida, setInvalida] = useState(null); // { motivo, sugerencias } si el mensaje no es una solicitud válida

  // Paso 2
  const [propuesta, setPropuesta] = useState(null);
  const [resumen, setResumen] = useState('');
  const [seleccion, setSeleccion] = useState({}); // id → { incluido, cantidad }
  const [aclaraciones, setAclaraciones] = useState([]);

  // Paso 3
  const [presupuesto, setPresupuesto] = useState(null);
  const [pdf, setPdf] = useState(null); // { url, nombre }
  const [celebrando, setCelebrando] = useState(false);

  // Al llegar al presupuesto final la cara celebra un momento y luego queda en "hecho"
  useEffect(() => {
    if (paso !== 'revision') return;
    setCelebrando(true);
    const t = setTimeout(() => setCelebrando(false), 2500);
    return () => clearTimeout(t);
  }, [paso]);

  useEffect(() => {
    fetch('/api/catalogo')
      .then((r) => r.json())
      .then((d) => {
        setCatalogo(d.servicios);
        setLimites(d.limites);
      })
      .catch(() => setError({ mensaje: 'No se ha podido cargar el catálogo. ¿Está arrancado el servidor?' }));
  }, []);

  // Libera la URL del PDF cuando ya no se usa
  useEffect(() => () => pdf && URL.revokeObjectURL(pdf.url), [pdf]);

  // ---------- Paso 1: pedir la propuesta ----------
  async function pedirPropuesta(e) {
    e?.preventDefault();
    setCargando(true);
    setError(null);
    setInvalida(null);
    try {
      const { status, datos } = await postJSON('/api/propuesta', { cliente, descripcion });
      // Mensaje no válido: se queda en el paso 1 con el motivo y mensajes de ejemplo
      if (status === 422 && datos.invalida) {
        setInvalida({ motivo: datos.motivo, sugerencias: datos.sugerencias ?? [] });
        return;
      }
      if (status !== 200) {
        setError({ mensaje: datos.error, detalles: datos.detalles, reintentar: datos.reintentar });
        return;
      }
      setPropuesta(datos);
      setResumen(datos.resumen);
      const sel = {};
      for (const s of catalogo ?? []) sel[s.id] = { incluido: false, cantidad: null };
      for (const s of datos.servicios) sel[s.id] = { incluido: true, cantidad: s.cantidad };
      setSeleccion(sel);
      setAclaraciones([
        ...datos.dudas,
        ...datos.pendientes.map((p) => `Pendiente de valorar: ${p.necesidad}. ${p.motivo}`),
      ]);
      setPaso('propuesta');
    } catch {
      setError({ mensaje: 'No se ha podido contactar con el servidor. Comprueba la conexión e inténtalo de nuevo.', reintentar: true });
    } finally {
      setCargando(false);
    }
  }

  // ---------- Paso 2: revisar ----------
  const justificaciones = useMemo(
    () => Object.fromEntries((propuesta?.servicios ?? []).map((s) => [s.id, s.justificacion])),
    [propuesta]
  );

  const tipos = (catalogo ?? []).filter((s) => s.grupo === 'base');
  const extras = (catalogo ?? []).filter((s) => s.grupo !== 'base');
  const tipoElegido = tipos.find((t) => seleccion[t.id]?.incluido)?.id ?? null;

  const elegirTipo = (id) =>
    setSeleccion((s) => {
      const nuevo = { ...s };
      for (const t of tipos) nuevo[t.id] = { ...nuevo[t.id], incluido: t.id === id };
      return nuevo;
    });
  const alternar = (id) => setSeleccion((s) => ({ ...s, [id]: { ...s[id], incluido: !s[id]?.incluido } }));
  const cambiarCantidad = (id, valor) =>
    setSeleccion((s) => ({ ...s, [id]: { ...s[id], cantidad: valor === '' ? null : Number(valor) } }));

  const faltan = [];
  if (!tipoElegido) faltan.push('Elige un tipo de web.');
  for (const s of extras) {
    const sel = seleccion[s.id];
    if (sel?.incluido && s.unidad) {
      const c = sel.cantidad;
      if (!Number.isInteger(c) || c < s.cantidadMin || c > s.cantidadMax)
        faltan.push(`Indica cuántas ${s.nombre.toLowerCase()} (entre ${s.cantidadMin} y ${s.cantidadMax}).`);
    }
  }
  if (!resumen.trim()) faltan.push('El resumen no puede quedar vacío.');

  function cuerpoSeleccion() {
    return {
      cliente: propuesta.cliente,
      resumen,
      servicios: (catalogo ?? [])
        .filter((s) => seleccion[s.id]?.incluido)
        .map((s) => (s.unidad ? { id: s.id, cantidad: seleccion[s.id].cantidad } : { id: s.id })),
      aclaraciones: aclaraciones.map((a) => a.trim()).filter(Boolean),
    };
  }

  // ---------- Paso 3: el servidor calcula y genera el PDF ----------
  async function calcular() {
    setCargando(true);
    setError(null);
    try {
      const cuerpo = cuerpoSeleccion();
      const [detalle, documento] = await Promise.all([
        postJSON('/api/presupuesto/detalle', cuerpo),
        postJSON('/api/presupuesto/pdf', cuerpo),
      ]);
      if (detalle.status !== 200) {
        setError({ mensaje: detalle.datos.error, detalles: detalle.datos.detalles });
        return;
      }
      if (documento.status !== 200 || !documento.blob) {
        setError({ mensaje: 'No se ha podido generar el PDF.', detalles: documento.datos?.detalles, reintentar: true });
        return;
      }
      setPresupuesto(detalle.datos);
      const nombreArchivo = `presupuesto-${detalle.datos.cliente.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}-${detalle.datos.fecha}.pdf`;
      setPdf({ url: URL.createObjectURL(documento.blob), nombre: nombreArchivo });
      setPaso('revision');
    } catch {
      setError({ mensaje: 'No se ha podido contactar con el servidor. Inténtalo de nuevo.', reintentar: true });
    } finally {
      setCargando(false);
    }
  }

  function volverAEditar() {
    setPdf(null);
    setPresupuesto(null);
    setError(null);
    setPaso('propuesta');
  }

  function empezarDeNuevo() {
    setPdf(null);
    setPresupuesto(null);
    setPropuesta(null);
    setError(null);
    setPaso('solicitud');
  }

  // ---------- Render ----------
  const pasos = [
    { id: 'solicitud', nombre: 'Describe tu proyecto' },
    { id: 'propuesta', nombre: 'Revisa la propuesta' },
    { id: 'revision', nombre: 'Presupuesto y PDF' },
  ];
  const indicePaso = pasos.findIndex((p) => p.id === paso);

  // Estado de la cara según lo que está ocurriendo en el asistente
  let cara;
  if (error) cara = { estado: 'alert', mensaje: 'Vaya, algo ha fallado. Puedes volver a intentarlo.' };
  else if (cargando && paso === 'solicitud') cara = { estado: 'thinking', mensaje: 'Estoy analizando tu solicitud…' };
  else if (cargando) cara = { estado: 'working', mensaje: 'Calculando el presupuesto con nuestras tarifas…' };
  else if (paso === 'solicitud' && invalida) cara = { estado: 'needs-you', mensaje: 'No he entendido tu mensaje. Prueba con uno de estos ejemplos.' };
  else if (paso === 'solicitud' && descripcion.trim()) cara = { estado: 'attentive', mensaje: 'Te escucho. Cuando quieras, pulsa «Proponer servicios».' };
  else if (paso === 'solicitud') cara = { estado: 'idle', mensaje: '¡Hola! Cuéntame qué web necesitas y te propongo servicios.' };
  else if (paso === 'propuesta' && faltan.length > 0) cara = { estado: 'needs-you', mensaje: 'Necesito que completes algunos datos antes de calcular.' };
  else if (paso === 'propuesta') cara = { estado: 'waiting', mensaje: 'Esta es mi propuesta. Revísala y ajústala a tu gusto.' };
  else cara = { estado: celebrando ? 'celebrate' : 'done', mensaje: '¡Listo! Revisa el presupuesto y descárgalo en PDF.' };

  return (
    <section className="asistente">
      <CaraAsistente {...cara} />
      <ol className="progreso">
        {pasos.map((p, i) => (
          <li key={p.id} className={i === indicePaso ? 'actual' : i < indicePaso ? 'hecho' : ''}>
            <span className="num">{i < indicePaso ? '✓' : i + 1}</span>
            {p.nombre}
          </li>
        ))}
      </ol>

      {error && (
        <div className="errores" role="alert">
          <strong>{error.mensaje}</strong>
          {error.detalles?.length > 0 && (
            <ul>
              {error.detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {error.reintentar && (
            <button className="enlace reintentar" onClick={paso === 'solicitud' ? pedirPropuesta : calcular} disabled={cargando}>
              {cargando ? 'Reintentando…' : '↻ Volver a intentarlo'}
            </button>
          )}
        </div>
      )}

      {paso === 'solicitud' && (
        <form className="cristal" onSubmit={pedirPropuesta} noValidate>
          <div className="ejemplos">
            <span>Probar con datos ficticios:</span>
            {EJEMPLOS.map((ej) => (
              <button
                type="button"
                key={ej.etiqueta}
                className="enlace"
                onClick={() => {
                  setCliente(ej.cliente);
                  setDescripcion(ej.descripcion);
                  setError(null);
                  setInvalida(null);
                }}
              >
                {ej.etiqueta}
              </button>
            ))}
          </div>

          <label className="campo">
            <span>Nombre del cliente o empresa</span>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={limites.clienteMax} placeholder="Ej.: Restaurante La Tortuga" />
          </label>

          <label className="campo">
            <span>¿Qué necesitas?</span>
            <textarea
              rows={6}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={limites.descripcionMax}
              placeholder="Cuéntanos tu proyecto: a qué te dedicas, qué quieres mostrar, qué deben poder hacer tus clientes…"
            />
            <small className={descripcion.length > limites.descripcionMax * 0.9 ? 'aviso-largo' : ''}>
              {descripcion.length} / {limites.descripcionMax}
            </small>
          </label>

          {invalida && (
            <div className="invalida" role="alert">
              <strong>Mensaje no válido</strong>
              <p>{invalida.motivo}</p>
              <p className="invalida-sub">Prueba a describir tu proyecto así (pulsa uno para usarlo y edítalo a tu gusto):</p>
              <ul>
                {invalida.sugerencias.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="sugerencia"
                      onClick={() => {
                        setDescripcion(s);
                        setInvalida(null);
                      }}
                    >
                      «{s}»
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button className="boton ancho" disabled={cargando || !catalogo}>
            {cargando ? (
              <>
                <span className="girando" /> El asistente está analizando tu solicitud…
              </>
            ) : (
              'Proponer servicios ✨'
            )}
          </button>
          <p className="nota centro">La IA solo propone servicios del catálogo. Los precios los calcula siempre nuestro servidor.</p>
        </form>
      )}

      {paso === 'propuesta' && propuesta && (
        <div className="rejilla">
          <div className="cristal">
            <div className="paso">
              <span className="num">1</span>
              <h2>Resumen del proyecto</h2>
            </div>
            <p className="nota">Cliente: <strong>{propuesta.cliente}</strong> · puedes editar el resumen</p>
            <textarea className="area" rows={4} value={resumen} onChange={(e) => setResumen(e.target.value)} maxLength={1000} />

            <div className="paso">
              <span className="num">2</span>
              <h2>Tipo de web</h2>
            </div>
            <div className="tipos">
              {tipos.map((t) => (
                <label key={t.id} className={`tipo ${tipoElegido === t.id ? 'activo' : ''}`}>
                  <input type="radio" name="tipo-ia" checked={tipoElegido === t.id} onChange={() => elegirTipo(t.id)} />
                  <span className="tipo-nombre">{t.nombre}</span>
                  <span className="tipo-desc">{t.descripcion}</span>
                  {justificaciones[t.id] && <span className="ia-just"><b>IA</b> {justificaciones[t.id]}</span>}
                  <span className="chip">{euros(t.precio)}</span>
                </label>
              ))}
            </div>

            <div className="paso">
              <span className="num">3</span>
              <h2>Servicios adicionales</h2>
            </div>
            <div className="extras">
              {extras.map((s) => {
                const sel = seleccion[s.id] ?? {};
                const faltaCantidad = sel.incluido && s.unidad && !Number.isInteger(sel.cantidad);
                return (
                  <div key={s.id} className={`servicio ${sel.incluido ? 'activo' : ''}`}>
                    <label className="servicio-cab">
                      <input type="checkbox" checked={!!sel.incluido} onChange={() => alternar(s.id)} />
                      <span className="extra-nombre">
                        {s.nombre}
                        {justificaciones[s.id] && <span className="badge">propuesto por IA</span>}
                      </span>
                      <span className="extra-precio">{s.regla}</span>
                      <span className="interruptor" />
                    </label>
                    <p className="servicio-desc">{s.descripcion}</p>
                    {justificaciones[s.id] && <p className="ia-just"><b>IA</b> {justificaciones[s.id]}</p>}
                    {sel.incluido && s.unidad && (
                      <label className={`cantidad ${faltaCantidad ? 'falta' : ''}`}>
                        <span>Número de páginas adicionales</span>
                        <input
                          type="number"
                          min={s.cantidadMin}
                          max={s.cantidadMax}
                          step={1}
                          value={sel.cantidad ?? ''}
                          onChange={(e) => cambiarCantidad(s.id, e.target.value)}
                          placeholder="?"
                        />
                        {faltaCantidad && <em>Dato necesario para calcular esta partida</em>}
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="cristal resultado">
            <p className="etiqueta">Aclaraciones y pendientes</p>
            <p className="nota">Aparecerán en el presupuesto. Edítalas, elimínalas o añade las tuyas.</p>
            <ul className="aclaraciones">
              {aclaraciones.map((a, i) => (
                <li key={i}>
                  <textarea
                    rows={2}
                    value={a}
                    maxLength={300}
                    onChange={(e) => setAclaraciones((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button className="quitar" aria-label="Eliminar aclaración" onClick={() => setAclaraciones((l) => l.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            {aclaraciones.length < 15 && (
              <button className="enlace" onClick={() => setAclaraciones((l) => [...l, ''])}>
                + Añadir aclaración
              </button>
            )}

            {propuesta.pendientes.length > 0 && (
              <div className="pendientes">
                <strong>Fuera de catálogo (pendiente de valorar)</strong>
                <ul>
                  {propuesta.pendientes.map((p) => (
                    <li key={p.necesidad}>{p.necesidad}</li>
                  ))}
                </ul>
              </div>
            )}

            {faltan.length > 0 && (
              <div className="faltan">
                <strong>Antes de continuar:</strong>
                <ul>
                  {faltan.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            <button className="boton ancho" onClick={calcular} disabled={faltan.length > 0 || cargando}>
              {cargando ? 'Calculando…' : 'Calcular presupuesto'}
            </button>
            <button className="enlace ancho" onClick={empezarDeNuevo}>
              ← Cambiar la descripción
            </button>
          </aside>
        </div>
      )}

      {paso === 'revision' && presupuesto && (
        <div className="revision">
          <article className="papel" aria-label="Vista previa del presupuesto">
            <header>
              <div>
                <strong>Presupuesta mi web</strong>
              </div>
              <h2>PRESUPUESTO</h2>
            </header>
            <p className="papel-etq">Cliente</p>
            <h3>{presupuesto.cliente}</h3>
            <p className="papel-fecha">Fecha: {fechaLarga(presupuesto.fecha)}</p>

            <h4>Resumen del proyecto</h4>
            <p>{presupuesto.resumen}</p>

            <h4>Servicios y desglose</h4>
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Cant.</th>
                    <th>Precio</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {presupuesto.lineas.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.nombre}</strong>
                        <small>{l.descripcion}</small>
                      </td>
                      <td>{l.cantidad}</td>
                      <td>{euros(l.precioUnitario)}</td>
                      <td><strong>{euros(l.importe)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>TOTAL</td>
                    <td>{euros(presupuesto.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <h4>Aclaraciones y aspectos pendientes</h4>
            <ul>
              {(presupuesto.aclaraciones.length ? presupuesto.aclaraciones : ['No hay aspectos pendientes de concretar.']).map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </article>

          <aside className="cristal acciones">
            <p className="etiqueta">Total calculado por el servidor</p>
            <div className="total">{euros(presupuesto.total)}</div>
            <p className="nota">Revisa el documento. Si algo no es correcto, vuelve atrás y modifícalo: el servidor recalculará los importes.</p>
            {pdf && (
              <a className="boton ancho" href={pdf.url} download={pdf.nombre}>
                ⬇ Aceptar y descargar PDF
              </a>
            )}
            <button className="enlace ancho" onClick={volverAEditar}>
              ← Modificar servicios
            </button>
            <button className="enlace ancho" onClick={empezarDeNuevo}>
              Empezar un presupuesto nuevo
            </button>
            {pdf && (
              <details className="json">
                <summary>Ver el PDF tal como se descargará</summary>
                <iframe className="visor-pdf" src={pdf.url} title="Vista previa del PDF" />
              </details>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
