'use client';

/**
 * Componente: DownloadDocxButton
 * Archivo: src/components/DownloadDocxButton.tsx
 *
 * Muestra un botón de descarga Word + checkbox "Sello".
 *
 * ─── USO en src/app/dashboard/cases/[id]/page.tsx ───────────────────────────
 *
 * import DownloadDocxButton from '@/components/DownloadDocxButton';
 * import type { DocType } from '@/lib/docx-generator';
 *
 * const DOC_TYPE_MAP: Record<string, DocType> = {
 *   'Reporte de Inspección Siniestro': 'resumen_inspeccion',
 *   'Informe Preliminar':              'informe_preliminar',
 *   'Informe Final':                   'informe_final',
 *   'Informe de Cierre':               'informe_cierre',
 *   'Carta Declinación':               'carta_declinacion',
 *   'Convenio de Ajuste':              'convenio_ajuste',
 * };
 *
 * // Dentro del map de documentos generados:
 * const docType = DOC_TYPE_MAP[doc.doc_type];
 * if (docType) {
 *   return (
 *     <DownloadDocxButton
 *       key={doc.id}
 *       docType={docType}
 *       caseData={{
 *         asegurado:          caseObj.asegurado,
 *         aseguradora:        caseObj.aseguradora,
 *         reclamo:            caseObj.reclamo,
 *         poliza_no:          caseObj.poliza_no,
 *         tipo_poliza:        caseObj.tipo_poliza,
 *         fecha_siniestro:    caseObj.fecha_siniestro,
 *         fecha_asignacion:   caseObj.fecha_asignacion,
 *         fecha_inspeccion:   caseObj.fecha_inspeccion,
 *         vigencia:           caseObj.vigencia,
 *         causa:              caseObj.causa,
 *         suma_asegurada:     caseObj.suma_asegurada,
 *         deducible:          caseObj.deducible,
 *         intermediario:      caseObj.intermediario,
 *         att_nombre:         caseObj.att_nombre,
 *         att_cargo:          caseObj.att_cargo,
 *         ubicacion_riesgo:   caseObj.ubicacion_riesgo,
 *         giro_negocio:       caseObj.giro_negocio,
 *         receptor_inspeccion: caseObj.receptor_inspeccion,
 *         receptor_cargo:     caseObj.receptor_cargo,
 *         reserva:            caseObj.reserva,
 *       }}
 *       content={doc.content}
 *     />
 *   );
 * }
 */

import { useState } from 'react';
import type { CaseData, DocType } from '@/lib/docx-generator';

interface Props {
  docType: DocType;
  caseData: CaseData;
  content?: string;
  label?: string;
  className?: string;
}

const DOC_LABELS: Record<DocType, string> = {
  resumen_inspeccion: 'Reporte de Inspección',
  informe_preliminar: 'Informe Preliminar',
  informe_final:      'Informe Final',
  informe_cierre:     'Informe de Cierre',
  carta_declinacion:  'Carta de Declinación',
  convenio_ajuste:    'Convenio de Ajuste',
};

export default function DownloadDocxButton({ docType, caseData, content = '', label, className = '' }: Props) {
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [withSeal, setWithSeal] = useState(false);

  const download = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType, case_data: { ...caseData, withSeal }, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const disp     = res.headers.get('Content-Disposition') || '';
      const match    = disp.match(/filename="?([^"]+)"?/);
      const fileName = match ? match[1] : `${docType}.docx`;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al descargar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>

        {/* Botón principal */}
        <button
          onClick={download}
          disabled={loading}
          className={className}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px',
            backgroundColor: loading ? '#94a3b8' : '#1F3864',
            color: '#fff', border: 'none', borderRadius: '6px',
            fontSize: '13px', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="#fff" opacity=".85"/>
            <path d="M14 2v6h6" stroke="#fff" strokeWidth="1.5" fill="none"/>
            <path d="M9 13l1.5 4L12 14l1.5 3L15 13" stroke="#1F3864" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {loading ? 'Generando...' : `⬇ ${label || DOC_LABELS[docType]}`}
        </button>

        {/* Toggle sello */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={withSeal}
            onChange={e => setWithSeal(e.target.checked)}
            style={{ width: '14px', height: '14px', cursor: 'pointer' }}
          />
          Sello
        </label>
      </div>

      {error && <span style={{ fontSize: '11px', color: '#dc2626' }}>⚠ {error}</span>}
    </div>
  );
}
