import { useEffect, useRef, useState } from 'react';

const euros = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

// Casos de la tabla de pruebas: se envían tal cual para ver la respuesta real del servidor
const valido = { tipo: 'corporativa', paginas: 4, formulario: true, segundoIdioma: false };
const CASOS = [
  { n: 1, titulo: 'Landing, 1 página', body: { tipo: 'landing', paginas: 1, formulario: false, segundoIdioma: false }, espera: 200 },
  { n: 2, titulo: 'Corporativa, 4 págs + form', body: valido, espera: 200 },
  { n: 3, titulo: 'Landing, 2 págs, extras', body: { tipo: 'landing', paginas: 2, formulario: true, segundoIdioma: true }, espera: 200 },
  { n: 4, titulo: 'Landing, 20 páginas', body: { tipo: 'landing', paginas: 20, formulario: false, segundoIdioma: false }, espera: 200 },
  { n: 5, titulo: 'paginas: 0', body: { ...valido, paginas: 0 }, espera: 400 },
  { n: 6, titulo: 'paginas: 21', body: { ...valido, paginas: 21 }, espera: 400 },
  { n: 7, titulo: 'paginas: 2.5', body: { ...valido, paginas: 2.5 }, espera: 400 },
  { n: 8, titulo: 'tipo: "tienda"', body: { ...valido, tipo: 'tienda' }, espera: 400 },
  { n: 9, titulo: 'formulario: "false"', body: { ...valido, formulario: 'false' }, espera: 400 },
];

async function pedirPresupuesto(body, signal) {
  const res = await fetch('/api/presupuesto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  return { status: res.status, datos: await res.json() };
}

// Anima un número desde su valor anterior hasta el nuevo
function useNumeroAnimado(objetivo) {
  const [valor, setValor] = useState(objetivo ?? 0);
  const desde = useRef(valor);
  useEffect(() => {
    if (objetivo == null) return;
    const inicio = performance.now();
    const origen = desde.current;
    let frame;
    const paso = (t) => {
      const p = Math.min((t - inicio) / 450, 1);
      const v = origen + (objetivo - origen) * (1 - Math.pow(1 - p, 3));
      desde.current = v;
      setValor(v);
      if (p < 1) frame = requestAnimationFrame(paso);
    };
    frame = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(frame);
  }, [objetivo]);
  return Math.round(valor);
}

const IconoLanding = () => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <rect x="6" y="8" width="36" height="32" rx="4" />
    <path d="M6 16h36M14 24h20M14 31h12" />
  </svg>
);
const IconoCorporativa = () => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <rect x="4" y="12" width="26" height="28" rx="3" />
    <rect x="18" y="6" width="26" height="28" rx="3" />
    <path d="M18 14h26M24 21h14M24 27h9" />
  </svg>
);

