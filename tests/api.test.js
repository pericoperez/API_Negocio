import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { calcularPresupuesto } from '../src/calculo.js';

let server;
let url;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  url = `http://localhost:${server.address().port}`;
});

after(() => server.close());

const valido = { tipo: 'corporativa', paginas: 4, formulario: true, segundoIdioma: false };

function postPresupuesto(body) {
  return fetch(`${url}/api/presupuesto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('GET /api/estado', async () => {
  const res = await fetch(`${url}/api/estado`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('GET /api/tarifas', async () => {
  const res = await fetch(`${url}/api/tarifas`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    moneda: 'EUR',
    tarifas: { landing: 300, corporativa: 600, paginaAdicional: 50, formulario: 80, segundoIdioma: 150 },
  });
});

const casosValidos = [
  [1, { tipo: 'landing', paginas: 1, formulario: false, segundoIdioma: false }, 300],
  [2, valido, 830],
  [3, { tipo: 'landing', paginas: 2, formulario: true, segundoIdioma: true }, 580],
  [4, { tipo: 'landing', paginas: 20, formulario: false, segundoIdioma: false }, 1250],
];

for (const [n, body, total] of casosValidos) {
  test(`Caso ${n}: 200 · total ${total}`, async () => {
    const res = await postPresupuesto(body);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).total, total);
  });
}

test('Caso 2: desglose completo del ejemplo', async () => {
  const res = await postPresupuesto(valido);
  assert.deepEqual(await res.json(), {
    base: 600,
    paginasAdicionales: 150,
    formulario: 80,
    segundoIdioma: 0,
    total: 830,
    moneda: 'EUR',
  });
});

const casosInvalidos = [
  [5, { paginas: 0 }],
  [6, { paginas: 21 }],
  [7, { paginas: 2.5 }],
  [8, { tipo: 'tienda' }],
  [9, { formulario: 'false' }],
  ['extra', { paginas: '4' }],
];

for (const [n, cambio] of casosInvalidos) {
  test(`Caso ${n}: ${JSON.stringify(cambio)} → 400`, async () => {
    const res = await postPresupuesto({ ...valido, ...cambio });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.detalles.length, 1);
  });
}

test('Falta un campo obligatorio → 400', async () => {
  const { segundoIdioma, ...incompleto } = valido;
  const res = await postPresupuesto(incompleto);
  assert.equal(res.status, 400);
});

test('Cuerpo que no es objeto (array) → 400', async () => {
  const res = await postPresupuesto([valido]);
  assert.equal(res.status, 400);
});

test('JSON mal formado → 400', async () => {
  const res = await fetch(`${url}/api/presupuesto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"tipo": "landing",',
  });
  assert.equal(res.status, 400);
});

test('Sin Content-Type application/json → 400', async () => {
  const res = await fetch(`${url}/api/presupuesto`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(valido),
  });
  assert.equal(res.status, 400);
});

test('Propiedades adicionales se ignoran (no imponen total ni tarifas)', async () => {
  const res = await postPresupuesto({ ...valido, total: 1, base: 0, tarifas: { corporativa: 1 } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).total, 830);
});

test('calcularPresupuesto es independiente de Express', () => {
  assert.equal(calcularPresupuesto(valido).total, 830);
});
