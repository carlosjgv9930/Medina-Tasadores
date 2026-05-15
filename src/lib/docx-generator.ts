/**
 * MEDINA TASADORES — Generador de Documentos Word
 * Archivo: src/lib/docx-generator.ts
 *
 * npm install docx
 * Archivos requeridos en public/:
 *   public/logo.jpg   ← logo horizontal de Medina Tasadores
 *   public/sello.png  ← sello digital (se aplica si withSeal=true)
 *
 * Tipos:
 *   resumen_inspeccion | informe_preliminar | informe_final
 *   informe_cierre     | carta_declinacion  | convenio_ajuste
 *
 * Correcciones aplicadas vs. modelos reales:
 *  ✓ Fuente Times New Roman 12pt (modelos usan TNR 12pt)
 *  ✓ Márgenes: top=1758 / left=right=bottom=1418 DXA
 *  ✓ Interlineado 1.5x (line=360) en párrafos narrativos
 *  ✓ Header: solo imagen de logo, sin footer de empresa
 *  ✓ Bloque Ref informes: firstLine=708 indent + TAB
 *  ✓ Campos de datos: LABEL[TAB]: Valor (sin tab-stops artificiales)
 *  ✓ Sección headers: solo bold, sin borde/color decorativo
 *  ✓ Firma dual: párrafos con TAB centrado, sin tabla
 *  ✓ Resumen de inspección: campos inline, sin tabla
 *  ✓ Alineación: justificada en todo el cuerpo
 */

import {
  AlignmentType, BorderStyle, Document, Footer, Header,
  ImageRun, LevelFormat, Packer, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import fs from 'fs';
import path from 'path';

// ─── TIPOS ───────────────────────────────────────────────────────────────────

export type DocType =
  | 'resumen_inspeccion'
  | 'informe_preliminar'
  | 'informe_final'
  | 'informe_cierre'
  | 'carta_declinacion'
  | 'convenio_ajuste';

export interface CaseData {
  asegurado?: string;
  asegurado_rnc?: string;       // "Rnc. 130-00139-1" o "Cédula No. 041-0017885-6"
  aseguradora?: string;
  reclamo?: string;
  poliza_no?: string;
  tipo_poliza?: string;
  fecha_siniestro?: string;
  fecha_asignacion?: string;
  fecha_inspeccion?: string;
  vigencia?: string;
  fecha_doc?: string;
  ubicacion_riesgo?: string;
  giro_negocio?: string;
  oficina_seguro?: string;
  causa?: string;
  causa_siniestro?: string;
  suma_asegurada?: string;
  deducible?: string;
  reserva?: string;
  intermediario?: string;
  att_nombre?: string;
  att_cargo?: string;
  receptor_inspeccion?: string;
  receptor_cedula?: string;
  receptor_cargo?: string;
  valor_ajustado?: string;
  infraseguro?: string;
  deducible_monto?: string;
  salvamento?: string;
  monto_indemnizar?: string;
  dia_firma?: string;
  mes_firma?: string;
  anio_firma?: string;
  anexos?: string;
  withSeal?: boolean;
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const FONT   = 'Times New Roman';
const SZ     = 24;                              // 12pt
const SZ_SM  = 20;                              // 10pt (uso interno)
const LINE15 = { line: 360, lineRule: 'auto' } as const;  // 1.5× interlineado
const LINE1  = { line: 240, lineRule: 'auto' } as const;  // simple
const JUST   = AlignmentType.JUSTIFIED;
const CTR    = AlignmentType.CENTER;
const TW     = 9360;                            // tabla width DXA (contenido ~9404)

const CELL_NONE = {
  top:    { style: BorderStyle.NONE },
  bottom: { style: BorderStyle.NONE },
  left:   { style: BorderStyle.NONE },
  right:  { style: BorderStyle.NONE },
};
const TABLE_NONE = { ...CELL_NONE, insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE } };

const NUMBERING = {
  config: [{
    reference: 'mt-bullets',
    levels: [{
      level: 0, format: LevelFormat.BULLET, text: '\u2013',
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } },
    }],
  }],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function r(text: string, opts: Record<string, unknown> = {}): TextRun {
  return new TextRun({ text, font: FONT, size: SZ, ...opts });
}

