/**
 * MEDINA TASADORES — Generador de Documentos Word v3
 * Archivo: src/lib/docx-generator.ts
 *
 * npm install docx
 * public/logo.jpg   ← logo
 * public/sello.png  ← sello digital
 *
 * Correcciones v3 sobre modelos reales:
 *
 * RESUMEN DE INSPECCIÓN:
 *   ✓ Márgenes exactos del modelo: top=720 right=360 bottom=280 left=720
 *   ✓ Sin header (el modelo no tiene encabezado con logo)
 *   ✓ Color rojo C0504D en todos los valores de campos
 *   ✓ Font size 22 (11pt) igual que el modelo
 *   ✓ Limpieza de contenido IA: elimina tablas markdown, separadores ---,
 *     y líneas duplicadas de campos ya estructurados
 *
 * TODOS LOS DEMÁS TIPOS (informes, cartas, convenio):
 *   ✓ Times New Roman 12pt
 *   ✓ Márgenes: top=1758 / left=right=bottom=1418
 *   ✓ Interlineado 1.5x en narrativa
 *   ✓ Header con logo (línea azul separadora)
 *   ✓ Sección headers: solo bold sin borde/color decorativo
 *   ✓ Firma dual: párrafos centrados con TAB (sin tabla)
 *   ✓ Bloque Ref: firstLine=708 indent
 */

import {
  AlignmentType, BorderStyle, Document, Header,
  ImageRun, LevelFormat, Packer, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType,
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
  asegurado_rnc?: string;
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

const FONT    = 'Times New Roman';
const SZ      = 24;        // 12pt — informes y cartas
const SZ_RES  = 22;        // 11pt — resumen de inspección (igual al modelo)
const RED     = 'C0504D';  // color rojo ladrillo del modelo resumen
const LINE15  = { line: 360, lineRule: 'auto' } as const;
const LINE1   = { line: 240, lineRule: 'auto' } as const;
const JUST    = AlignmentType.JUSTIFIED;
const CTR     = AlignmentType.CENTER;
const TW      = 9360;

const CELL_NONE  = { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} };
const TABLE_NONE = { ...CELL_NONE, insideH:{style:BorderStyle.NONE}, insideV:{style:BorderStyle.NONE} };

const NUMBERING = {
  config: [{
    reference: 'mt-bullets',
    levels: [{ level:0, format:LevelFormat.BULLET, text:'\u2013', alignment:AlignmentType.LEFT, style:{ paragraph:{ indent:{ left:720, hanging:360 } } } }],
  }],
};

// ─── LIMPIEZA DE CONTENIDO IA PARA RESUMEN ───────────────────────────────────
// La IA genera el documento completo en markdown. Extraemos SOLO
// la narrativa y sección NOTA, descartando encabezados duplicados y tablas.

function cleanResumenContent(content: string): string {
  const SKIP_STARTS = [
    'REPORTE INSPECCIÓN', 'REPORTE INSPECCION', 'REPORTE DE INSPECCIÓN',
    'Asegurado:', 'Siniestro No', 'Póliza No', 'Vigencia:',
    'Fecha Siniestro:', 'Fecha Asignación:', 'Fecha 1ra.',
    'Cobertura Afectada:', 'S/A:', 'Suma Asegurada:',
    'Intermediario:', 'Causa del Siniestro:', 'Deducible:',
    'Giro del Negocio:', 'Reserva Estimada:', 'AJUSTADOR:', '# ',
  ];

  const lines = content.split('\n').filter(line => {
    const t = line.trim();
    if (!t) return true;
    if (t === '---' || t === '***' || t === '___') return false;
    if (/^\|[-\s|]+\|$/.test(t)) return false;  // markdown table separator
    if (t.startsWith('|')) return false;          // markdown table row
    if (SKIP_STARTS.some(s => t.startsWith(s))) return false;
    return true;
  });

  // Encuentra dónde empieza la narrativa (después del header de descripción)
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim().toLowerCase();
    if (t.includes('descripci') && t.includes('siniestro')) { start = i + 1; break; }
  }

  return lines.slice(start).join('\n').trim();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function r(text: string, sz: number, opts: Record<string, unknown> = {}): TextRun {
  return new TextRun({ text, font:FONT, size:sz, ...opts });
}

function parseInline(text: string, sz: number, extra: Record<string, unknown> = {}): TextRun[] {
  const runs: TextRun[] = [];
  for (const seg of text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)) {
    if (!seg) continue;
    if (seg.startsWith('**') && seg.endsWith('**'))
      runs.push(new TextRun({ text:seg.slice(2,-2), font:FONT, size:sz, bold:true, ...extra }));
    else if (seg.startsWith('*') && seg.endsWith('*'))
      runs.push(new TextRun({ text:seg.slice(1,-1), font:FONT, size:sz, italics:true, ...extra }));
    else
      runs.push(new TextRun({ text:seg, font:FONT, size:sz, ...extra }));
  }
  return runs.length > 0 ? runs : [new TextRun({ text, font:FONT, size:sz, ...extra })];
}

