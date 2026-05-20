'use client'
import { useState, useEffect, useCallback, use, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import {
  STATUSES, STATUS_MAP, ASEGURADORAS, TIPOS_POLIZA, EMPRESA,
  PIPELINE_MAIN_STEPS, TERMINAL_STATUSES, AJUSTE_STATUSES, FIELD_LABELS,
} from '@/lib/constants'
import StatusBadge from '@/components/StatusBadge'
import DownloadDocxButton from '@/components/DownloadDocxButton'
import type { DocType } from '@/lib/docx-generator'

// ─── TIPOS ───────────────────────────────────────────────────────────────────

const DOC_TYPE_MAP: Record<string, DocType> = {
  reporte_inspeccion:  'resumen_inspeccion',
  informe_preliminar:  'informe_preliminar',
  informe_final:       'informe_final',
  convenio_ajuste:     'convenio_ajuste',
  carta_declinacion:   'carta_declinacion',
  informe_cierre:      'informe_cierre',
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [c, setC]                       = useState<any>(null)
  const [profiles, setProfiles]         = useState<any[]>([])
  const [activity, setActivity]         = useState<any[]>([])
  const [profile, setProfile]           = useState<any>(null)
  const [loading, setLoading]           = useState(true)
  const [saveStatus, setSaveStatus]     = useState('saved')
  const [showStatusDD, setShowStatusDD] = useState(false)
  const [generating, setGenerating]     = useState(false)
  const [genResult, setGenResult]       = useState('')
  const [genTitle, setGenTitle]         = useState('')
  const [showGenModal, setShowGenModal] = useState(false)
  const [savedDocs, setSavedDocs]       = useState<any[]>([])
  // New state
  const [uploadingPoliza, setUploadingPoliza]   = useState(false)
  const [extractingPoliza, setExtractingPoliza] = useState(false)
  const [polizaMsg, setPolizaMsg]               = useState('')
  const [cuadroData, setCuadroData]             = useState<any[][]|null>(null)
  const [uploadingCuadro, setUploadingCuadro]   = useState(false)

  const polizaRef = useRef<HTMLInputElement>(null)
  const cuadroRef = useRef<HTMLInputElement>(null)
  const supabase  = createClient()
  const router    = useRouter()
  let saveTimer: any = null

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      const { data: allProfs } = await supabase.from('profiles').select('id, short_name, role')
      setProfiles(allProfs || [])
      const { data: caseData } = await supabase.from('cases').select('*').eq('id', id).single()
      if (!caseData) { router.push('/dashboard'); return }
      setC(caseData)
      if (caseData.cuadro_ajuste_json) {
        try { setCuadroData(JSON.parse(caseData.cuadro_ajuste_json)) } catch {}
      }
      const { data: acts } = await supabase.from('case_activity').select('*, profiles(short_name)').eq('case_id', id).order('created_at', { ascending: false }).limit(30)
      setActivity(acts || [])
      const { data: docs } = await supabase.from('generated_documents').select('*').eq('case_id', id).order('created_at', { ascending: false })
      setSavedDocs(docs || [])
      setLoading(false)
    }
    load()
  }, [id])

  // ─── updateField con historial de cambios ──────────────────────────────────

  const updateField = useCallback((field: string, value: string) => {
    setC((prev: any) => {
      const oldValue = prev?.[field] || ''
      clearTimeout(saveTimer)
      saveTimer = setTimeout(async () => {
        await supabase.from('cases').update({ [field]: value || null }).eq('id', id)
        // Registrar cambio en historial (solo si el valor cambió)
        if (oldValue !== value && profile?.id) {
          const label = FIELD_LABELS[field] || field
          await supabase.from('case_activity').insert({
            case_id: id, user_id: profile.id,
            action: 'Campo actualizado',
            details: `${label} → "${value || '—'}"`,
          })
          refreshActivity()
        }
        setSaveStatus('saved')
      }, 800)
      setSaveStatus('saving')
      return { ...prev, [field]: value }
    })
  }, [id, profile])

  async function setStatus(status: string) {
    setC((prev: any) => ({ ...prev, status }))
    setShowStatusDD(false)
    await supabase.from('cases').update({ status }).eq('id', id)
    await supabase.from('case_activity').insert({
      case_id: id, user_id: profile?.id,
      action: 'Estatus cambiado',
      details: `→ ${STATUS_MAP[status]?.label || status}`,
    })
    refreshActivity()
    setSaveStatus('saved')
  }

  async function refreshActivity() {
    const { data } = await supabase.from('case_activity').select('*, profiles(short_name)').eq('case_id', id).order('created_at', { ascending: false }).limit(30)
    setActivity(data || [])
  }

  // ─── Póliza: subir y extraer ───────────────────────────────────────────────

  async function handlePolizaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPoliza(true)
    setPolizaMsg('Registrando archivo...')

    try {
      // Guardar nombre del archivo en la base de datos (sin subir al Storage)
      await supabase.from('cases').update({ poliza_doc_name: file.name }).eq('id', id)
      setC((prev: any) => ({ ...prev, poliza_doc_name: file.name }))

      await supabase.from('case_activity').insert({ case_id: id, user_id: profile?.id, action: 'Condiciones particulares registradas', details: file.name })
      refreshActivity()

      // Auto-extraer datos si es PDF
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setUploadingPoliza(false)
        setExtractingPoliza(true)
        setPolizaMsg('Extrayendo datos con IA...')
        await extractPolizaData(file)
      } else {
        setPolizaMsg('✅ Archivo registrado (solo PDF permite extracción automática)')
      }
    } catch (err: any) {
      setPolizaMsg('⚠️ Error: ' + (err.message || 'No se pudo registrar el archivo'))
    }
    setUploadingPoliza(false)
    setExtractingPoliza(false)
  }

  async function extractPolizaData(file: File) {
    try {
      // Intentar convertir PDF a imágenes (funciona con PDFs escaneados)
      let requestBody: any
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        const numPages = Math.min(pdf.numPages, 4)
        const images: string[] = []
        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport }).promise
          images.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
        }
        requestBody = { images, fileType: 'image/jpeg', fileName: file.name }
      } catch {
        // Fallback: enviar como documento PDF (para PDFs con texto)
        const reader = new FileReader()
        const base64 = await new Promise<string>((res) => {
          reader.onload = (ev) => res((ev.target?.result as string).split(',')[1])
          reader.readAsDataURL(file)
        })
        requestBody = { fileBase64: base64, fileType: file.type, fileName: file.name }
      }

      const resp = await fetch('/api/extract-poliza', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await resp.json()
      if (!data.error) {
        const fieldMap: Record<string, string> = {
          vigencia: 'vigencia', suma_asegurada: 'suma_asegurada',
          deducible: 'deducible', giro_negocio: 'giro_negocio',
          ubicacion_riesgo: 'ubicacion_riesgo', intermediario: 'intermediario',
        }
        const updates: Record<string, string> = {}
        for (const [k, v] of Object.entries(fieldMap)) {
          if (data[k] && !c?.[v]) { updates[v] = data[k]; updateField(v, data[k]) }
        }
        const count = Object.keys(updates).length
        setPolizaMsg(count > 0 ? `✅ ${count} campos completados automáticamente` : '✅ Póliza procesada')
        if (count > 0) {
          await supabase.from('case_activity').insert({ case_id: id, user_id: profile?.id, action: 'Datos extraídos de póliza', details: `Campos: ${Object.keys(updates).join(', ')}` })
          refreshActivity()
        }
      } else {
        setPolizaMsg('⚠️ ' + data.error)
      }
    } catch {
      setPolizaMsg('⚠️ No se pudo extraer datos del archivo')
    }
  }

  // ─── Cuadro de Ajuste ──────────────────────────────────────────────────────

  async function handleCuadroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCuadro(true)

    try {
      let data: any[][] = []

      if (file.name.endsWith('.csv')) {
        const text = await file.text()
        data = text.split('\n').map(r => r.split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1')))
      } else {
        const XLSX = await import('xlsx')
        const ab = await file.arrayBuffer()
        const wb = XLSX.read(ab, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
      }

      const clean = data.filter(r => r.some(c => c !== '' && c != null))
      setCuadroData(clean)

      const jsonStr = JSON.stringify(clean)
      await supabase.from('cases').update({ cuadro_ajuste_json: jsonStr, cuadro_ajuste_nombre: file.name }).eq('id', id)
      setC((prev: any) => ({ ...prev, cuadro_ajuste_json: jsonStr, cuadro_ajuste_nombre: file.name }))

      await supabase.from('case_activity').insert({ case_id: id, user_id: profile?.id, action: 'Cuadro de ajuste cargado', details: file.name })
      refreshActivity()
    } catch (err: any) {
      alert('Error al procesar el archivo: ' + (err.message || 'Verifica que sea un archivo Excel o CSV válido.'))
    }
    setUploadingCuadro(false)
  }

  // ─── Generación de documentos ──────────────────────────────────────────────

  function buildContext() {
    if (!c || !profile) return ''
    const st = STATUS_MAP[c.status] || { label: c.status }
    const firma = profile.role === 'director'
      ? 'Solo: EDDY S. MEDINA PUJOLS / Medina Tasadores, SRL.'
      : 'Izquierda: EDDY S. MEDINA PUJOLS / Medina Tasadores, SRL.\nDerecha: CARLOS J. GONZÁLEZ. V / Ajustador Actuante'
    const firmaMail = profile.role === 'director'
      ? 'Eddy S. Medina Pujols | Director | Medina Tasadores, SRL.'
      : 'Carlos Junior González Ventura | Ajustador Ramos Técnicos | Medina Tasadores, SRL. | Cel.: 849-255-9276'
    const cuadroCtx = cuadroData
      ? `\nCUADRO DE AJUSTE (${c.cuadro_ajuste_nombre || 'Excel'}):\n${cuadroData.map(r => r.join('\t')).join('\n')}`
      : ''
    return [
      `CASO — MEDINA TASADORES, SRL.`,
      `Ajustador: ${profile.full_name} (${profile.role})`,
      `Firma en documentos: ${firma}`,
      `Firma en correos: ${firmaMail}`,
      `Reclamo No.: ${c.reclamo || '—'}`,
      `Asegurado: ${c.asegurado || '—'}`,
      `Aseguradora: ${c.aseguradora || '—'}`,
      `Tipo de Póliza: ${c.tipo_poliza || '—'}`,
      `Póliza No.: ${c.poliza_no || '—'}`,
      `Vigencia: ${c.vigencia || '—'}`,
      `Intermediario: ${c.intermediario || '—'}`,
      `Fecha Siniestro: ${c.fecha_siniestro || '—'}`,
      `Fecha Asignación: ${c.fecha_asignacion || '—'}`,
      `Suma Asegurada: ${c.suma_asegurada || '—'}`,
      `Deducible: ${c.deducible || '—'}`,
      `Causa: ${c.causa || '—'}`,
      `Reserva Estimada: ${c.reserva || '—'}`,
      `Ubicación del Riesgo: ${c.ubicacion_riesgo || '—'}`,
      `Giro del Negocio: ${c.giro_negocio || '—'}`,
      `Estatus: ${st.label}`,
      c.narrativa ? `\nNARRATIVA DEL SINIESTRO:\n${c.narrativa}` : '',
      c.notas ? `\nNOTAS INTERNAS:\n${c.notas}` : '',
      cuadroCtx,
    ].filter(Boolean).join('\n')
  }

  async function generateDocument(title: string, action: string, docType: string, requiresNarr = false) {
    if (requiresNarr && (!c.narrativa || c.narrativa.trim().length < 20)) {
      alert('Completa la Narrativa del Siniestro antes de generar este documento.')
      document.getElementById('narrativa-field')?.focus()
      return
    }
    setGenTitle(title); setGenResult(''); setShowGenModal(true); setGenerating(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: buildContext(), action, docType }),
      })
      const data = await res.json()
      if (data.error) { setGenResult(`Error: ${data.error}`) } else {
        setGenResult(data.content)
        await supabase.from('generated_documents').insert({ case_id: id, created_by: profile?.id, doc_type: docType, title, content: data.content })
        await supabase.from('case_activity').insert({ case_id: id, user_id: profile?.id, action: 'Documento generado', details: title })
        refreshActivity()
        const { data: docs } = await supabase.from('generated_documents').select('*').eq('case_id', id).order('created_at', { ascending: false })
        setSavedDocs(docs || [])
      }
    } catch (e: any) { setGenResult(`Error de conexión: ${e.message}`) }
    setGenerating(false)
  }

  function viewDoc(doc: any) { setGenTitle(doc.title); setGenResult(doc.content); setShowGenModal(true) }

  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = document.createElement('textarea'); ta.value = text
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setSaveStatus('📋 Copiado')
    setTimeout(() => setSaveStatus('saved'), 2000)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'#94a3b8', fontSize:'14px' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'32px', marginBottom:'12px' }}>⏳</div>
        Cargando caso...
      </div>
    </div>
  )
  if (!c) return null

  const st      = STATUS_MAP[c.status] || { label: c.status, color: '#64748b' }
  const hasNarr = c.narrativa && c.narrativa.trim().length >= 20
  const isAjuste = AJUSTE_STATUSES.includes(c.status)
  const isTerminal = TERMINAL_STATUSES.includes(c.status)

  // Pipeline checklist index
  const pipelineIdx = PIPELINE_MAIN_STEPS.indexOf(c.status as any)

  // Styles
  const inp  = { width:'100%', padding:'5px 8px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', color:'#0f172a', outline:'none', backgroundColor:'white', boxSizing:'border-box' as const, marginBottom:'6px' }
  const inpF = { ...inp, borderColor:'#86efac', backgroundColor:'#f0fdf4' }
  const lbl  = { display:'block' as const, fontSize:'9px', fontWeight:700 as const, color:'#94a3b8', textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'3px', marginTop:'10px' }

  const docActions = [
    { title:'Email: Coordinar Inspección', action:'Genera el email completo de COORDINAR INSPECCIÓN para el intermediario. Incluye asunto en mayúsculas y cuerpo completo con firma.', type:'email_coordinar', req:false },
    { title:'Reporte de Inspección',       action:'Genera el REPORTE DE INSPECCIÓN SINIESTRO completo de 1 página con todos los datos disponibles del caso.',                        type:'reporte_inspeccion', req:true },
    { title:'Informe Preliminar',          action:'Genera el INFORME PRELIMINAR completo con todas las secciones.',                                                                  type:'informe_preliminar', req:true },
    { title:'Informe Final',               action:'Genera el INFORME FINAL completo con todas las secciones incluyendo Relación de Pérdida, Ajuste e Indemnización.',               type:'informe_final', req:true },
    { title:'Convenio de Ajuste',          action:'Genera el CONVENIO DE AJUSTE según el formato de la aseguradora del caso. Si es Mapfre, indica que Mapfre emite su propio convenio.', type:'convenio_ajuste', req:true },
    { title:'Solicitud de Documentos',     action:'Genera el email de SOLICITUD DE DOCUMENTOS con los documentos estándar.',                                                         type:'email_solicitud_docs', req:false },
    { title:'Email: Docs Pendientes',      action:'Genera el email de DOCUMENTOS PENDIENTES.',                                                                                       type:'email_docs_pendientes', req:false },
    { title:'Email: Recordatorio',         action:'Genera el email de AVISO RECORDATORIO.',                                                                                          type:'email_recordatorio', req:false },
    { title:'Email: Plazo 10 Días',        action:'Genera el email de PLAZO PARA REMITIR DOCUMENTOS (10 días laborables).',                                                          type:'email_plazo', req:false },
    { title:'Email: Docs Completos',       action:'Genera el email de RECEPCIÓN DE DOCUMENTACIÓN COMPLETA.',                                                                         type:'email_docs_completos', req:false },
    { title:'Email: Enviar Convenio',      action:'Genera el email de envío del CONVENIO DE AJUSTE al intermediario.',                                                               type:'email_convenio', req:false },
    { title:'Email: Informe Final',        action:'Genera el email de envío del INFORME FINAL con todos los anexos.',                                                               type:'email_informe_final', req:false },
    { title:'Carta Declinación',           action:'Genera la CARTA DE DECLINACIÓN al asegurado vía intermediario.',                                                                  type:'carta_declinacion', req:true },
    { title:'Informe de Cierre',           action:'Genera el INFORME DE CIERRE a la aseguradora.',                                                                                   type:'informe_cierre', req:true },
    { title:'Descargo Legal RC',           action:'Genera el DESCARGO LEGAL (Liberación y Descargo) para el reclamante en caso de RC.',                                              type:'descargo_legal', req:true },
    { title:'Resumen del Caso',            action:'Dame un resumen completo del estado actual del caso, datos disponibles y pasos pendientes.',                                       type:'email_resumen', req:false },
  ]

  const caseDataForDocx = {
    asegurado: c.asegurado, aseguradora: c.aseguradora, reclamo: c.reclamo,
    poliza_no: c.poliza_no, tipo_poliza: c.tipo_poliza, fecha_siniestro: c.fecha_siniestro,
    fecha_asignacion: c.fecha_asignacion, fecha_inspeccion: c.fecha_inspeccion,
    vigencia: c.vigencia, causa: c.causa, suma_asegurada: c.suma_asegurada,
    deducible: c.deducible, intermediario: c.intermediario, att_nombre: c.att_nombre,
    att_cargo: c.att_cargo, ubicacion_riesgo: c.ubicacion_riesgo, giro_negocio: c.giro_negocio,
    receptor_inspeccion: c.receptor_inspeccion, receptor_cargo: c.receptor_cargo, reserva: c.reserva,
  }

  return (
    <>
    <div style={{ display:'flex', height:'calc(100vh - 60px)', backgroundColor:'#f8fafc' }}>

      {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
      <div style={{ width:'270px', backgroundColor:'white', borderRight:'1px solid #e2e8f0', overflowY:'auto', flexShrink:0, display:'flex', flexDirection:'column' }}>

        {/* Case header */}
        <div style={{ padding:'16px', background:'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)', color:'white' }}>
          <div style={{ fontSize:'10px', opacity:0.7, marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.08em' }}>
            {c.reclamo ? `Reclamo ${c.reclamo}` : 'Sin número'}
          </div>
          <div style={{ fontSize:'14px', fontWeight:700, lineHeight:1.3, marginBottom:'8px' }}>{c.asegurado || '—'}</div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:'6px', backgroundColor:'rgba(255,255,255,0.15)', borderRadius:'20px', padding:'3px 10px', fontSize:'11px', fontWeight:600 }}>
            <span style={{ width:'6px', height:'6px', borderRadius:'50%', backgroundColor:'white', display:'inline-block' }} />
            {st.label}
          </div>
        </div>

        {/* Save indicator */}
        <div style={{ padding:'6px 16px', borderBottom:'1px solid #f1f5f9', fontSize:'10px', color: saveStatus==='saved'?'#16a34a' : saveStatus==='saving'?'#d97706' : '#2563eb' }}>
          {saveStatus==='saved' ? '✓ Guardado' : saveStatus==='saving' ? '⏳ Guardando...' : saveStatus}
        </div>

        {/* Fields */}
        <div style={{ padding:'12px 14px', flex:1 }}>

          <label style={lbl}>Reclamo No.</label>
          <input style={c.reclamo ? inpF : inp} value={c.reclamo||''} onChange={e=>updateField('reclamo',e.target.value)} />
          <label style={lbl}>Asegurado</label>
          <input style={c.asegurado ? inpF : inp} value={c.asegurado||''} onChange={e=>updateField('asegurado',e.target.value)} />
          <label style={lbl}>Aseguradora</label>
          <select style={c.aseguradora ? inpF : inp} value={c.aseguradora||''} onChange={e=>updateField('aseguradora',e.target.value)}>
            <option value="">—</option>{ASEGURADORAS.map(a=><option key={a}>{a}</option>)}
          </select>
          <label style={lbl}>Tipo de Póliza</label>
          <select style={c.tipo_poliza ? inpF : inp} value={c.tipo_poliza||''} onChange={e=>updateField('tipo_poliza',e.target.value)}>
            <option value="">—</option>{TIPOS_POLIZA.map(t=><option key={t}>{t}</option>)}
          </select>
          <label style={lbl}>Póliza No.</label>
          <input style={c.poliza_no ? inpF : inp} value={c.poliza_no||''} onChange={e=>updateField('poliza_no',e.target.value)} />
          <label style={lbl}>Vigencia</label>
          <input style={c.vigencia ? inpF : inp} value={c.vigencia||''} onChange={e=>updateField('vigencia',e.target.value)} placeholder="01/01/2025 – 01/01/2026" />
          <label style={lbl}>Intermediario</label>
          <input style={c.intermediario ? inpF : inp} value={c.intermediario||''} onChange={e=>updateField('intermediario',e.target.value)} />
          <label style={lbl}>Fecha Siniestro</label>
          <input type="date" style={c.fecha_siniestro ? inpF : inp} value={c.fecha_siniestro||''} onChange={e=>updateField('fecha_siniestro',e.target.value)} />
          <label style={lbl}>Fecha Asignación</label>
          <input type="date" style={c.fecha_asignacion ? inpF : inp} value={c.fecha_asignacion||''} onChange={e=>updateField('fecha_asignacion',e.target.value)} />
          <label style={lbl}>Fecha Inspección</label>
          <input type="date" style={c.fecha_inspeccion ? inpF : inp} value={c.fecha_inspeccion||''} onChange={e=>updateField('fecha_inspeccion',e.target.value)} />
          <label style={lbl}>Suma Asegurada</label>
          <input style={c.suma_asegurada ? inpF : inp} value={c.suma_asegurada||''} onChange={e=>updateField('suma_asegurada',e.target.value)} placeholder="DOP..." />
          <label style={lbl}>Deducible</label>
          <input style={c.deducible ? inpF : inp} value={c.deducible||''} onChange={e=>updateField('deducible',e.target.value)} placeholder="%" />
          <label style={lbl}>Causa</label>
          <input style={c.causa ? inpF : inp} value={c.causa||''} onChange={e=>updateField('causa',e.target.value)} />
          <label style={lbl}>Reserva Estimada</label>
          <input style={c.reserva ? inpF : inp} value={c.reserva||''} onChange={e=>updateField('reserva',e.target.value)} placeholder="DOP..." />
          <label style={lbl}>Ubicación Riesgo</label>
          <input style={c.ubicacion_riesgo ? inpF : inp} value={c.ubicacion_riesgo||''} onChange={e=>updateField('ubicacion_riesgo',e.target.value)} />
          <label style={lbl}>Giro del Negocio</label>
          <input style={c.giro_negocio ? inpF : inp} value={c.giro_negocio||''} onChange={e=>updateField('giro_negocio',e.target.value)} />
          <label style={lbl}>Receptor Inspección</label>
          <input style={c.receptor_inspeccion ? inpF : inp} value={c.receptor_inspeccion||''} onChange={e=>updateField('receptor_inspeccion',e.target.value)} />
          <label style={lbl}>Cargo Receptor</label>
          <input style={c.receptor_cargo ? inpF : inp} value={c.receptor_cargo||''} onChange={e=>updateField('receptor_cargo',e.target.value)} />

          <label style={lbl}>Asignado a</label>
          <select style={inp} value={c.assigned_to||''} onChange={e=>updateField('assigned_to',e.target.value)}>
            <option value="">Sin asignar</option>
            {profiles.map(p=><option key={p.id} value={p.id}>{p.short_name} ({p.role})</option>)}
          </select>

          <label style={lbl}>Notas Internas</label>
          <textarea style={{...inp, resize:'vertical'}} rows={3} value={c.notas||''} onChange={e=>updateField('notas',e.target.value)} />

          {/* ── PIPELINE CHECKLIST ── */}
          <div style={{ marginTop:'16px', paddingTop:'14px', borderTop:'1px solid #f1f5f9' }}>
            <div style={{ fontSize:'9px', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'12px' }}>
              Progreso del Caso
            </div>
            <div style={{ position:'relative' }}>
              {/* vertical line */}
              <div style={{ position:'absolute', left:'8px', top:'4px', bottom:'4px', width:'1px', backgroundColor:'#e2e8f0' }} />

              {PIPELINE_MAIN_STEPS.map((key, idx) => {
                const step = STATUS_MAP[key]
                if (!step) return null
                const effectiveIdx = isTerminal ? -1 : pipelineIdx
                const isDone    = idx < effectiveIdx || (key === 'cerrado' && c.status === 'cerrado')
                const isCurrent = idx === effectiveIdx && !isTerminal && key !== 'cerrado'
                return (
                  <div key={key} onClick={() => setStatus(key)}
                    style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'7px', position:'relative', zIndex:1, cursor:'pointer' }}
                    title={`Cambiar a: ${step.label}`}
                  >
                    <div style={{ width:'17px', height:'17px', borderRadius:'50%', border:'2px solid', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s',
                      borderColor: isDone ? '#16a34a' : isCurrent ? step.color : '#e2e8f0',
                      backgroundColor: isDone ? '#16a34a' : isCurrent ? step.color : 'white',
                    }}>
                      {isDone  && <span style={{ color:'white', fontSize:'8px', fontWeight:900 }}>✓</span>}
                      {isCurrent && <span style={{ width:'5px', height:'5px', borderRadius:'50%', backgroundColor:'white', display:'block' }} />}
                    </div>
                    <span style={{ fontSize:'10px', lineHeight:1.3, transition:'color 0.2s',
                      color: isDone ? '#94a3b8' : isCurrent ? '#0f172a' : '#94a3b8',
                      fontWeight: isCurrent ? 700 : 400,
                      textDecoration: isDone ? 'line-through' : 'none',
                    }}>
                      {step.label}
                    </span>
                  </div>
                )
              })}

              {/* Terminal statuses */}
              <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:'1px dashed #fecaca' }}>
                <div style={{ fontSize:'9px', color:'#fca5a5', fontWeight:600, marginBottom:'6px' }}>Cierre sin pago</div>
                {TERMINAL_STATUSES.map(key => {
                  const step = STATUS_MAP[key]
                  const isActive = c.status === key
                  return (
                    <div key={key} onClick={() => setStatus(key)}
                      style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px', cursor:'pointer' }}>
                      <div style={{ width:'17px', height:'17px', borderRadius:'4px', border:'2px solid', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                        borderColor: isActive ? '#ef4444' : '#fecaca',
                        backgroundColor: isActive ? '#ef4444' : 'white',
                      }}>
                        {isActive && <span style={{ color:'white', fontSize:'8px', fontWeight:900 }}>✓</span>}
                      </div>
                      <span style={{ fontSize:'10px', color: isActive ? '#ef4444' : '#fca5a5', fontWeight: isActive ? 700 : 400 }}>
                        {step?.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
        <div style={{ maxWidth:'840px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Top bar */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <h1 style={{ fontSize:'17px', fontWeight:700, color:'#0f172a', margin:0 }}>
                {c.reclamo ? `Reclamo ${c.reclamo}` : 'Nuevo Caso'} — <span style={{ color:'#2563eb' }}>{c.asegurado}</span>
              </h1>
              <p style={{ fontSize:'11px', color:'#94a3b8', margin:'2px 0 0' }}>{[c.aseguradora, c.tipo_poliza].filter(Boolean).join(' · ')}</p>
            </div>
            {/* Status dropdown */}
            <div style={{ position:'relative' }}>
              <button onClick={() => setShowStatusDD(!showStatusDD)}
                style={{ padding:'6px 14px', borderRadius:'20px', color:'white', fontSize:'12px', fontWeight:700, border:'none', cursor:'pointer', backgroundColor:st.color, display:'flex', alignItems:'center', gap:'4px' }}>
                {st.label} ▾
              </button>
              {showStatusDD && (
                <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', backgroundColor:'white', borderRadius:'10px', boxShadow:'0 10px 40px rgba(0,0,0,0.12)', border:'1px solid #e2e8f0', padding:'6px', zIndex:50, width:'220px', maxHeight:'320px', overflowY:'auto' }}>
                  {STATUSES.map(s => (
                    <div key={s.key} onClick={() => setStatus(s.key)}
                      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'12px', color:'#374151', backgroundColor: c.status===s.key ? '#eff6ff' : 'transparent' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'50%', backgroundColor:s.color, flexShrink:0 }} />
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* NARRATIVA */}
          <div style={{ backgroundColor:'white', borderRadius:'12px', border:`2px solid ${hasNarr ? '#86efac' : '#fde68a'}`, padding:'20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
              <h2 style={{ fontSize:'13px', fontWeight:700, color:'#0f172a', margin:0 }}>📝 Narrativa del Siniestro <span style={{ color:'#ef4444' }}>*</span></h2>
              <span style={{ fontSize:'10px', fontWeight:700, padding:'3px 10px', borderRadius:'20px', backgroundColor: hasNarr?'#dcfce7':'#fef3c7', color: hasNarr?'#16a34a':'#d97706' }}>
                {hasNarr ? '✓ Lista' : '⚠ Requerida'}
              </span>
            </div>
            <p style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'10px', margin:'0 0 10px' }}>Describe qué pasó, quién recibió, qué narró el asegurado, bienes afectados.</p>
            <textarea id="narrativa-field"
              style={{ width:'100%', padding:'10px 12px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'12px', lineHeight:1.6, resize:'vertical', outline:'none', fontFamily:'inherit', boxSizing:'border-box', backgroundColor: hasNarr?'#f0fdf4':'white' }}
              rows={5} value={c.narrativa||''} onChange={e=>updateField('narrativa',e.target.value)}
              placeholder="El día ___, tras el apoderamiento, procedimos a coordinar con el intermediario..." />
            <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'4px', display:'flex', justifyContent:'space-between' }}>
              <span>{(c.narrativa||'').length} caracteres</span><span>Mínimo: 150</span>
            </div>
          </div>

          {/* CONDICIONES PARTICULARES */}
          <div style={{ backgroundColor:'white', borderRadius:'12px', border:'1px solid #e2e8f0', padding:'20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
              <h2 style={{ fontSize:'13px', fontWeight:700, color:'#0f172a', margin:0 }}>📄 Condiciones Particulares</h2>
              <span style={{ fontSize:'10px', fontWeight:700, padding:'3px 10px', borderRadius:'20px',
                backgroundColor: c.poliza_doc_name ? '#dcfce7' : '#fef3c7',
                color: c.poliza_doc_name ? '#16a34a' : '#d97706' }}>
                {c.poliza_doc_name ? '✓ Cargada' : '⚠ Pendiente'}
              </span>
            </div>

            {c.poliza_doc_name ? (
              <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px', backgroundColor:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                <span style={{ fontSize:'24px' }}>📄</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'12px', fontWeight:600, color:'#0f172a' }}>{c.poliza_doc_name}</div>
                  {polizaMsg && <div style={{ fontSize:'11px', color:'#64748b', marginTop:'2px' }}>{polizaMsg}</div>}
                </div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <label style={{ padding:'5px 12px', backgroundColor:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'6px', fontSize:'11px', fontWeight:600, color:'#2563eb', cursor:'pointer' }}>
                    {extractingPoliza ? '⏳ Extrayendo...' : '🔄 Re-extraer datos'}
                    <input ref={polizaRef} type="file" accept=".pdf,.doc,.docx" onChange={handlePolizaUpload} hidden />
                  </label>
                </div>
              </div>
            ) : (
              <div style={{ textAlign:'center', padding:'20px', backgroundColor:'#f8fafc', borderRadius:'8px', border:'1px dashed #cbd5e1' }}>
                <div style={{ fontSize:'28px', marginBottom:'8px' }}>📎</div>
                <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'14px', margin:'0 0 14px' }}>
                  Sube las condiciones particulares para completar datos automáticamente.
                </p>
                <label style={{ padding:'8px 16px', backgroundColor:'white', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'12px', fontWeight:600, color:'#475569', cursor:'pointer', display:'inline-block' }}>
                  {uploadingPoliza || extractingPoliza ? '⏳ Procesando...' : '📎 Subir PDF o Word'}
                  <input ref={polizaRef} type="file" accept=".pdf,.doc,.docx" onChange={handlePolizaUpload} hidden />
                </label>
                {polizaMsg && <p style={{ fontSize:'11px', color:'#64748b', marginTop:'8px' }}>{polizaMsg}</p>}
              </div>
            )}
          </div>

          {/* CUADRO DE AJUSTE (solo visible en etapa de ajuste+) */}
          {isAjuste && (
            <div style={{ backgroundColor:'white', borderRadius:'12px', border:'1px solid #e2e8f0', padding:'20px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
                <h2 style={{ fontSize:'13px', fontWeight:700, color:'#0f172a', margin:0 }}>📊 Cuadro de Ajuste</h2>
                {c.cuadro_ajuste_nombre && (
                  <span style={{ fontSize:'10px', color:'#64748b' }}>{c.cuadro_ajuste_nombre}</span>
                )}
              </div>

              {cuadroData && cuadroData.length > 0 ? (
                <div>
                  <div style={{ overflowX:'auto', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                      <thead>
                        <tr style={{ backgroundColor:'#1e3a8a' }}>
                          {cuadroData[0].map((h: any, i: number) => (
                            <th key={i} style={{ padding:'8px 12px', color:'white', textAlign:'left', fontWeight:600, whiteSpace:'nowrap' }}>
                              {String(h || '').slice(0, 30)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cuadroData.slice(1).map((row: any[], ri: number) => (
                          <tr key={ri} style={{ backgroundColor: ri%2===0 ? 'white' : '#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                            {row.map((cell: any, ci: number) => (
                              <td key={ci} style={{ padding:'7px 12px', color:'#374151', whiteSpace:'nowrap' }}>
                                {String(cell ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label style={{ marginTop:'10px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'6px 12px', backgroundColor:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', fontWeight:600, color:'#64748b', cursor:'pointer' }}>
                    🔄 Reemplazar
                    <input ref={cuadroRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleCuadroUpload} hidden />
                  </label>
                </div>
              ) : (
                <div style={{ textAlign:'center', padding:'20px', backgroundColor:'#f8fafc', borderRadius:'8px', border:'1px dashed #cbd5e1' }}>
                  <div style={{ fontSize:'28px', marginBottom:'8px' }}>📊</div>
                  <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'14px', margin:'0 0 14px' }}>
                    Sube el cuadro de ajuste en Excel o CSV para visualizarlo aquí.
                  </p>
                  <label style={{ padding:'8px 16px', backgroundColor:'white', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'12px', fontWeight:600, color:'#475569', cursor:'pointer', display:'inline-block' }}>
                    {uploadingCuadro ? '⏳ Procesando...' : '📊 Subir Excel / CSV'}
                    <input ref={cuadroRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleCuadroUpload} hidden />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* GENERACIÓN DE DOCUMENTOS */}
          <div style={{ backgroundColor:'white', borderRadius:'12px', border:'1px solid #e2e8f0', padding:'20px' }}>
            <h2 style={{ fontSize:'13px', fontWeight:700, color:'#0f172a', marginBottom:'14px', margin:'0 0 14px' }}>📄 Generar Documentos e Informes</h2>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              {docActions.map((d, i) => (
                <button key={i} onClick={() => generateDocument(d.title, d.action, d.type, d.req)}
                  disabled={generating || (d.req && !hasNarr)}
                  style={{ padding:'9px 12px', backgroundColor:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'8px', textAlign:'left', fontSize:'11px', color:'#374151', cursor: generating || (d.req && !hasNarr) ? 'not-allowed' : 'pointer', opacity: (d.req && !hasNarr) ? 0.5 : 1, transition:'all 0.15s', fontFamily:'inherit' }}
                  onMouseEnter={e => { if (!generating && !(d.req && !hasNarr)) { (e.currentTarget.style.backgroundColor='#eff6ff'); (e.currentTarget.style.borderColor='#93c5fd'); (e.currentTarget.style.color='#1d4ed8') } }}
                  onMouseLeave={e => { (e.currentTarget.style.backgroundColor='#f8fafc'); (e.currentTarget.style.borderColor='#e2e8f0'); (e.currentTarget.style.color='#374151') }}
                >
                  {d.title}
                </button>
              ))}
            </div>
            {generating && (
              <div style={{ marginTop:'12px', fontSize:'12px', color:'#d97706', fontWeight:600 }}>
                ⏳ Generando documento... 15-30 segundos
              </div>
            )}
          </div>

          {/* DOCUMENTOS GENERADOS */}
          {savedDocs.length > 0 && (
            <div style={{ backgroundColor:'white', borderRadius:'12px', border:'1px solid #e2e8f0', padding:'20px' }}>
              <h2 style={{ fontSize:'13px', fontWeight:700, color:'#0f172a', marginBottom:'14px', margin:'0 0 14px' }}>
                📂 Documentos Generados ({savedDocs.length})
              </h2>
              {savedDocs.map((d: any) => (
                <div key={d.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px', borderBottom:'1px solid #f1f5f9', borderRadius:'6px' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor='#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor='transparent'}>
                  <div style={{ flex:1, cursor:'pointer' }} onClick={() => viewDoc(d)}>
                    <div style={{ fontSize:'12px', fontWeight:600, color:'#0f172a' }}>{d.title}</div>
                    <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'1px' }}>
                      {new Date(d.created_at).toLocaleString('es-DO', { dateStyle:'short', timeStyle:'short' })} · {d.status}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                    <button onClick={() => copyText(d.content)}
                      style={{ padding:'4px 10px', fontSize:'10px', color:'#2563eb', backgroundColor:'#eff6ff', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:600 }}>
                      📋 Copiar
                    </button>
                    {DOC_TYPE_MAP[d.doc_type] && (
                      <DownloadDocxButton docType={DOC_TYPE_MAP[d.doc_type]} caseData={caseDataForDocx} content={d.content} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* HISTORIAL */}
          <div style={{ backgroundColor:'white', borderRadius:'12px', border:'1px solid #e2e8f0', padding:'20px' }}>
            <h2 style={{ fontSize:'13px', fontWeight:700, color:'#0f172a', marginBottom:'14px', margin:'0 0 14px' }}>📜 Historial de Actividad</h2>
            {activity.length === 0 ? (
              <p style={{ fontSize:'12px', color:'#94a3b8' }}>Sin actividad registrada.</p>
            ) : activity.map((a: any) => (
              <div key={a.id} style={{ display:'flex', gap:'10px', marginBottom:'10px', paddingBottom:'10px', borderBottom:'1px solid #f8fafc' }}>
                <div style={{ width:'6px', height:'6px', borderRadius:'50%', backgroundColor:'#93c5fd', marginTop:'5px', flexShrink:0 }} />
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                    <span style={{ fontSize:'11px', fontWeight:700, color:'#374151' }}>{a.action}</span>
                    {a.details && <span style={{ fontSize:'11px', color:'#64748b' }}>— {a.details}</span>}
                  </div>
                  <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'2px' }}>
                    {a.profiles?.short_name || '—'} · {new Date(a.created_at).toLocaleString('es-DO', { dateStyle:'short', timeStyle:'short' })}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>

    {/* ── MODAL ─────────────────────────────────────────────────────────── */}
    {showGenModal && (
      <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:'24px' }}>
        <div style={{ backgroundColor:'white', borderRadius:'16px', maxWidth:'760px', width:'100%', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 25px 60px rgba(0,0,0,0.25)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 22px', borderBottom:'1px solid #f1f5f9' }}>
            <h3 style={{ fontSize:'15px', fontWeight:700, color:'#0f172a', margin:0 }}>{genTitle}</h3>
            <button onClick={() => setShowGenModal(false)} style={{ fontSize:'18px', color:'#94a3b8', background:'none', border:'none', cursor:'pointer', lineHeight:1 }}>✕</button>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'22px' }}>
            {generating ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 0' }}>
                <div style={{ width:'40px', height:'40px', border:'3px solid #e2e8f0', borderTopColor:'#2563eb', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                <p style={{ fontSize:'13px', color:'#64748b', marginTop:'16px', fontWeight:600 }}>Generando documento...</p>
                <p style={{ fontSize:'12px', color:'#94a3b8', marginTop:'4px' }}>15-30 segundos</p>
              </div>
            ) : (
              <pre style={{ whiteSpace:'pre-wrap', fontSize:'13px', color:'#374151', lineHeight:1.7, fontFamily:'inherit', margin:0 }}>{genResult}</pre>
            )}
          </div>
          {!generating && genResult && (
            <div style={{ display:'flex', gap:'10px', padding:'18px 22px', borderTop:'1px solid #f1f5f9' }}>
              <button onClick={() => copyText(genResult)}
                style={{ padding:'9px 20px', backgroundColor:'#1e3a8a', color:'white', borderRadius:'8px', fontSize:'13px', fontWeight:700, border:'none', cursor:'pointer' }}>
                📋 Copiar al Portapapeles
              </button>
              <button onClick={() => setShowGenModal(false)}
                style={{ padding:'9px 20px', backgroundColor:'#f1f5f9', color:'#64748b', borderRadius:'8px', fontSize:'13px', border:'none', cursor:'pointer' }}>
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    )}

    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
