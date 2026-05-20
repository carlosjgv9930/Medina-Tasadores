/**
 * API Route: POST /api/extract-poliza
 * Extrae datos de condiciones particulares de una póliza (PDF)
 * y devuelve los campos estructurados para auto-llenar el caso.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { fileBase64, fileType, fileName } = await request.json()

    if (!fileBase64) {
      return NextResponse.json({ error: 'No se recibió el archivo.' }, { status: 400 })
    }

    const isPdf = fileType === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf')

    if (!isPdf) {
      return NextResponse.json(
        { error: 'Solo se admiten archivos PDF para la extracción automática. Convierte el documento a PDF e intenta de nuevo.' },
        { status: 400 },
      )
    }

    const prompt = `Este documento es una póliza de seguro o sus condiciones particulares.
    
Extrae los siguientes datos y devuelve ÚNICAMENTE un JSON válido, sin texto adicional, sin bloques de código markdown, sin explicaciones:

{
  "vigencia": "fecha inicio y fin exactas tal como aparecen (ej: 01/01/2025 al 01/01/2026)",
  "suma_asegurada": "monto con moneda exacta (ej: DOP 1,500,000.00)",
  "deducible": "porcentaje o monto exacto (ej: 2% del siniestro mínimo DOP 15,000.00)",
  "tipo_poliza": "tipo de póliza (ej: Multirriesgo PYMES, Incendio y Líneas Aliadas, etc.)",
  "poliza_no": "número de póliza completo",
  "intermediario": "nombre del intermediario, agente o corredor",
  "asegurado": "nombre completo del asegurado",
  "asegurado_rnc": "RNC o cédula del asegurado con formato",
  "giro_negocio": "actividad comercial o giro del negocio del asegurado",
  "ubicacion_riesgo": "dirección completa del riesgo asegurado"
}

Si un campo no está disponible en el documento, usa null para ese campo.
No incluyas ningún texto fuera del JSON.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      console.error('[extract-poliza] Claude API error:', err)
      return NextResponse.json({ error: 'Error al procesar el documento con IA.' }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'

    // Extraer el JSON de la respuesta (por si Claude añade algo antes/después)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'No se pudo extraer datos del documento.' }, { status: 422 })
    }

    const extracted = JSON.parse(jsonMatch[0])
    return NextResponse.json(extracted)

  } catch (error) {
    console.error('[extract-poliza]', error)
    return NextResponse.json(
      { error: 'Error interno: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    )
  }
}
