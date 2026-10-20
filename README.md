# Presupuesta mi web

API REST hecha con **Node.js + Express (JavaScript)** que recibe las características de una web, valida los datos y devuelve un presupuesto desglosado calculado **siempre con las tarifas del servidor**.


## Requisitos

- Node.js **18 o superior** (probado con Node 25.9 y npm 11.12)
- npm

## Instalación y ejecución

```bash
git clone <URL-del-repositorio>
cd <carpeta-del-repositorio>
npm install        # instala Express (lee package.json / package-lock.json)
npm start          # arranca la API
```

La API queda escuchando en **http://localhost:3000**.

> **Windows:** si PowerShell muestra *"la ejecución de scripts está deshabilitada en este sistema"*, usa `npm.cmd install` y `npm.cmd start`, o ejecuta los comandos desde el Símbolo del sistema (cmd).

Para usar otro puerto, define la variable `PORT` (ver `.env.example`):

```bash
# Linux / macOS / Git Bash
PORT=4000 npm start
# PowerShell
$env:PORT=4000; npm start
```

Otros scripts:

| Comando        | Qué hace                                                  |
| -------------- | --------------------------------------------------------- |
| `npm start`    | Arranca el servidor                                       |
| `npm run dev`  | Arranca el servidor y lo reinicia al guardar cambios      |
| `npm test`     | Ejecuta las pruebas automáticas (`node:test`, sin dependencias extra) |
| `npm run cliente` | Instala y compila la interfaz React (ampliación opcional) |

## Rutas

| Método | Ruta               | Descripción                                      |
| ------ | ------------------ | ------------------------------------------------ |
| GET    | `/api/estado`      | Comprueba que el servicio funciona → `{"status":"ok"}` |
| GET    | `/api/tarifas`     | Devuelve las tarifas que usa el servidor         |
| POST   | `/api/presupuesto` | Valida la solicitud y devuelve el presupuesto    |

### GET /api/tarifas

```json
{
  "moneda": "EUR",
  "tarifas": {
    "landing": 300,
    "corporativa": 600,
    "paginaAdicional": 50,
    "formulario": 80,
    "segundoIdioma": 150
  }
}
```

### POST /api/presupuesto

Cabecera obligatoria: `Content-Type: application/json`. Cuerpo:

```json
{ "tipo": "corporativa", "paginas": 4, "formulario": true, "segundoIdioma": false }
```

Respuesta `200`:

```json
{ "base": 600, "paginasAdicionales": 150, "formulario": 80, "segundoIdioma": 0, "total": 830, "moneda": "EUR" }
```

Respuesta `400` (ejemplo):

```json
{ "error": "Solicitud incorrecta", "detalles": ["\"paginas\" debe ser un número entero entre 1 y 20 (recibido: 0)."] }
```

## Validación

Se hace en [src/validacion.js](src/validacion.js) **antes** de calcular. Se responde `400` si:

- El cuerpo no es un objeto JSON (array, `null`, JSON mal formado) o falta la cabecera `Content-Type: application/json`.
- Falta alguno de los cuatro campos obligatorios.
- `tipo` no es `"landing"` ni `"corporativa"`.
- `paginas` no es un entero entre 1 y 20 (`Number.isInteger` rechaza `"4"`, `2.5`, `NaN`…).
- `formulario` o `segundoIdioma` no son booleanos (`typeof … === 'boolean'` rechaza `"false"`).

Las propiedades adicionales se **ignoran**: el validador devuelve un objeto nuevo solo con los cuatro campos, así que un `"total"` o unas `"tarifas"` enviados por el cliente nunca llegan al cálculo.

## Cálculo

La función `calcularPresupuesto` está en [src/calculo.js](src/calculo.js), separada del manejador de la ruta (no usa `req` ni `res`). Las tarifas están en [src/tarifas.js](src/tarifas.js) y se congelan con `Object.freeze`.

```
Total = precio base + (páginas − 1) × 50 + formulario + segundo idioma
```

Ejemplo (caso 2): corporativa 600 + (4 − 1) × 50 = 150 + formulario 80 + segundo idioma 0 = **830 €**.

## Estructura

```
├── package.json          # dependencias y scripts (archivo clave)
├── package-lock.json     # versiones exactas instaladas
├── .env.example          # variable PORT opcional
├── src/
│   ├── server.js         # arranca el servidor (app.listen)
│   ├── app.js            # aplicación Express y rutas
│   ├── tarifas.js        # tarifas del servidor
│   ├── validacion.js     # validación de la solicitud
│   └── calculo.js        # función de cálculo independiente
├── tests/
│   └── api.test.js       # pruebas automáticas
└── cliente/              # interfaz React (ampliación opcional)
```

## Pruebas

### Cómo reproducirlas con curl

Con el servidor arrancado (`npm start`), en Git Bash / Linux / macOS:

```bash
curl http://localhost:3000/api/estado
curl http://localhost:3000/api/tarifas
curl -X POST http://localhost:3000/api/presupuesto \
  -H "Content-Type: application/json" \
  -d '{"tipo":"corporativa","paginas":4,"formulario":true,"segundoIdioma":false}'
```

En el Símbolo del sistema (cmd), las comillas internas se escapan:

```bat
curl -X POST http://localhost:3000/api/presupuesto -H "Content-Type: application/json" -d "{\"tipo\":\"corporativa\",\"paginas\":4,\"formulario\":true,\"segundoIdioma\":false}"
```

En PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/presupuesto `
  -ContentType "application/json" `
  -Body '{"tipo":"corporativa","paginas":4,"formulario":true,"segundoIdioma":false}'
```

También se pueden lanzar todas de forma automática con `npm test`.

### Rutas GET

| Ruta              | Resultado esperado          | Resultado obtenido |
| ----------------- | --------------------------- | ------------------ |
| `GET /api/estado` | 200 · `{"status":"ok"}`     | 200 · `{"status":"ok"}` ✅ |
| `GET /api/tarifas`| 200 · tarifas con nombre    | 200 · `{"moneda":"EUR","tarifas":{"landing":300,"corporativa":600,"paginaAdicional":50,"formulario":80,"segundoIdioma":150}}` ✅ |

### POST /api/presupuesto

En los casos inválidos solo se cambia un campo respecto a una solicitud correcta, para comprobar cada error por separado.

| # | Solicitud enviada | Esperado | Obtenido |
|---|-------------------|----------|----------|
| 1 | `{"tipo":"landing","paginas":1,"formulario":false,"segundoIdioma":false}` | 200 · 300 € | 200 · `{"base":300,"paginasAdicionales":0,"formulario":0,"segundoIdioma":0,"total":300,"moneda":"EUR"}` ✅ |
| 2 | `{"tipo":"corporativa","paginas":4,"formulario":true,"segundoIdioma":false}` | 200 · 830 € | 200 · `{"base":600,"paginasAdicionales":150,"formulario":80,"segundoIdioma":0,"total":830,"moneda":"EUR"}` ✅ |
| 3 | `{"tipo":"landing","paginas":2,"formulario":true,"segundoIdioma":true}` | 200 · 580 € | 200 · `{"base":300,"paginasAdicionales":50,"formulario":80,"segundoIdioma":150,"total":580,"moneda":"EUR"}` ✅ |
| 4 | `{"tipo":"landing","paginas":20,"formulario":false,"segundoIdioma":false}` | 200 · 1.250 € | 200 · `{"base":300,"paginasAdicionales":950,"formulario":0,"segundoIdioma":0,"total":1250,"moneda":"EUR"}` ✅ |
| 5 | `{"tipo":"corporativa","paginas":0,"formulario":true,"segundoIdioma":false}` | 400 | 400 · `"paginas" debe ser un número entero entre 1 y 20 (recibido: 0).` ✅ |
| 6 | `{"tipo":"corporativa","paginas":21,"formulario":true,"segundoIdioma":false}` | 400 | 400 · `"paginas" debe ser un número entero entre 1 y 20 (recibido: 21).` ✅ |
| 7 | `{"tipo":"corporativa","paginas":2.5,"formulario":true,"segundoIdioma":false}` | 400 | 400 · `"paginas" debe ser un número entero entre 1 y 20 (recibido: 2.5).` ✅ |
| 8 | `{"tipo":"tienda","paginas":4,"formulario":true,"segundoIdioma":false}` | 400 | 400 · `"tipo" debe ser "landing" o "corporativa" (recibido: "tienda").` ✅ |
| 9 | `{"tipo":"corporativa","paginas":4,"formulario":"false","segundoIdioma":false}` | 400 | 400 · `"formulario" debe ser un booleano true o false (recibido: "false").` ✅ |

### Pruebas adicionales

| Solicitud enviada | Esperado | Obtenido |
|-------------------|----------|----------|
| Caso 2 con `"paginas":"4"` (cadena) | 400 | 400 ✅ |
| Caso 2 sin el campo `segundoIdioma` | 400 | 400 · `Falta el campo obligatorio "segundoIdioma".` ✅ |
| Cuerpo `[ {...} ]` (array) | 400 | 400 · `El cuerpo de la solicitud debe ser un objeto JSON.` ✅ |
| JSON mal formado `{"tipo": "landing",` | 400 | 400 · `El cuerpo no es un JSON válido.` ✅ |
| Caso 2 con `Content-Type: text/plain` | 400 | 400 ✅ |
| Caso 2 + `"total":1,"base":0,"tarifas":{"corporativa":1}` | 200 · 830 € (se ignoran) | 200 · total 830 ✅ |
| Ruta inexistente `GET /nada` | 404 | 404 · `{"error":"Ruta no encontrada"}` ✅ |

Salida de `npm test`: **19 pruebas, 19 superadas, 0 fallos.**

## Ampliación: interfaz React

En la carpeta [cliente/](cliente/) hay una interfaz hecha con React + Vite que consume la API:

- **Calculadora:** pide las tarifas a `/api/tarifas` y, cada vez que cambia el formulario, envía la solicitud a `/api/presupuesto` y muestra el desglose devuelto por el servidor. El cliente no calcula precios.
- **Casos de prueba:** envía tal cual las 9 solicitudes de la tabla (incluidas las inválidas) y muestra el código HTTP y el mensaje de error que devuelve el servidor.

**Opción A – modo desarrollo** (dos terminales):

```bash
npm start                    # terminal 1: API en el puerto 3000
cd cliente && npm install && npm run dev   # terminal 2: interfaz en http://localhost:5173
```

Vite redirige las peticiones `/api` al puerto 3000 (ver `cliente/vite.config.js`).

**Opción B – todo en un servidor:**

```bash
npm run cliente   # compila la interfaz en cliente/dist
npm start         # Express sirve la interfaz en http://localhost:3000
```

Los presupuestos no se guardan en ninguna base de datos.