function parseInline(text: string, extra: Record<string, unknown> = {}): TextRun[] {
  const runs: TextRun[] = [];
  for (const seg of text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)) {
    if (!seg) continue;
    if (seg.startsWith('**') && seg.endsWith('**'))
      runs.push(new TextRun({ text: seg.slice(2, -2), font: FONT, size: SZ, bold: true, ...extra }));
    else if (seg.startsWith('*') && seg.endsWith('*'))
      runs.push(new TextRun({ text: seg.slice(1, -1), font: FONT, size: SZ, italics: true, ...extra }));
    else
      runs.push(new TextRun({ text: seg, font: FONT, size: SZ, ...extra }));
  }
  return runs.length > 0 ? runs : [new TextRun({ text, font: FONT, size: SZ, ...extra })];
}

/**
 * Markdown → Paragraph[]
 * ## SECCIÓN → bold normal (sin borde/color, como los modelos)
 * - viñeta → lista
 * ``texto`` → cursiva indentada
 */
function md(content: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const line of (content || '').split('\n')) {
    const t = line.trim();
    if (!t) { out.push(new Paragraph({ spacing: { before: 80 } })); continue; }

    if (t.startsWith('## ')) {
      out.push(new Paragraph({
        children: [new TextRun({ text: t.slice(3), font: FONT, size: SZ, bold: true })],
        spacing: { before: 240, after: 60, ...LINE15 },
      }));
      continue;
    }
    if (t.startsWith('# ')) {
      out.push(new Paragraph({
        children: [new TextRun({ text: t.slice(2), font: FONT, size: SZ, bold: true })],
        spacing: { before: 160, after: 60, ...LINE1 },
      }));
      continue;
    }
    if (t.startsWith('- ') || t.startsWith('• ')) {
      out.push(new Paragraph({
        children: parseInline(t.slice(2)),
        numbering: { reference: 'mt-bullets', level: 0 },
        spacing: { before: 60, after: 60, ...LINE1 },
      }));
      continue;
    }
    if (t.startsWith('``') || t.startsWith('´´') || t.startsWith("''")) {
      out.push(new Paragraph({
        children: parseInline(t, { italics: true }),
        indent: { left: 720 },
        alignment: JUST,
        spacing: { before: 80, after: 80, ...LINE15 },
      }));
      continue;
    }
    out.push(new Paragraph({
      children: parseInline(t),
      alignment: JUST,
      spacing: { before: 80, after: 80, ...LINE15 },
    }));
  }
  return out;
}

function spacer(n = 1): Paragraph[] {
  return Array(n).fill(null).map(() => new Paragraph({ spacing: { before: 120 } }));
}