function mdBase(content: string, sz: number, extra: Record<string, unknown> = {}): Paragraph[] {
  const out: Paragraph[] = [];
  for (const line of (content||'').split('\n')) {
    const t = line.trim();
    if (!t) { out.push(new Paragraph({ spacing:{ before:60 } })); continue; }
    if (t === '---' || t === '***' || t.startsWith('|')) continue;
    if (t.startsWith('## ') || t.startsWith('# ')) {
      out.push(new Paragraph({ children:[new TextRun({ text:t.replace(/^#+\s*/,''), font:FONT, size:sz, bold:true })], spacing:{ before:200, after:40, ...LINE15 } }));
      continue;
    }
    if (t.startsWith('- ') || t.startsWith('• ')) {
      out.push(new Paragraph({ children:parseInline(t.slice(2), sz, extra), numbering:{ reference:'mt-bullets', level:0 }, spacing:{ before:40, after:40, ...LINE1 } }));
      continue;
    }
    if (t.startsWith('``') || t.startsWith('´´') || t.startsWith("''")) {
      out.push(new Paragraph({ children:parseInline(t, sz, { italics:true, ...extra }), indent:{ left:720 }, alignment:JUST, spacing:{ before:80, after:80, ...LINE15 } }));
      continue;
    }
    out.push(new Paragraph({ children:parseInline(t, sz, extra), alignment:JUST, spacing:{ before:80, after:80, ...LINE15 } }));
  }
  return out;
}

const md    = (c: string) => mdBase(c, SZ, {});
const mdRed = (c: string) => mdBase(c, SZ_RES, { color: RED });

function spacer(n = 1): Paragraph[] {
  return Array(n).fill(null).map(() => new Paragraph({ spacing:{ before:120 } }));
}

function today(): string {
  const now=new Date();
  const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${days[now.getDay()]} ${String(now.getDate()).padStart(2,'0')} de ${months[now.getMonth()]} del ${now.getFullYear()}.`;
}

// ─── HEADER CON LOGO (solo informes y cartas) ────────────────────────────────

function buildHeader(logoData: Buffer): Header {
  return new Header({
    children: [new Paragraph({
      children: [new ImageRun({ data:logoData, transformation:{ width:250, height:65 }, type:'jpg' })],
      spacing: { after:60 },
      border: { bottom:{ style:BorderStyle.SINGLE, size:6, color:'1F3864', space:4 } },
    })]
  });
}

// ─── FIRMA DUAL (párrafos centrados con TAB) ─────────────────────────────────

function buildFirmaDual(sello?: Buffer): (Paragraph | Table)[] {
  const TAB = [{ type:'left' as const, position:6000 }];
  const out: (Paragraph | Table)[] = [
    new Paragraph({ children:[r('EDDY S. MEDINA PUJOLS', SZ, {bold:true}), r('\t\t\t\t\t\t', SZ), r('CARLOS J. GONZÁLEZ. V.', SZ, {bold:true})], alignment:CTR, tabStops:TAB }),
    new Paragraph({ children:[r('     Medina Tasadores, SRL.', SZ), r('\t\t\t\t\t\t', SZ), r('Ajustador Actuante', SZ)], alignment:CTR, tabStops:TAB }),
  ];
  if (sello) out.push(new Paragraph({ children:[new ImageRun({ data:sello, transformation:{ width:80, height:65 }, type:'png' })], alignment:CTR, spacing:{ before:60 } }));
  return out;
}

function buildFirmaSolo(sello?: Buffer): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({ children:[r('Carlos Junior González Ventura', SZ, {bold:true})], spacing:{ after:20 } }),
    new Paragraph({ children:[r('Ajustador Ramos Técnicos  |  Medina Tasadores, SRL.', SZ)] }),
  ];
  if (sello) out.push(new Paragraph({ children:[new ImageRun({ data:sello, transformation:{ width:80, height:65 }, type:'png' })], alignment:AlignmentType.LEFT, spacing:{ before:60 } }));
  return out;
}

// ─── RESUMEN DE INSPECCIÓN ───────────────────────────────────────────────────
// Sin header, márgenes compactos del modelo, valores en rojo C0504D

function buildResumen(c: CaseData, rawContent: string, sello?: Buffer): Paragraph[] {
  const narrative = cleanResumenContent(rawContent);

  const campo = (label: string, value: string | undefined) => new Paragraph({
    children: [
      new TextRun({ text:label, font:FONT, size:SZ_RES }),
      new TextRun({ text:value||'', font:FONT, size:SZ_RES, bold:true, color:RED }),
    ],
    alignment: JUST, spacing:{ before:0, after:0, ...LINE1 },
  });

  return [
    new Paragraph({
      children: [new TextRun({ text:'REPORTE INSPECCIÓN SINIESTRO', font:FONT, size:SZ_RES })],
      alignment: CTR, spacing:{ before:270, after:0 }, indent:{ right:360 },
    }),
    campo('Asegurado: ', c.asegurado),
    // Línea compacta con todos los campos clave (igual al modelo)
    new Paragraph({
      children: [
        r('Siniestro No. ', SZ_RES), new TextRun({ text:`${c.reclamo||''}    `, font:FONT, size:SZ_RES, bold:true, color:RED }),
        r('Póliza No. ', SZ_RES),    new TextRun({ text:`${c.poliza_no||''}    `, font:FONT, size:SZ_RES, bold:true, color:RED }),
        r('Vigencia: ', SZ_RES),     new TextRun({ text:`${c.vigencia||''}    `, font:FONT, size:SZ_RES, bold:true, color:RED }),
        r('Fecha Siniestro: ', SZ_RES), new TextRun({ text:`${c.fecha_siniestro||''}    `, font:FONT, size:SZ_RES, bold:true, color:RED }),
        r('Fecha Asignación: ', SZ_RES), new TextRun({ text:`${c.fecha_asignacion||''}    `, font:FONT, size:SZ_RES, bold:true, color:RED }),
        r('Fecha 1ra. Visita: ', SZ_RES), new TextRun({ text:`${c.fecha_inspeccion||''}    `, font:FONT, size:SZ_RES, bold:true, color:RED }),
        r('Cobertura Afectada: ', SZ_RES), new TextRun({ text:`${c.causa||''}    `, font:FONT, size:SZ_RES, bold:true, color:RED }),
        r('S/A: ', SZ_RES), new TextRun({ text:c.suma_asegurada||'', font:FONT, size:SZ_RES, bold:true, color:RED }),
      ],
      spacing:{ before:0, after:0, line:480, lineRule:'auto' }, indent:{ right:2476 },
    }),
    campo('Intermediario: ', c.intermediario),
    campo('Causa del Siniestro: ', c.causa_siniestro||c.causa),
    campo('Deducible: ', c.deducible),
    new Paragraph({ children:[r('Giro del Negocio: ', SZ_RES), new TextRun({ text:c.giro_negocio||'', font:FONT, size:SZ_RES, bold:true, color:RED })], spacing:{ before:275, after:0 } }),
    new Paragraph({ children:[r('Breve descripción del siniestro:', SZ_RES)], spacing:{ before:1, after:0, ...LINE1 } }),
    ...mdRed(narrative),
    new Paragraph({
      children:[r('Reserva Estimada: ', SZ_RES), new TextRun({ text:c.reserva||'___________________', font:FONT, size:SZ_RES, bold:true, color:RED })],
      alignment:JUST, spacing:{ before:276, after:0 },
    }),
    new Paragraph({
      children:[
        new TextRun({ text:'AJUSTADOR: ', font:FONT, size:SZ_RES, color:RED }),
        new TextRun({ text:'Carlos Junior González Ventura', font:FONT, size:SZ_RES, bold:true, color:RED }),
        r('\t\t\t\t\t', SZ_RES),
        new TextRun({ text:'FECHA: ', font:FONT, size:SZ_RES, color:RED }),
        new TextRun({ text:c.fecha_doc||'', font:FONT, size:SZ_RES, bold:true, color:RED }),
      ],
      indent:{ left:260 }, tabStops:[{ type:'right' as const, position:8640 }],
      spacing:{ before:0 },
    }),
  ];
}

// ─── BLOQUE CARTA (informes) ──────────────────────────────────────────────────

function buildLetterHead(c: CaseData, titulo: string): Paragraph[] {
  const TAB2 = [{ type:'left' as const, position:2367 }];
  return [
    new Paragraph({ children:[r('Santiago de los Caballeros, Rep. Dom.', SZ)], spacing:{ before:80, after:40 } }),
    new Paragraph({ children:[r(today(), SZ)], spacing:{ after:200 } }),
    new Paragraph({ children:[r('Señores:', SZ)], spacing:{ after:40 } }),
    new Paragraph({ children:[r(c.aseguradora||'', SZ, {bold:true})], spacing:{ after:40 } }),
    new Paragraph({ children:[r('Santiago, Rep. Dom.', SZ)], spacing:{ after:160 } }),
    new Paragraph({ children:[r('Att.:', SZ, {bold:true}), r(`\t${c.att_nombre||''}`, SZ)], indent:{ firstLine:708 }, spacing:{ after:20 } }),
    new Paragraph({ children:[r(`\t\t${c.att_cargo||''}`, SZ)], tabStops:TAB2, spacing:{ after:100 } }),
    new Paragraph({ children:[r('Ref.: ', SZ, {bold:true}), r('Reclamo No.: ', SZ, {bold:true}), r(c.reclamo||'', SZ, {bold:true})], spacing:{ after:20 } }),
    new Paragraph({ children:[r('Asegurado: ', SZ, {bold:true}), r(c.asegurado||'', SZ, {bold:true})], indent:{ firstLine:708 }, spacing:{ after:20 } }),
    new Paragraph({ children:[r('Póliza No.: ', SZ, {bold:true}), r(c.poliza_no||'', SZ, {bold:true})], indent:{ firstLine:708 }, spacing:{ after:20 } }),
    new Paragraph({ children:[r('Póliza: ', SZ, {bold:true}), r(c.tipo_poliza||'', SZ, {bold:true})], indent:{ firstLine:708 }, spacing:{ after:20 } }),
    new Paragraph({ children:[r('Riesgo: ', SZ, {bold:true}), r(c.causa||'', SZ, {bold:true})], indent:{ firstLine:708 }, spacing:{ after:20 } }),
    new Paragraph({ children:[r('Fecha: ', SZ, {bold:true}), r(c.fecha_siniestro||'', SZ, {bold:true})], indent:{ left:708 }, spacing:{ after:240 } }),
    new Paragraph({ children:[r(titulo, SZ, {bold:true})], alignment:CTR, spacing:{ before:200, after:200 } }),
    new Paragraph({ children:[r('Distinguidos Señores:', SZ)], spacing:{ after:120 } }),
  ];
}

function buildDataFields(c: CaseData): Paragraph[] {
  return ([
    ['COMPAÑÍA ASEGURADORA', c.aseguradora],
    ['FECHA ASIGNACIÓN', c.fecha_asignacion],
    ['FECHA INSPECCIÓN', c.fecha_inspeccion],
    ['OFICINA SEGURO', c.oficina_seguro||'Sucursal Santiago de los Caballeros'],
    ['ASEGURADO', c.asegurado],
    ['DIRECCIÓN', c.ubicacion_riesgo],
    ['ACTIVIDAD COMERCIAL', c.giro_negocio],
    ['VIGENCIA PÓLIZA', c.vigencia],
    ['INTERMEDIARIO', c.intermediario],
    ['PÓLIZA', c.tipo_poliza],
    ['RIESGO AFECTADO', c.causa],
  ] as [string, string|undefined][])
    .filter(([,v])=>v)
    .map(([l,v]) => new Paragraph({ children:[r(l,SZ,{bold:true}), r('\t',SZ), r(': '+(v||''),SZ)], spacing:{ before:40, after:40, ...LINE15 } }));
}

function buildAseguradoTable(c: CaseData): Table {
  const B = { top:{style:BorderStyle.SINGLE,size:1,color:'AAAAAA'}, bottom:{style:BorderStyle.SINGLE,size:1,color:'AAAAAA'}, left:{style:BorderStyle.SINGLE,size:1,color:'AAAAAA'}, right:{style:BorderStyle.SINGLE,size:1,color:'AAAAAA'}, insideH:{style:BorderStyle.SINGLE,size:1,color:'CCCCCC'}, insideV:{style:BorderStyle.SINGLE,size:1,color:'CCCCCC'} };
  const rows = ([
    ['Nombre Asegurado:', c.asegurado], ['RNC./Cédula:', c.asegurado_rnc],
    ['Actividad Negocio:', c.giro_negocio], ['Ubicación:', c.ubicacion_riesgo],
    c.receptor_inspeccion ? ['Receptor Inspección:', `${c.receptor_inspeccion}${c.receptor_cargo?' — '+c.receptor_cargo:''}`] : ['',''],
  ] as [string, string|undefined][]).filter(([,v])=>v) as [string,string][];
  return new Table({
    width:{size:TW,type:WidthType.DXA}, columnWidths:[2880,6480], borders:B,
    rows: rows.map(([l,v])=>new TableRow({ children:[
      new TableCell({ width:{size:2880,type:WidthType.DXA}, borders:CELL_NONE, shading:{fill:'EDF3FF',type:ShadingType.CLEAR}, margins:{top:60,bottom:60,left:100,right:100}, children:[new Paragraph({ children:[r(l,SZ,{bold:true})], spacing:{...LINE1} })] }),
      new TableCell({ width:{size:6480,type:WidthType.DXA}, borders:CELL_NONE, margins:{top:60,bottom:60,left:100,right:100}, children:[new Paragraph({ children:[r(v,SZ,{bold:true})], spacing:{...LINE1} })] }),
    ]})),
  });
}

// ─── INFORME PRELIMINAR ──────────────────────────────────────────────────────

function buildPreliminar(c: CaseData, content: string, sello?: Buffer): (Paragraph|Table)[] {
  return [
    ...buildLetterHead(c, 'INFORME PRELIMINAR'),
    new Paragraph({ children:[r('En atención a su solicitud, procedemos a remitir el presente ',SZ), r('Informe Preliminar',SZ,{bold:true,italics:true}), r(', correspondiente al asegurado de la referencia, a los fines de informarle sobre el estado actual de la reclamación.',SZ)], alignment:JUST, spacing:{before:80,after:240,...LINE15} }),
    ...buildDataFields(c), ...spacer(),
    new Paragraph({ children:[r('ASEGURADO:',SZ,{bold:true})], spacing:{before:160,after:60,...LINE15} }),
    buildAseguradoTable(c), ...spacer(),
    ...md(content), ...spacer(2),
    new Paragraph({ children:[r('Sin otro particular por el momento, quedamos de ustedes.',SZ)], alignment:JUST, spacing:{before:200,after:80,...LINE1} }),
    new Paragraph({ children:[r('Muy atentamente,',SZ)], spacing:{before:80,after:300,...LINE1} }),
    ...buildFirmaDual(sello),
  ];
}

// ─── INFORME FINAL ───────────────────────────────────────────────────────────

function buildFinal(c: CaseData, content: string, sello?: Buffer): (Paragraph|Table)[] {
  const anexos = c.anexos || '– Convenio de ajuste firmado\n– Cuadro de ajuste\n– Fotografías\n– Facturas / Cotizaciones\n– Secuencia de emails\n– Factura de Honorarios de Medina Tasadores, SRL.';
  return [
    ...buildLetterHead(c, 'INFORME FINAL'),
    new Paragraph({ children:[r('En atención a su solicitud, procedimos a investigar y ajustar el caso indicado en la referencia. Al concluir nuestras labores procedimos a remitir nuestro ',SZ), r('Informe Final',SZ,{bold:true}), r(', del presente caso.',SZ)], alignment:JUST, spacing:{before:80,after:240,...LINE15} }),
    ...buildDataFields(c), ...spacer(),
    new Paragraph({ children:[r('ASEGURADO:',SZ,{bold:true})], spacing:{before:160,after:60,...LINE15} }),
    buildAseguradoTable(c), ...spacer(),
    ...md(content), ...spacer(2),
    new Paragraph({ children:[r('Sin otro particular por el momento, quedamos de ustedes.',SZ)], alignment:JUST, spacing:{before:200,after:80,...LINE1} }),
    new Paragraph({ children:[r('Muy atentamente,',SZ)], spacing:{before:80,after:300,...LINE1} }),
    ...buildFirmaDual(sello), ...spacer(2),
    new Paragraph({ children:[r('ANEXOS:',SZ,{bold:true})], alignment:CTR, spacing:{before:120,after:80,...LINE1} }),
    ...anexos.split('\n').filter(Boolean).map(a => new Paragraph({ children:[r(a.replace(/^[–\-]\s*/,''),SZ)], numbering:{reference:'mt-bullets',level:0}, spacing:{before:40,after:40,...LINE1} })),
  ];
}

// ─── INFORME DE CIERRE ───────────────────────────────────────────────────────

function buildCierre(c: CaseData, content: string, sello?: Buffer): (Paragraph|Table)[] {
  const TAB2=[{type:'left' as const,position:2367}], TAB1=[{type:'left' as const,position:708}];
  const anexos = c.anexos || '– Secuencia de Email.\n– Fotografías.\n– Factura de Honorarios de Medina Tasadores, SRL.';
  return [
    new Paragraph({ children:[r('Santiago de los Caballeros, Rep. Dom.',SZ)], alignment:JUST, spacing:{before:80,after:40,...LINE1} }),
    new Paragraph({ children:[r(today(),SZ)], alignment:JUST, spacing:{after:200,...LINE1} }),
    new Paragraph({ children:[r('Señores:',SZ,{bold:true})], alignment:JUST, spacing:{after:40,...LINE1} }),
    new Paragraph({ children:[r(c.aseguradora||'',SZ,{bold:true})], alignment:JUST, spacing:{after:40,...LINE1} }),
    new Paragraph({ children:[r('Ciudad.',SZ,{bold:true})], alignment:JUST, spacing:{after:160,...LINE1} }),
    new Paragraph({ children:[r('\t',SZ,{bold:true}), r('Atención',SZ,{bold:true}), r('\t: ',SZ,{bold:true}), r(c.att_nombre||'',SZ)], tabStops:TAB2, alignment:JUST, spacing:{after:20,...LINE1} }),
    new Paragraph({ children:[r('\t  '+(c.att_cargo||''),SZ)], tabStops:TAB1, alignment:JUST, spacing:{after:40,...LINE1} }),
    new Paragraph({ children:[r('\t',SZ,{bold:true}), r('Reclamo No.',SZ,{bold:true}), r('\t: ',SZ,{bold:true}), r(c.reclamo||'',SZ,{bold:true})], tabStops:TAB2, alignment:JUST, spacing:{after:20,...LINE1} }),
    new Paragraph({ children:[r('\t',SZ,{bold:true}), r('Asegurado',SZ,{bold:true}), r('\t: ',SZ,{bold:true}), r(c.asegurado||'',SZ,{bold:true})], tabStops:TAB2, alignment:JUST, spacing:{after:20,...LINE1} }),
    new Paragraph({ children:[r('\t',SZ,{bold:true}), r('Póliza No.',SZ,{bold:true}), r('\t: ',SZ,{bold:true}), r(c.poliza_no||'',SZ,{bold:true})], tabStops:TAB2, alignment:JUST, spacing:{after:20,...LINE1} }),
    new Paragraph({ children:[r('Riesgo',SZ,{bold:true}), r('\t\t: ',SZ,{bold:true}), r(c.causa||'',SZ,{bold:true})], tabStops:TAB2, alignment:JUST, spacing:{after:20,...LINE1}, indent:{firstLine:708} }),
    new Paragraph({ children:[r('Fecha',SZ,{bold:true}), r('\t\t: ',SZ,{bold:true}), r(c.fecha_siniestro||'',SZ,{bold:true})], tabStops:TAB2, alignment:JUST, spacing:{after:200,...LINE1}, indent:{left:708} }),
    new Paragraph({ children:[r('Distinguidos señores:',SZ)], alignment:JUST, spacing:{after:80,...LINE1} }),
    new Paragraph({ children:[r('Luego de saludarle muy afectuosamente, al tiempo que aprovechamos la ocasión para informarle sobre el resultado de nuestras gestiones en la inspección del reclamo de referencia.',SZ)], alignment:JUST, spacing:{before:80,after:160,...LINE15} }),
    ...md(content),
    new Paragraph({ spacing:{before:120} }),
    new Paragraph({ children:[r('Por lo anteriormente expuesto, recomendamos a la Dirección de Reclamaciones proceder al cierre definitivo, del reclamo de referencia, sin pago alguno a los asegurados.',SZ)], alignment:JUST, spacing:{before:80,after:80,...LINE15} }),
    new Paragraph({ children:[r('Sin otro particular por el momento, quedamos de ustedes,',SZ)], alignment:JUST, spacing:{before:160,after:40,...LINE1} }),
    new Paragraph({ children:[r('Muy atentamente,',SZ)], alignment:JUST, spacing:{before:40,after:300,...LINE1} }),
    ...buildFirmaDual(sello),
    new Paragraph({ spacing:{before:240} }),
    new Paragraph({ children:[r('Anexos:',SZ,{bold:true})], spacing:{after:80,...LINE1} }),
    ...anexos.split('\n').filter(Boolean).map(a => new Paragraph({ children:[r(a.replace(/^[–\-]\s*/,''),SZ)], numbering:{reference:'mt-bullets',level:0}, spacing:{before:40,after:40,...LINE1} })),
  ];
}

// ─── CARTA DE DECLINACIÓN ────────────────────────────────────────────────────

function buildDeclinacion(c: CaseData, content: string, sello?: Buffer): (Paragraph|Table)[] {
  const children: (Paragraph|Table)[] = [
    new Paragraph({ children:[r('Santiago de los Caballeros, Rep. Dom.',SZ)], spacing:{before:80,after:40,...LINE1} }),
    new Paragraph({ children:[r(today(),SZ)], spacing:{after:200,...LINE1} }),
    new Paragraph({ children:[r('Señores',SZ)], spacing:{after:40,...LINE1} }),
    new Paragraph({ children:[r(c.asegurado||'',SZ,{bold:true})], spacing:{after:20,...LINE1} }),
  ];
  if (c.asegurado_rnc) children.push(new Paragraph({ children:[r(c.asegurado_rnc,SZ,{bold:true})], spacing:{after:20,...LINE1} }));
  children.push(
    new Paragraph({ children:[r('Ciudad.-',SZ)], spacing:{after:40,...LINE1} }),
    new Paragraph({ children:[r('Vía: ',SZ,{bold:true}), r(c.intermediario||'',SZ)], indent:{firstLine:708}, spacing:{after:80,...LINE1} }),
    new Paragraph({ children:[r('Ref.: ',SZ,{bold:true})], indent:{firstLine:708}, spacing:{after:40,...LINE1} }),
  );
  for (const [l,v] of [['Aseguradora',c.aseguradora],['Póliza',c.tipo_poliza],['Póliza No.',c.poliza_no],['Fecha de Siniestro',c.fecha_siniestro],['Reclamación Aseguradora',c.reclamo]] as [string,string|undefined][]) {
    if (!v) continue;
    children.push(new Paragraph({ children:[r('\t',SZ), r(`${l}\t\t: ${v}`,SZ)], indent:{firstLine:708}, spacing:{before:20,after:20,...LINE1} }));
  }
  children.push(
    new Paragraph({ spacing:{before:120} }),
    new Paragraph({ children:[r('Estimados señores:',SZ)], spacing:{before:80,after:120,...LINE1} }),
    ...md(content),
    new Paragraph({ children:[r('Mientras nos reiteramos a su disposición para las explicaciones que consideren de lugar, se suscriben de manera atenta,',SZ)], alignment:JUST, spacing:{before:200,after:280,...LINE15} }),
    ...buildFirmaSolo(sello),
    new Paragraph({ spacing:{before:200} }),
    new Paragraph({ children:[r('CC.: '+(c.aseguradora||''),SZ,{bold:true})], spacing:{after:20,...LINE1} }),
  );
  if (c.att_nombre) children.push(new Paragraph({ children:[r('Atención: '+c.att_nombre,SZ,{bold:true})], spacing:{...LINE1} }));
  return children;
}

// ─── CONVENIO DE AJUSTE ──────────────────────────────────────────────────────

function convCell(text: string, bold=false, w=2340, shade=false): TableCell {
  return new TableCell({ width:{size:w,type:WidthType.DXA}, shading:shade?{fill:'EDF3FF',type:ShadingType.CLEAR}:undefined, borders:CELL_NONE, margins:{top:60,bottom:60,left:100,right:100}, children:[new Paragraph({ children:[r(text||'',SZ,{bold})], spacing:{...LINE1} })] });
}

function buildConvenio(c: CaseData): (Paragraph|Table)[] {
  return [
    new Paragraph({ children:[r(`Reclamo ${c.reclamo||''}`,SZ,{bold:true})], spacing:{before:80,after:40,...LINE1} }),
    new Paragraph({ children:[r('CONVENIO DE AJUSTE',SZ,{bold:true})], alignment:CTR, spacing:{before:120,after:240,...LINE1} }),
    new Paragraph({
      children:[
        r('Entre quien suscribe, ',SZ), r(`SRES.  ${(c.asegurado||'').toUpperCase()}${c.asegurado_rnc?'  '+c.asegurado_rnc.toUpperCase():''}`,SZ,{bold:true}),
        r(',  Y  ',SZ), r('MEDINA TASADORES, SRL., RNC. 101-77092-9',SZ,{bold:true}),
        r(', quien afirmó ser representante de ',SZ), r((c.aseguradora||'').toUpperCase(),SZ,{bold:true}),
        r(', queda entendido y convenido que la suma total a indemnizar es de ',SZ), r(c.monto_indemnizar||'________________',SZ,{bold:true}),
        r(' por todos los daños físicos, morales, materiales y de toda índole sufridos en fecha ',SZ), r(c.fecha_siniestro||'__/__/____',SZ,{bold:true}),
        r(', a causa de la ocurrencia ',SZ), r(c.causa||'________________',SZ,{bold:true}),
        r(' riesgos asegurados bajo la(s) póliza(s) No. ',SZ), r(c.poliza_no||'________________',SZ,{bold:true}),
        r(' luego de considerar la aplicación de las condiciones generales y particulares acordadas con el asegurado, y vigentes al momento del siniestro.',SZ),
      ],
      alignment:JUST, spacing:{before:80,after:200,...LINE15},
    }),
    new Paragraph({ children:[r('La cifra a la cual ha arribado, es el resultado de la evaluación de los renglones que se muestran más abajo, cuyos valores fueron establecidos de mutuo acuerdo:',SZ)], alignment:JUST, spacing:{before:80,after:200,...LINE15} }),
    new Table({ width:{size:7200,type:WidthType.DXA}, columnWidths:[5040,2160], borders:TABLE_NONE, rows:[
      new TableRow({children:[convCell('Valor Ajustado:',true,5040), convCell(c.valor_ajustado||'______________',false,2160)]}),
      new TableRow({children:[convCell('',false,5040), convCell('',false,2160)]}),
      new TableRow({children:[convCell('Menos:',true,5040), convCell('',false,2160)]}),
      new TableRow({children:[convCell('  Infraseguro:',false,5040), convCell(c.infraseguro||'–',false,2160)]}),
      new TableRow({children:[convCell('  Deducible:',false,5040), convCell(c.deducible_monto||'______________',false,2160)]}),
      new TableRow({children:[convCell('  Salvamento:',false,5040), convCell(c.salvamento||'–',false,2160)]}),
      new TableRow({children:[convCell('Indemnizar:',true,5040), convCell(c.monto_indemnizar||'______________',true,2160,true)]}),
    ]}),
    ...spacer(2),
    new Paragraph({ children:[r('Es entendido que este convenio no representa una obligación de pago por parte de ',SZ), r((c.aseguradora||'').toUpperCase(),SZ,{bold:true}), r(', ya que se refiere únicamente a un acuerdo con relación a montos de pérdidas que deben ser revisados y aceptados por ellos como válidos y cuya indemnización pudiera estar afectada por condiciones o limitaciones no conocidas al momento de firmar el presente convenio.',SZ)], alignment:JUST, spacing:{before:80,after:200,...LINE15} }),
    new Paragraph({ children:[r(`En   SANTIAGO   a   los   ${c.dia_firma||'___'}   días   del   mes   de   ${c.mes_firma||'___________'}   del   año   ${c.anio_firma||'______'}.`,SZ)], spacing:{before:200,after:300,...LINE1} }),
    new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[4680,4680], borders:TABLE_NONE, rows:[new TableRow({children:[
      new TableCell({width:{size:4680,type:WidthType.DXA},borders:CELL_NONE,children:[
        new Paragraph({children:[r('______________________________',SZ)],spacing:{...LINE1}}),
        new Paragraph({children:[r('Asegurado',SZ)],spacing:{...LINE1}}),
        new Paragraph({children:[r('Cédula/RNC: ___________________',SZ)],spacing:{...LINE1}}),
        new Paragraph({children:[r('Fecha: ________________________',SZ)],spacing:{...LINE1}}),
      ]}),
      new TableCell({width:{size:4680,type:WidthType.DXA},borders:CELL_NONE,children:[
        new Paragraph({children:[r('EDDY S. MEDINA PUJOLS.',SZ,{bold:true})],alignment:AlignmentType.RIGHT,spacing:{...LINE1}}),
        new Paragraph({children:[r('Representante Aseguradora.',SZ)],alignment:AlignmentType.RIGHT,spacing:{...LINE1}}),
      ]}),
    ]})]})
  ];
}

// ─── FUNCIÓN PRINCIPAL ───────────────────────────────────────────────────────

export async function generateDocx(docType: DocType, caseData: CaseData, content: string): Promise<Buffer> {
  const logoData = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.jpg'));
  let sello: Buffer|undefined;
  if (caseData.withSeal) {
    const sp = path.join(process.cwd(), 'public', 'sello.png');
    if (fs.existsSync(sp)) sello = fs.readFileSync(sp);
  }

  let children: (Paragraph|Table)[];
  let margin: { top:number; right:number; bottom:number; left:number };
  let useHeader: boolean;

  if (docType === 'resumen_inspeccion') {
    children  = buildResumen(caseData, content, sello);
    margin    = { top:720, right:360, bottom:280, left:720 };  // exacto al modelo
    useHeader = false;
  } else {
    margin    = { top:1758, right:1418, bottom:1418, left:1418 };
    useHeader = true;
    switch (docType) {
      case 'informe_preliminar': children = buildPreliminar(caseData, content, sello); break;
      case 'informe_final':      children = buildFinal(caseData, content, sello); break;
      case 'informe_cierre':     children = buildCierre(caseData, content, sello); break;
      case 'carta_declinacion':  children = buildDeclinacion(caseData, content, sello); break;
      case 'convenio_ajuste':    children = buildConvenio(caseData); break;
      default: throw new Error(`Tipo no soportado: ${docType}`);
    }
  }

  const sz = docType === 'resumen_inspeccion' ? SZ_RES : SZ;
  const section: Record<string, unknown> = {
    properties: { page: { size:{ width:12240, height:15840 }, margin } },
    children,
  };
  if (useHeader) section.headers = { default: buildHeader(logoData) };

  return Packer.toBuffer(new Document({
    numbering: NUMBERING,
    styles: { default: { document: { run: { font:FONT, size:sz } } } },
    sections: [section as never],
  }));
}
