/**
 * API Route: POST /api/generate-docx
 * Archivo: src/app/api/generate-docx/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateDocx, DocType, CaseData } from '@/lib/docx-generator';

const FILE_NAMES: Record<DocType, string> = {
  resumen_inspeccion: 'Reporte_Inspeccion',
  informe_preliminar: 'Informe_Preliminar',
  informe_final:      'Informe_Final',
  informe_cierre:     'Informe_de_Cierre',
  carta_declinacion:  'Carta_Declinacion',
  convenio_ajuste:    'Convenio_de_Ajuste',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { doc_type, case_data, content } = body as {
      doc_type: DocType;
      case_data: CaseData;
      content?: string;
    };

    if (!doc_type || !case_data) {
      return NextResponse.json({ error: 'doc_type y case_data son requeridos' }, { status: 400 });
    }

    const buffer = await generateDocx(doc_type, case_data, content || '');

    const reclamo   = (case_data.reclamo   || '').replace(/[^a-zA-Z0-9\-]/g, '_');
    const asegurado = (case_data.asegurado || '').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').slice(0, 30);
    const base      = FILE_NAMES[doc_type] || 'Documento';
    const fileName  = `${base}__Reclamo_No__${reclamo}__${asegurado}.docx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('[generate-docx]', error);
    return NextResponse.json(
      { error: 'Error generando documento: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
