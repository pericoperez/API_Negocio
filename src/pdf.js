import PDFDocument from 'pdfkit';

const COLOR = { texto: '#1f1d36', suave: '#6b6888', linea: '#dcdaf0', marca: '#6d3ef2', fondo: '#f4f2ff' };

// Las fuentes estándar de PDF usan WinAnsi: se normalizan los espacios especiales
const limpiar = (t) => String(t).replace(/[  ]/g, ' ');
const euros = (n) =>
  limpiar(new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n));
const fechaLarga = (iso) =>
  new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));

/**
 * Genera el PDF a partir de un presupuesto YA CALCULADO por el servidor
 * (salida de calcularPresupuestoFinal). Devuelve un Buffer.
 */
export function generarPDF(p) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 60, left: 50, right: 50 },
      info: { Title: `Presupuesto - ${p.cliente}`, Author: 'Presupuesta mi web' },
      bufferPages: true,
    });
    const trozos = [];
    doc.on('data', (t) => trozos.push(t));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    const izq = doc.page.margins.left;
    const ancho = doc.page.width - izq - doc.page.margins.right;
    const limiteY = () => doc.page.height - doc.page.margins.bottom;
    const asegurarEspacio = (alto) => {
      if (doc.y + alto > limiteY()) doc.addPage();
    };
    const titulo = (texto) => {
      asegurarEspacio(40);
      doc.moveDown(1.2).font('Helvetica-Bold').fontSize(11).fillColor(COLOR.marca).text(texto.toUpperCase(), izq, doc.y, { characterSpacing: 1 });
      doc.moveDown(0.4);
    };

    // ---- Cabecera ----
    doc.rect(0, 0, doc.page.width, 110).fill(COLOR.fondo);
    doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR.texto).text('Presupuesta mi web', izq, 38);
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.suave).text('Diseño y desarrollo de páginas web', izq, 58);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(COLOR.texto).text('PRESUPUESTO', izq, 40, { width: ancho, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.suave).text('Propuesta de servicios', izq, 66, { width: ancho, align: 'right' });

    // ---- Cliente ----
    doc.y = 135;
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.suave).text('CLIENTE', izq, doc.y, { characterSpacing: 1 });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR.texto).text(limpiar(p.cliente), izq, doc.y + 2, { width: ancho });
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.suave).text(`Fecha: ${fechaLarga(p.fecha)}`);

    // ---- Resumen ----
    titulo('Resumen del proyecto');
    doc.font('Helvetica').fontSize(10.5).fillColor(COLOR.texto).text(limpiar(p.resumen), izq, doc.y, { width: ancho, lineGap: 2 });

    // ---- Tabla de servicios ----
    titulo('Servicios y desglose');
    const col = { servicio: izq, cant: izq + ancho - 205, unit: izq + ancho - 150, importe: izq + ancho - 75 };
    const anchoServicio = col.cant - col.servicio - 12;

    const cabeceraTabla = () => {
      const y = doc.y;
      doc.rect(izq, y, ancho, 22).fill(COLOR.texto);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
      doc.text('Servicio', col.servicio + 8, y + 7);
      doc.text('Cant.', col.cant, y + 7, { width: 45, align: 'right' });
      doc.text('Precio', col.unit, y + 7, { width: 65, align: 'right' });
      doc.text('Importe', col.importe, y + 7, { width: 67, align: 'right' });
      doc.y = y + 30;
    };
    cabeceraTabla();

    for (const l of p.lineas) {
      doc.font('Helvetica').fontSize(8.5);
      const altoDesc = doc.heightOfString(limpiar(l.descripcion), { width: anchoServicio - 8 });
      const altoFila = 16 + altoDesc + 12;
      if (doc.y + altoFila > limiteY()) {
        doc.addPage();
        cabeceraTabla();
      }
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.texto).text(l.nombre, col.servicio + 8, y, { width: anchoServicio });
      doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.suave).text(limpiar(l.descripcion), col.servicio + 8, y + 15, { width: anchoServicio - 8 });
      doc.font('Helvetica').fontSize(10).fillColor(COLOR.texto);
      doc.text(String(l.cantidad), col.cant, y, { width: 45, align: 'right' });
      doc.text(euros(l.precioUnitario), col.unit, y, { width: 65, align: 'right' });
      doc.font('Helvetica-Bold').text(euros(l.importe), col.importe, y, { width: 67, align: 'right' });
      doc.moveTo(izq, y + altoFila - 6).lineTo(izq + ancho, y + altoFila - 6).lineWidth(0.6).strokeColor(COLOR.linea).stroke();
      doc.y = y + altoFila;
    }

    // Total
    asegurarEspacio(40);
    const yTotal = doc.y + 4;
    doc.roundedRect(col.unit - 60, yTotal, izq + ancho - (col.unit - 60), 32, 6).fill(COLOR.marca);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff').text('TOTAL', col.unit - 48, yTotal + 11);
    doc.fontSize(14).text(euros(p.total), col.importe - 40, yTotal + 9, { width: 107 - 8, align: 'right' });
    doc.y = yTotal + 40;

    // ---- Aclaraciones ----
    titulo('Aclaraciones y aspectos pendientes');
    const notas = p.aclaraciones.length > 0 ? p.aclaraciones : ['No hay aspectos pendientes de concretar.'];
    doc.font('Helvetica').fontSize(10).fillColor(COLOR.texto);
    for (const nota of notas) {
      asegurarEspacio(28);
      const y = doc.y;
      doc.circle(izq + 4, y + 5, 2).fill(COLOR.marca);
      doc.fillColor(COLOR.texto).text(limpiar(nota), izq + 14, y, { width: ancho - 14, lineGap: 1.5 });
      doc.moveDown(0.35);
    }

    // ---- Pie en todas las páginas ----
    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // si no, escribir dentro del margen crearía una página nueva
      const y = doc.page.height - 42;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.suave);
      doc.text(
        `Importes en ${p.moneda} calculados con las tarifas vigentes de Presupuesta mi web. Los aspectos pendientes se valorarán aparte.   ·   Página ${i + 1} de ${rango.count}`,
        izq, y, { width: ancho, align: 'center', lineBreak: false }
      );
    }

    doc.end();
  });
}