export default function App() {
  const [tipo, setTipo] = useState('corporativa');
  const [paginas, setPaginas] = useState(4);
  const [formulario, setFormulario] = useState(true);
  const [segundoIdioma, setSegundoIdioma] = useState(false);

  const [tarifas, setTarifas] = useState(null);
  const [presupuesto, setPresupuesto] = useState(null);
  const [errores, setErrores] = useState([]);
  const [sinConexion, setSinConexion] = useState(false);
  const [cargando, setCargando] = useState(false);

  const [vista, setVista] = useState('calculadora');
  const [resultadosCasos, setResultadosCasos] = useState({});

  // Las tarifas vienen del servidor: el cliente no define precios
  useEffect(() => {
    fetch('/api/tarifas')
      .then((r) => r.json())
      .then((d) => setTarifas(d.tarifas))
      .catch(() => setSinConexion(true));
  }, []);

  // Cada cambio en el formulario pide un presupuesto nuevo al servidor
  useEffect(() => {
    const control = new AbortController();
    const espera = setTimeout(async () => {
      setCargando(true);
      try {
        const { status, datos } = await pedirPresupuesto(
          { tipo, paginas: Number(paginas), formulario, segundoIdioma },
          control.signal
        );
        setSinConexion(false);
        if (status === 200) {
          setPresupuesto(datos);
          setErrores([]);
        } else {
          setErrores(datos.detalles ?? [datos.error]);
        }
      } catch (e) {
        if (e.name !== 'AbortError') setSinConexion(true);
      } finally {
        setCargando(false);
      }
    }, 200);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [tipo, paginas, formulario, segundoIdioma]);

  async function ejecutarCaso(caso) {
    setResultadosCasos((r) => ({ ...r, [caso.n]: { cargando: true } }));
    try {
      const resultado = await pedirPresupuesto(caso.body);
      setResultadosCasos((r) => ({ ...r, [caso.n]: resultado }));
    } catch {
      setResultadosCasos((r) => ({ ...r, [caso.n]: { status: 0, datos: { error: 'Sin conexión' } } }));
    }
  }

  const ejecutarTodos = () => CASOS.forEach(ejecutarCaso);

  const total = useNumeroAnimado(presupuesto?.total);
  const partes = presupuesto
    ? [
        { clave: 'base', nombre: 'Precio base', valor: presupuesto.base, color: 'var(--c1)' },
        { clave: 'paginasAdicionales', nombre: `Páginas adicionales (${paginas - 1})`, valor: presupuesto.paginasAdicionales, color: 'var(--c2)' },
        { clave: 'formulario', nombre: 'Formulario de contacto', valor: presupuesto.formulario, color: 'var(--c3)' },
        { clave: 'segundoIdioma', nombre: 'Segundo idioma', valor: presupuesto.segundoIdioma, color: 'var(--c4)' },
      ]
    : [];

  const cambiarPaginas = (delta) => setPaginas((p) => Math.min(20, Math.max(1, Number(p) + delta)));

  return (
    <div className="fondo">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />

      <main className="contenedor">
        <header className="cabecera">
          <div className="marca">
            <span className="logo">€</span>
            <span>Presupuesta mi web</span>
          </div>
          <span className={`estado ${sinConexion ? 'off' : 'on'}`}>
            <span className="punto" />
            {sinConexion ? 'API desconectada' : 'API conectada'}
          </span>
        </header>

        <section className="hero">
          <h1>
            Tu web, <span className="degradado">presupuestada al instante</span>
          </h1>
          <p>Configura tu proyecto y el servidor calcula el precio en tiempo real con sus propias tarifas.</p>
        </section>

        <nav className="pestanas" role="tablist">
          <button role="tab" aria-selected={vista === 'calculadora'} onClick={() => setVista('calculadora')}>
            Calculadora
          </button>
          <button role="tab" aria-selected={vista === 'pruebas'} onClick={() => setVista('pruebas')}>
            Casos de prueba
          </button>
        </nav>

        {sinConexion && (
          <div className="aviso">
            No se puede conectar con la API. Arráncala con <code>npm start</code> en la carpeta del proyecto.
          </div>
        )}

        {vista === 'calculadora' ? (
          <div className="rejilla">
            <form className="cristal" onSubmit={(e) => e.preventDefault()}>
              <div className="paso">
                <span className="num">1</span>
                <h2>Tipo de web</h2>
              </div>
              <div className="tipos">
                {[
                  { id: 'landing', nombre: 'Landing', desc: 'Una página para captar clientes', Icono: IconoLanding },
                  { id: 'corporativa', nombre: 'Corporativa', desc: 'Web completa de empresa', Icono: IconoCorporativa },
                ].map(({ id, nombre, desc, Icono }) => (
                  <label key={id} className={`tipo ${tipo === id ? 'activo' : ''}`}>
                    <input type="radio" name="tipo" checked={tipo === id} onChange={() => setTipo(id)} />
                    <span className="tipo-icono">
                      <Icono />
                    </span>
                    <span className="tipo-nombre">{nombre}</span>
                    <span className="tipo-desc">{desc}</span>
                    {tarifas && <span className="chip">{euros(tarifas[id])}</span>}
                  </label>
                ))}
              </div>

              <div className="paso">
                <span className="num">2</span>
                <h2>Número de páginas</h2>
              </div>
              <div className="paginas">
                <button type="button" className="redondo" onClick={() => cambiarPaginas(-1)} disabled={paginas <= 1} aria-label="Una página menos">
                  −
                </button>
                <div className="paginas-centro">
                  <span className="paginas-valor">{paginas}</span>
                  <span className="paginas-etq">{Number(paginas) === 1 ? 'página' : 'páginas'}</span>
                </div>
                <button type="button" className="redondo" onClick={() => cambiarPaginas(1)} disabled={paginas >= 20} aria-label="Una página más">
                  +
                </button>
              </div>
              <input
                className="deslizador"
                type="range"
                min="1"
                max="20"
                value={paginas}
                onChange={(e) => setPaginas(Number(e.target.value))}
                style={{ '--progreso': `${((paginas - 1) / 19) * 100}%` }}
                aria-label="Número de páginas"
              />
              {tarifas && <p className="nota">La primera está incluida · cada adicional {euros(tarifas.paginaAdicional)}</p>}

              <div className="paso">
                <span className="num">3</span>
                <h2>Extras</h2>
              </div>
              <div className="extras">
                {[
                  { id: 'formulario', nombre: 'Formulario de contacto', valor: formulario, set: setFormulario },
                  { id: 'segundoIdioma', nombre: 'Segundo idioma', valor: segundoIdioma, set: setSegundoIdioma },
                ].map((x) => (
                  <label key={x.id} className={`extra ${x.valor ? 'activo' : ''}`}>
                    <input type="checkbox" checked={x.valor} onChange={(e) => x.set(e.target.checked)} />
                    <span className="extra-nombre">{x.nombre}</span>
                    {tarifas && <span className="extra-precio">+{euros(tarifas[x.id])}</span>}
                    <span className="interruptor" />
                  </label>
                ))}
              </div>
            </form>

            <aside className="cristal resultado" aria-live="polite">
              <p className="etiqueta">Presupuesto estimado</p>
              <div className={`total ${cargando ? 'pulso' : ''}`}>{presupuesto ? euros(total) : '—'}</div>
              <p className="iva">Calculado por el servidor · {presupuesto?.moneda ?? 'EUR'}</p>

              {presupuesto && (
                <>
                  <div className="barra">
                    {partes
                      .filter((p) => p.valor > 0)
                      .map((p) => (
                        <span key={p.clave} style={{ flexGrow: p.valor, background: p.color }} title={`${p.nombre}: ${euros(p.valor)}`} />
                      ))}
                  </div>
                  <ul className="desglose">
                    {partes.map((p) => (
                      <li key={p.clave} className={p.valor === 0 ? 'cero' : ''}>
                        <span className="marca-color" style={{ background: p.color }} />
                        <span>{p.nombre}</span>
                        <strong>{euros(p.valor)}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {errores.length > 0 && (
                <div className="errores">
                  <strong>El servidor ha rechazado la solicitud</strong>
                  <ul>
                    {errores.map((er) => (
                      <li key={er}>{er}</li>
                    ))}
                  </ul>
                </div>
              )}

              <details className="json">
                <summary>Ver JSON enviado y recibido</summary>
                <p>POST /api/presupuesto</p>
                <pre>{JSON.stringify({ tipo, paginas: Number(paginas), formulario, segundoIdioma }, null, 2)}</pre>
                <p>Respuesta</p>
                <pre>{JSON.stringify(presupuesto, null, 2)}</pre>
              </details>
            </aside>
          </div>
        ) : (
          <section className="cristal pruebas">
            <div className="pruebas-cabecera">
              <div>
                <h2>Casos de prueba</h2>
                <p>Envía las solicitudes de la tabla tal cual (incluidas las inválidas) y mira la respuesta real del servidor.</p>
              </div>
              <button className="boton" onClick={ejecutarTodos}>
                Ejecutar los 9
              </button>
            </div>
            <div className="casos">
              {CASOS.map((caso) => {
                const r = resultadosCasos[caso.n];
                const hecho = r && !r.cargando;
                const pasa = hecho && r.status === caso.espera;
                return (
                  <article key={caso.n} className={`caso ${hecho ? (pasa ? 'pasa' : 'falla') : ''}`}>
                    <header>
                      <span className="caso-n">#{caso.n}</span>
                      <span className="caso-titulo">{caso.titulo}</span>
                      <span className={`esperado e${caso.espera}`}>espera {caso.espera}</span>
                    </header>
                    <pre>{JSON.stringify(caso.body)}</pre>
                    <footer>
                      <button className="enlace" onClick={() => ejecutarCaso(caso)}>
                        {r?.cargando ? 'Enviando…' : 'Enviar'}
                      </button>
                      {hecho && (
                        <span className="respuesta">
                          <span className={`codigo c${r.status}`}>{r.status}</span>
                          {r.status === 200 ? `Total ${euros(r.datos.total)}` : (r.datos.detalles?.[0] ?? r.datos.error)}
                          <span className="check">{pasa ? '✓' : '✗'}</span>
                        </span>
                      )}
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <footer className="pie">0613 · Desarrollo web en entorno servidor · Node.js + Express + React</footer>
      </main>
    </div>
  );
}