function today(): string {
  const now    = new Date();
  const days   = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[now.getDay()]} ${String(now.getDate()).padStart(2, '0')} de ${months[now.getMonth()]} del ${now.getFullYear()}.`;
}

// ─── HEADER (imagen de logo, sin footer) ─────────────────────────────────────

function buildHeader(logoData: Buffer): Header {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            data: logoData,
            transformation: { width: 250, height: 65 },   // 3.47" × 0.7" — igual al modelo
            type: 'jpg',
          }),
        ],
        spacing: { after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F3864', space: 4 } },
      }),
    ],
  });
}

// ─── FIRMA DUAL (párrafos centrados con TAB, como los modelos) ───────────────

function buildFirmaDual(sello?: Buffer): (Paragraph | Table)[] {
  const TAB = [{ type: 'left' as const, position: 6000 }];
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      children: [
        r('EDDY S. MEDINA PUJOLS', { bold: true }),
        r('\t\t\t\t\t\t'),
        r('CARLOS J. GONZÁLEZ. V.', { bold: true }),
      ],
      alignment: CTR,
      tabStops: TAB,
    }),
    new Paragraph({
      children: [
        r('     Medina Tasadores, SRL.'),
        r('\t\t\t\t\t\t'),
        r('Ajustador Actuante'),
      ],
      alignment: CTR,
      tabStops: TAB,
    }),
  ];
  if (sello) {
    out.push(new Paragraph({
      children: [new ImageRun({ data: sello, transformation: { width: 80, height: 65 }, type: 'png' })],
      alignment: CTR,
      spacing: { before: 60 },
    }));
  }
  return out;
}

function buildFirmaSolo(sello?: Buffer): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({ children: [r('Carlos Junior González Ventura', { bold: true })], spacing: { after: 20 } }),
    new Paragraph({ children: [r('Ajustador Ramos Técnicos  |  Medina Tasadores, SRL.')] }),
  ];
  if (sello) {
    out.push(new Paragraph({
      children: [new ImageRun({ data: sello, transformation: { width: 80, height: 65 }, type: 'png' })],
      alignment: AlignmentType.LEFT,
      spacing: { before: 60 },
    }));
  }
  return out;
}

// ─── RESUMEN DE INSPECCIÓN ───────────────────────────────────────────────────

function buildResumen(c: CaseData, content: string, sello?: Buffer): Paragraph[] {
  const RTAB = [{ type: 'right' as const, position: TW - 260 }];
  return [
    new Paragraph({
      children: [r('REPORTE INSPECCIÓN SINIESTRO', { bold: true })],
      alignment: CTR,
      spacing: { before: 240, after: 120 },
    }),
    new Paragraph({
      children: [r('Asegurado: '), r(c.asegurado || '', { bold: true })],
      spacing: { before: 60, after: 0, ...LINE1 },
    }),
    // Todos los campos clave en una línea compacta, igual que el modelo
    new Paragraph({
      children: [
        r('Siniestro No. '), r(`${c.reclamo || ''}    `, { bold: true }),
        r('Póliza No. '),    r(`${c.poliza_no || ''}    `, { bold: true }),
        r('Vigencia: '),     r(`${c.vigencia || ''}    `, { bold: true }),
        r('Fecha Siniestro: '), r(`${c.fecha_siniestro || ''}    `, { bold: true }),
        r('Fecha Asignación: '), r(`${c.fecha_asignacion || ''}    `, { bold: true }),
        r('Fecha 1ra. Visita: '), r(`${c.fecha_inspeccion || ''}    `, { bold: true }),
        r('Cobertura Afectada: '), r(`${c.causa || ''}    `, { bold: true }),
        r('S/A: '), r(c.suma_asegurada || '', { bold: true }),
      ],
      spacing: { before: 0, after: 0, line: 480, lineRule: 'auto' },
      indent: { right: 2476 },
    }),
    new Paragraph({
      children: [r('Intermediario: '), r(c.intermediario || '', { bold: true })],
      spacing: { before: 0, after: 0, ...LINE1 },
    }),
    new Paragraph({
      children: [r('Causa del Siniestro: '), r(c.causa_siniestro || c.causa || '', { bold: true })],
      spacing: { before: 0, after: 0, ...LINE1 },
    }),
    new Paragraph({
      children: [r('Deducible: '), r(c.deducible || '', { bold: true })],
      spacing: { before: 0, after: 0, ...LINE1 },
    }),
    new Paragraph({
      children: [r('Giro del Negocio: '), r(c.giro_negocio || '', { bold: true })],
      spacing: { before: 240, after: 60 },
    }),
    new Paragraph({
      children: [r('Breve descripción del siniestro:')],
      spacing: { before: 0, after: 60, ...LINE1 },
    }),
    ...md(content),
    ...spacer(2),
    new Paragraph({
      children: [r('Reserva Estimada: '), r(c.reserva || '___________________', { bold: true })],
      border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'BBBBBB', space: 4 } },
      spacing: { before: 240, after: 240 },
    }),
    ...spacer(),
    new Paragraph({
      children: [
        r('AJUSTADOR: ', { bold: true }),
        r('Carlos Junior González Ventura', { bold: true }),
        r('\t\t\t\t\t'),
        r('FECHA: ', { bold: true }),
        r(c.fecha_doc || ''),
      ],
      indent: { left: 260 },
      tabStops: RTAB,
    }),
  ];
}

// ─── BLOQUE CARTA (informes: preliminar, final) ──────────────────────────────

function buildLetterHead(c: CaseData, titulo: string): Paragraph[] {
  const TAB2 = [{ type: 'left' as const, position: 2367 }];
  return [
    new Paragraph({ children: [r('Santiago de los Caballeros, Rep. Dom.')], spacing: { before: 80, after: 40 } }),
    new Paragraph({ children: [r(today())], spacing: { after: 200 } }),
    new Paragraph({ children: [r('Señores:')], spacing: { after: 40 } }),
    new Paragraph({ children: [r(c.aseguradora || '', { bold: true })], spacing: { after: 40 } }),
    new Paragraph({ children: [r('Santiago, Rep. Dom.')], spacing: { after: 160 } }),
    // Att.
    new Paragraph({ children: [r('Att.:', { bold: true }), r(`\t${c.att_nombre || ''}`)], indent: { firstLine: 708 }, spacing: { after: 20 } }),
    new Paragraph({ children: [r(`\t\t${c.att_cargo || ''}`)], tabStops: TAB2, spacing: { after: 100 } }),
    // Ref
    new Paragraph({ children: [r('Ref.: ', { bold: true }), r('Reclamo No.: ', { bold: true }), r(c.reclamo || '', { bold: true })], spacing: { after: 20 } }),
    new Paragraph({ children: [r('Asegurado: ', { bold: true }), r(c.asegurado || '', { bold: true })], indent: { firstLine: 708 }, spacing: { after: 20 } }),
    new Paragraph({ children: [r('Póliza No.: ', { bold: true }), r(c.poliza_no || '', { bold: true })], indent: { firstLine: 708 }, spacing: { after: 20 } }),
    new Paragraph({ children: [r('Póliza: ', { bold: true }), r(c.tipo_poliza || '', { bold: true })], indent: { firstLine: 708 }, spacing: { after: 20 } }),
    new Paragraph({ children: [r('Riesgo: ', { bold: true }), r(c.causa || '', { bold: true })], indent: { firstLine: 708 }, spacing: { after: 20 } }),
    new Paragraph({ children: [r('Fecha: ', { bold: true }), r(c.fecha_siniestro || '', { bold: true })], indent: { left: 708 }, spacing: { after: 240 } }),
    new Paragraph({ children: [r(titulo, { bold: true })], alignment: CTR, spacing: { before: 200, after: 200 } }),
    new Paragraph({ children: [r('Distinguidos Señores:')], spacing: { after: 120 } }),
  ];
}

function buildDataFields(c: CaseData): Paragraph[] {
  return ([
    ['COMPAÑÍA ASEGURADORA', c.aseguradora],
    ['FECHA ASIGNACIÓN', c.fecha_asignacion],
    ['FECHA INSPECCIÓN', c.fecha_inspeccion],
    ['OFICINA SEGURO', c.oficina_seguro || 'Sucursal Santiago de los Caballeros'],
    ['ASEGURADO', c.asegurado],
    ['DIRECCIÓN', c.ubicacion_riesgo],
    ['ACTIVIDAD COMERCIAL', c.giro_negocio],
    ['VIGENCIA PÓLIZA', c.vigencia],
    ['INTERMEDIARIO', c.intermediario],
    ['PÓLIZA', c.tipo_poliza],
    ['RIESGO AFECTADO', c.causa],
  ] as [string, string | undefined][])
    .filter(([, v]) => v)
    .map(([l, v]) => new Paragraph({
      children: [r(l, { bold: true }), r('\t'), r(': ' + (v || ''))],
      spacing: { before: 40, after: 40, ...LINE15 },
    }));
}

function buildAseguradoTable(c: CaseData): Table {
  const BORDER = {
    top:     { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' },
    bottom:  { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' },
    left:    { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' },
    right:   { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' },
    insideH: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    insideV: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  };
  const rows: [string, string][] = ([
    ['Nombre Asegurado:', c.asegurado],
    ['RNC./Cédula:', c.asegurado_rnc],
    ['Actividad Negocio:', c.giro_negocio],
    ['Ubicación:', c.ubicacion_riesgo],
    c.receptor_inspeccion
      ? ['Receptor Inspección:', `${c.receptor_inspeccion}${c.receptor_cargo ? ' — ' + c.receptor_cargo : ''}`]
      : ['', ''],
  ] as [string, string | undefined][]).filter(([, v]) => v) as [string, string][];

  return new Table({
    width: { size: TW, type: WidthType.DXA },
    columnWidths: [2880, 6480],
    borders: BORDER,
    rows: rows.map(([l, v]) => new TableRow({
      children: [
        new TableCell({ width: { size: 2880, type: WidthType.DXA }, borders: CELL_NONE, shading: { fill: 'EDF3FF', type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [r(l, { bold: true })], spacing: { ...LINE1 } })] }),
        new TableCell({ width: { size: 6480, type: WidthType.DXA }, borders: CELL_NONE, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [r(v || '', { bold: true })], spacing: { ...LINE1 } })] }),
      ],
    })),
  });
}

// ─── INFORME PRELIMINAR ──────────────────────────────────────────────────────

function buildPreliminar(c: CaseData, content: string, sello?: Buffer): (Paragraph | Table)[] {
  return [
    ...buildLetterHead(c, 'INFORME PRELIMINAR'),
    new Paragraph({ children: [r('En atención a su solicitud, procedemos a remitir el presente '), r('Informe Preliminar', { bold: true, italics: true }), r(', correspondiente al asegurado de la referencia, a los fines de informarle sobre el estado actual de la reclamación.')], alignment: JUST, spacing: { before: 80, after: 240, ...LINE15 } }),
    ...buildDataFields(c), ...spacer(),
    new Paragraph({ children: [r('ASEGURADO:', { bold: true })], spacing: { before: 160, after: 60, ...LINE15 } }),
    buildAseguradoTable(c), ...spacer(),
    ...md(content), ...spacer(2),
    new Paragraph({ children: [r('Sin otro particular por el momento, quedamos de ustedes.')], alignment: JUST, spacing: { before: 200, after: 80, ...LINE1 } }),
    new Paragraph({ children: [r('Muy atentamente,')], spacing: { before: 80, after: 300, ...LINE1 } }),
    ...buildFirmaDual(sello),
  ];
}

// ─── INFORME FINAL ───────────────────────────────────────────────────────────

function buildFinal(c: CaseData, content: string, sello?: Buffer): (Paragraph | Table)[] {
  const anexos = c.anexos || [
    '– Convenio de ajuste firmado', '– Cuadro de ajuste', '– Fotografías',
    '– Facturas / Cotizaciones', '– Secuencia de emails',
    '– Factura de Honorarios de Medina Tasadores, SRL.',
  ].join('\n');
  return [
    ...buildLetterHead(c, 'INFORME FINAL'),
    new Paragraph({ children: [r('En atención a su solicitud, procedimos a investigar y ajustar el caso indicado en la referencia. Al concluir nuestras labores procedimos a remitir nuestro '), r('Informe Final', { bold: true }), r(', del presente caso.')], alignment: JUST, spacing: { before: 80, after: 240, ...LINE15 } }),
    ...buildDataFields(c), ...spacer(),
    new Paragraph({ children: [r('ASEGURADO:', { bold: true })], spacing: { before: 160, after: 60, ...LINE15 } }),
    buildAseguradoTable(c), ...spacer(),
    ...md(content), ...spacer(2),
    new Paragraph({ children: [r('Sin otro particular por el momento, quedamos de ustedes.')], alignment: JUST, spacing: { before: 200, after: 80, ...LINE1 } }),
    new Paragraph({ children: [r('Muy atentamente,')], spacing: { before: 80, after: 300, ...LINE1 } }),
    ...buildFirmaDual(sello),
    ...spacer(2),
    new Paragraph({ children: [r('ANEXOS:', { bold: true })], alignment: CTR, spacing: { before: 120, after: 80, ...LINE1 } }),
    ...anexos.split('\n').filter(Boolean).map(a =>
      new Paragraph({ children: [r(a.replace(/^[–\-]\s*/, ''))], numbering: { reference: 'mt-bullets', level: 0 }, spacing: { before: 40, after: 40, ...LINE1 } })
    ),
  ];
}

// ─── INFORME DE CIERRE ───────────────────────────────────────────────────────

function buildCierre(c: CaseData, content: string, sello?: Buffer): (Paragraph | Table)[] {
  const TAB2 = [{ type: 'left' as const, position: 2367 }];
  const TAB1 = [{ type: 'left' as const, position: 708 }];
  const anexos = c.anexos || '– Secuencia de Email.\n– Fotografías.\n– Factura de Honorarios de Medina Tasadores, SRL.';
  return [
    new Paragraph({ children: [r('Santiago de los Caballeros, Rep. Dom.')], alignment: JUST, spacing: { before: 80, after: 40, ...LINE1 } }),
    new Paragraph({ children: [r(today())], alignment: JUST, spacing: { after: 200, ...LINE1 } }),
    new Paragraph({ children: [r('Señores:', { bold: true })], alignment: JUST, spacing: { after: 40, ...LINE1 } }),
    new Paragraph({ children: [r(c.aseguradora || '', { bold: true })], alignment: JUST, spacing: { after: 40, ...LINE1 } }),
    new Paragraph({ children: [r('Ciudad.', { bold: true })], alignment: JUST, spacing: { after: 160, ...LINE1 } }),
    new Paragraph({ children: [r('\t', { bold: true }), r('Atención', { bold: true }), r('\t: ', { bold: true }), r(c.att_nombre || '')], tabStops: TAB2, alignment: JUST, spacing: { after: 20, ...LINE1 } }),
    new Paragraph({ children: [r('\t  ' + (c.att_cargo || ''))], tabStops: TAB1, alignment: JUST, spacing: { after: 40, ...LINE1 } }),
    new Paragraph({ children: [r('\t', { bold: true }), r('Reclamo No.', { bold: true }), r('\t: ', { bold: true }), r(c.reclamo || '', { bold: true })], tabStops: TAB2, alignment: JUST, spacing: { after: 20, ...LINE1 } }),
    new Paragraph({ children: [r('\t', { bold: true }), r('Asegurado', { bold: true }), r('\t: ', { bold: true }), r(c.asegurado || '', { bold: true })], tabStops: TAB2, alignment: JUST, spacing: { after: 20, ...LINE1 } }),
    new Paragraph({ children: [r('\t', { bold: true }), r('Póliza No.', { bold: true }), r('\t: ', { bold: true }), r(c.poliza_no || '', { bold: true })], tabStops: TAB2, alignment: JUST, spacing: { after: 20, ...LINE1 } }),
    new Paragraph({ children: [r('Riesgo', { bold: true }), r('\t\t: ', { bold: true }), r(c.causa || '', { bold: true })], tabStops: TAB2, alignment: JUST, spacing: { after: 20, ...LINE1 }, indent: { firstLine: 708 } }),
    new Paragraph({ children: [r('Fecha', { bold: true }), r('\t\t: ', { bold: true }), r(c.fecha_siniestro || '', { bold: true })], tabStops: TAB2, alignment: JUST, spacing: { after: 200, ...LINE1 }, indent: { left: 708 } }),
    new Paragraph({ children: [r('Distinguidos señores:')], alignment: JUST, spacing: { after: 80, ...LINE1 } }),
    new Paragraph({ children: [r('Luego de saludarle muy afectuosamente, al tiempo que aprovechamos la ocasión para informarle sobre el resultado de nuestras gestiones en la inspección del reclamo de referencia.')], alignment: JUST, spacing: { before: 80, after: 160, ...LINE15 } }),
    ...md(content),
    new Paragraph({ spacing: { before: 120 } }),
    new Paragraph({ children: [r('Por lo anteriormente expuesto, recomendamos a la Dirección de Reclamaciones proceder al cierre definitivo, del reclamo de referencia, sin pago alguno a los asegurados.')], alignment: JUST, spacing: { before: 80, after: 80, ...LINE15 } }),
    new Paragraph({ children: [r('Sin otro particular por el momento, quedamos de ustedes,')], alignment: JUST, spacing: { before: 160, after: 40, ...LINE1 } }),
    new Paragraph({ children: [r('Muy atentamente,')], alignment: JUST, spacing: { before: 40, after: 300, ...LINE1 } }),
    ...buildFirmaDual(sello),
    new Paragraph({ spacing: { before: 240 } }),
    new Paragraph({ children: [r('Anexos:', { bold: true })], spacing: { after: 80, ...LINE1 } }),
    ...anexos.split('\n').filter(Boolean).map(a =>
      new Paragraph({ children: [r(a.replace(/^[–\-]\s*/, ''))], numbering: { reference: 'mt-bullets', level: 0 }, spacing: { before: 40, after: 40, ...LINE1 } })
    ),
  ];
}

// ─── CARTA DE DECLINACIÓN ────────────────────────────────────────────────────

function buildDeclinacion(c: CaseData, content: string, sello?: Buffer): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [r('Santiago de los Caballeros, Rep. Dom.')], spacing: { before: 80, after: 40, ...LINE1 } }),
    new Paragraph({ children: [r(today())], spacing: { after: 200, ...LINE1 } }),
    new Paragraph({ children: [r('Señores')], spacing: { after: 40, ...LINE1 } }),
    new Paragraph({ children: [r(c.asegurado || '', { bold: true })], spacing: { after: 20, ...LINE1 } }),
  ];
  if (c.asegurado_rnc) {
    children.push(new Paragraph({ children: [r(c.asegurado_rnc, { bold: true })], spacing: { after: 20, ...LINE1 } }));
  }
  children.push(
    new Paragraph({ children: [r('Ciudad.-')], spacing: { after: 40, ...LINE1 } }),
    new Paragraph({ children: [r('Vía: ', { bold: true }), r(c.intermediario || '')], indent: { firstLine: 708 }, spacing: { after: 80, ...LINE1 } }),
    new Paragraph({ children: [r('Ref.: ', { bold: true })], indent: { firstLine: 708 }, spacing: { after: 40, ...LINE1 } }),
  );
  for (const [l, v] of [
    ['Aseguradora', c.aseguradora], ['Póliza', c.tipo_poliza], ['Póliza No.', c.poliza_no],
    ['Fecha de Siniestro', c.fecha_siniestro], ['Reclamación Aseguradora', c.reclamo],
  ] as [string, string | undefined][]) {
    if (!v) continue;
    children.push(new Paragraph({ children: [r('\t'), r(`${l}\t\t: ${v}`)], indent: { firstLine: 708 }, spacing: { before: 20, after: 20, ...LINE1 } }));
  }
  children.push(
    new Paragraph({ spacing: { before: 120 } }),
    new Paragraph({ children: [r('Estimados señores:')], spacing: { before: 80, after: 120, ...LINE1 } }),
    ...md(content),
    new Paragraph({ children: [r('Mientras nos reiteramos a su disposición para las explicaciones que consideren de lugar, se suscriben de manera atenta,')], alignment: JUST, spacing: { before: 200, after: 280, ...LINE15 } }),
    ...buildFirmaSolo(sello),
    new Paragraph({ spacing: { before: 200 } }),
    new Paragraph({ children: [r('CC.: ' + (c.aseguradora || ''), { bold: true })], spacing: { after: 20, ...LINE1 } }),
  );
  if (c.att_nombre) {
    children.push(new Paragraph({ children: [r('Atención: ' + c.att_nombre, { bold: true })], spacing: { ...LINE1 } }));
  }
  return children;
}

// ─── CONVENIO DE AJUSTE ──────────────────────────────────────────────────────

function convCell(text: string, bold = false, w = 2340, shade = false): TableCell {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: shade ? { fill: 'EDF3FF', type: ShadingType.CLEAR } : undefined,
    borders: CELL_NONE,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [r(text || '', { bold })], spacing: { ...LINE1 } })],
  });
}

function buildConvenio(c: CaseData): (Paragraph | Table)[] {
  return [
    new Paragraph({ children: [r(`Reclamo ${c.reclamo || ''}`, { bold: true })], spacing: { before: 80, after: 40, ...LINE1 } }),
    new Paragraph({ children: [r('CONVENIO DE AJUSTE', { bold: true })], alignment: CTR, spacing: { before: 120, after: 240, ...LINE1 } }),
    new Paragraph({
      children: [
        r('Entre quien suscribe, '),
        r(`SRES.  ${(c.asegurado || '').toUpperCase()}${c.asegurado_rnc ? '  ' + c.asegurado_rnc.toUpperCase() : ''}`, { bold: true }),
        r(',  Y  '),
        r('MEDINA TASADORES, SRL., RNC. 101-77092-9', { bold: true }),
        r(', quien afirmó ser representante de '),
        r((c.aseguradora || '').toUpperCase(), { bold: true }),
        r(', queda entendido y convenido que la suma total a indemnizar es de '),
        r(c.monto_indemnizar || '________________', { bold: true }),
        r(' por todos los daños físicos, morales, materiales y de toda índole sufridos en fecha '),
        r(c.fecha_siniestro || '__/__/____', { bold: true }),
        r(', a causa de la ocurrencia '),
        r(c.causa || '________________', { bold: true }),
        r(' riesgos asegurados bajo la(s) póliza(s) No. '),
        r(c.poliza_no || '________________', { bold: true }),
        r(' luego de considerar la aplicación de las condiciones generales y particulares acordadas con el asegurado, y vigentes al momento del siniestro.'),
      ],
      alignment: JUST, spacing: { before: 80, after: 200, ...LINE15 },
    }),
    new Paragraph({ children: [r('La cifra a la cual ha arribado, es el resultado de la evaluación de los renglones que se muestran más abajo, cuyos valores fueron establecidos de mutuo acuerdo:')], alignment: JUST, spacing: { before: 80, after: 200, ...LINE15 } }),
    new Table({
      width: { size: 7200, type: WidthType.DXA }, columnWidths: [5040, 2160], borders: TABLE_NONE,
      rows: [
        new TableRow({ children: [convCell('Valor Ajustado:', true, 5040), convCell(c.valor_ajustado || '______________', false, 2160)] }),
        new TableRow({ children: [convCell('', false, 5040), convCell('', false, 2160)] }),
        new TableRow({ children: [convCell('Menos:', true, 5040), convCell('', false, 2160)] }),
        new TableRow({ children: [convCell('  Infraseguro:', false, 5040), convCell(c.infraseguro || '–', false, 2160)] }),
        new TableRow({ children: [convCell('  Deducible:', false, 5040), convCell(c.deducible_monto || '______________', false, 2160)] }),
        new TableRow({ children: [convCell('  Salvamento:', false, 5040), convCell(c.salvamento || '–', false, 2160)] }),
        new TableRow({ children: [convCell('Indemnizar:', true, 5040), convCell(c.monto_indemnizar || '______________', true, 2160, true)] }),
      ],
    }),
    ...spacer(2),
    new Paragraph({ children: [r('Es entendido que este convenio no representa una obligación de pago por parte de '), r((c.aseguradora || '').toUpperCase(), { bold: true }), r(', ya que se refiere únicamente a un acuerdo con relación a montos de pérdidas que deben ser revisados y aceptados por ellos como válidos y cuya indemnización pudiera estar afectada por condiciones o limitaciones no conocidas al momento de firmar el presente convenio.')], alignment: JUST, spacing: { before: 80, after: 200, ...LINE15 } }),
    new Paragraph({ children: [r(`En   SANTIAGO   a   los   ${c.dia_firma || '___'}   días   del   mes   de   ${c.mes_firma || '___________'}   del   año   ${c.anio_firma || '______'}.`)], spacing: { before: 200, after: 300, ...LINE1 } }),
    new Table({
      width: { size: TW, type: WidthType.DXA }, columnWidths: [4680, 4680], borders: TABLE_NONE,
      rows: [new TableRow({ children: [
        new TableCell({ width: { size: 4680, type: WidthType.DXA }, borders: CELL_NONE, children: [
          new Paragraph({ children: [r('______________________________')], spacing: { ...LINE1 } }),
          new Paragraph({ children: [r('Asegurado')], spacing: { ...LINE1 } }),
          new Paragraph({ children: [r('Cédula/RNC: ___________________')], spacing: { ...LINE1 } }),
          new Paragraph({ children: [r('Fecha: ________________________')], spacing: { ...LINE1 } }),
        ] }),
        new TableCell({ width: { size: 4680, type: WidthType.DXA }, borders: CELL_NONE, children: [
          new Paragraph({ children: [r('EDDY S. MEDINA PUJOLS.', { bold: true })], alignment: AlignmentType.RIGHT, spacing: { ...LINE1 } }),
          new Paragraph({ children: [r('Representante Aseguradora.')], alignment: AlignmentType.RIGHT, spacing: { ...LINE1 } }),
        ] }),
      ] })]
    }),
  ];
}

// ─── FUNCIÓN PRINCIPAL ───────────────────────────────────────────────────────

export async function generateDocx(docType: DocType, caseData: CaseData, content: string): Promise<Buffer> {
  const logoData = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.jpg'));

  let sello: Buffer | undefined;
  if (caseData.withSeal) {
    const sp = path.join(process.cwd(), 'public', 'sello.png');
    if (fs.existsSync(sp)) sello = fs.readFileSync(sp);
  }

  let children: (Paragraph | Table)[];
  switch (docType) {
    case 'resumen_inspeccion':  children = buildResumen(caseData, content, sello); break;
    case 'informe_preliminar':  children = buildPreliminar(caseData, content, sello); break;
    case 'informe_final':       children = buildFinal(caseData, content, sello); break;
    case 'informe_cierre':      children = buildCierre(caseData, content, sello); break;
    case 'carta_declinacion':   children = buildDeclinacion(caseData, content, sello); break;
    case 'convenio_ajuste':     children = buildConvenio(caseData); break;
    default: throw new Error(`Tipo no soportado: ${docType}`);
  }

  const doc = new Document({
    numbering: NUMBERING,
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    sections: [{
      properties: {
        page: {
          size:   { width: 12240, height: 15840 },
          margin: { top: 1758, right: 1418, bottom: 1418, left: 1418 },
        },
      },
      headers: { default: buildHeader(logoData) },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
