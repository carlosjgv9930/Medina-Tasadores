'use client'
import { useState, useEffect, useCallback, use } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { STATUSES, STATUS_MAP, ASEGURADORAS, TIPOS_POLIZA, EMPRESA } from '@/lib/constants'
import StatusBadge from '@/components/StatusBadge'

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [c, setC] = useState<any>(null)
  const [profiles, setProfiles] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('saved')
  const [showStatusDD, setShowStatusDD] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState('')
  const [genTitle, setGenTitle] = useState('')
  const [showGenModal, setShowGenModal] = useState(false)
  const [savedDocs, setSavedDocs] = useState<any[]>([])
  const supabase = createClient()
  const router = useRouter()
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
      const { data: acts } = await supabase.from('case_activity').select('*, profiles(short_name)').eq('case_id', id).order('created_at', { ascending: false }).limit(20)
      setActivity(acts || [])
      const { data: docs } = await supabase.from('generated_documents').select('*').eq('case_id', id).order('created_at', { ascending: false })
      setSavedDocs(docs || [])
      setLoading(false)
    }
    load()
  }, [id])

  const updateField = useCallback((field: string, value: string) => {
    setC((prev: any) => ({ ...prev, [field]: value }))
    setSaveStatus('saving')
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      await supabase.from('cases').update({ [field]: value || null }).eq('id', id)
      setSaveStatus('saved')
    }, 800)
  }, [id])

  async function setStatus(status: string) {
    setC((prev: any) => ({ ...prev, status }))
    setShowStatusDD(false)
    await supabase.from('cases').update({ status }).eq('id', id)
    await supabase.from('case_activity').insert({
      case_id: id, user_id: profile?.id,
      action: 'Cambio de estatus', details: `→ ${STATUS_MAP[status]?.label || status}`
    })
    refreshActivity()
    setSaveStatus('saved')
  }

  async function refreshActivity() {
    const { data } = await supabase.from('case_activity').select('*, profiles(short_name)').eq('case_id', id).order('created_at', { ascending: false }).limit(20)
    setActivity(data || [])
  }

  function buildContext() {
    if (!c || !profile) return ''
    const s = STATUS_MAP[c.status] || { label: c.status }
    const firma = profile.role === 'director'
      ? 'Solo: EDDY S. MEDINA PUJOLS / Medina Tasadores, SRL.'
      : 'Izquierda: EDDY S. MEDINA PUJOLS / Medina Tasadores, SRL.\nDerecha: CARLOS J. GONZÁLEZ. V / Ajustador Actuante'
    const firmaMail = profile.role === 'director'
      ? 'Eddy S. Medina Pujols | Director | Medina Tasadores, SRL. | Av. Yapur Dumit, Plaza Ary, Primer Nivel Modulo 103, Santiago de los Caballeros, Rep. Dom. | Oficina: (809) 233-6838/40'
      : 'Carlos Junior González Ventura | Ajustador Ramos Técnicos | Medina Tasadores, SRL. | Av. Yapur Dumit, Plaza Ary, Primer Nivel Modulo 103, Santiago de los Caballeros, Rep. Dom. | Oficina: (809) 233-6838/40 | Cel.: 849-255-9276 | Email: cgonzalez.medinatasadores@gmail.com'
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
      `Intermediario: ${c.intermediario || '—'}`,
      `Fecha Siniestro: ${c.fecha_siniestro || '—'}`,
      `Fecha Asignación: ${c.fecha_asignacion || '—'}`,
      `Fecha Inspección: ${c.fecha_inspeccion || '—'}`,
      `Suma Asegurada: ${c.suma_asegurada || '—'}`,
      `Deducible: ${c.deducible || '—'}`,
      `Causa: ${c.causa || '—'}`,
      `Reserva Estimada: ${c.reserva || '—'}`,
      `Ubicación del Riesgo: ${c.ubicacion_riesgo || '—'}`,
      `Giro del Negocio: ${c.giro_negocio || '—'}`,
      `Estatus: ${s.label}`,
      c.narrativa ? `\nNARRATIVA DEL SINIESTRO:\n${c.narrativa}` : '',
      c.notas ? `\nNOTAS INTERNAS:\n${c.notas}` : '',
    ].filter(Boolean).join('\n')
  }

  async function generateDocument(title: string, action: string, docType: string, requiresNarr = false) {
    if (requiresNarr && (!c.narrativa || c.narrativa.trim().length < 20)) {
      alert('Completa la Narrativa del Siniestro antes de generar este documento.')
      document.getElementById('narrativa-field')?.focus()
      return
    }
    setGenTitle(title)
    setGenResult('')
    setShowGenModal(true)
    setGenerating(true)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: buildContext(), action, docType }),
      })
      const data = await res.json()
      if (data.error) {
        setGenResult(`Error: ${data.error}`)
      } else {
        setGenResult(data.content)
        // Save to database
        await supabase.from('generated_documents').insert({
          case_id: id, created_by: profile?.id,
          doc_type: docType, title, content: data.content,
        })
        await supabase.from('case_activity').insert({
          case_id: id, user_id: profile?.id,
          action: 'Documento generado', details: title,
        })
        refreshActivity()
        const { data: docs } = await supabase.from('generated_documents').select('*').eq('case_id', id).order('created_at', { ascending: false })
        setSavedDocs(docs || [])
      }
    } catch (e: any) {
      setGenResult(`Error de conexión: ${e.message}`)
    }
    setGenerating(false)
  }

  function viewDoc(doc: any) {
    setGenTitle(doc.title)
    setGenResult(doc.content)
    setShowGenModal(true)
  }

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

  if (loading) return <div className="flex items-center justify-center p-20 text-slate-400 text-sm">Cargando caso...</div>
  if (!c) return null

  const st = STATUS_MAP[c.status] || { label: c.status, color: '#64748b' }
  const hasNarr = c.narrativa && c.narrativa.trim().length >= 20
  const inp = "w-full px-2 py-1 border border-slate-200 rounded text-xs focus:border-blue-500 focus:outline-none mb-2"
  const inpF = "w-full px-2 py-1 border border-emerald-300 rounded text-xs focus:border-blue-500 focus:outline-none mb-2 bg-emerald-50"
  const lbl = "text-[10px] font-semibold text-slate-400 mb-0.5 block"

  const docActions = [
    { title: 'Email: Coordinar Inspección', action: 'Genera el email completo de COORDINAR INSPECCIÓN para el intermediario. Incluye asunto en mayúsculas y cuerpo completo con firma.', type: 'email_coordinar', req: false },
    { title: 'Reporte de Inspección', action: 'Genera el REPORTE DE INSPECCIÓN SINIESTRO completo de 1 página con todos los datos disponibles del caso.', type: 'reporte_inspeccion', req: true },
    { title: 'Informe Preliminar', action: 'Genera el INFORME PRELIMINAR completo con todas las secciones. Si no tienes datos para Entorno o Construcción, escribe "Por determinar".', type: 'informe_preliminar', req: true },
    { title: 'Informe Final', action: 'Genera el INFORME FINAL completo con todas las secciones incluyendo Relación de Pérdida, Ajuste e Indemnización.', type: 'informe_final', req: true },
    { title: 'Convenio de Ajuste', action: 'Genera el CONVENIO DE AJUSTE según el formato de la aseguradora del caso. Si es Mapfre, indica que Mapfre emite su propio convenio.', type: 'convenio_ajuste', req: true },
    { title: 'Solicitud de Documentos', action: 'Genera el email de SOLICITUD DE DOCUMENTOS con los documentos estándar y los específicos según el tipo de siniestro. Incluye OBSERVACIÓN y NOTA de salvamento.', type: 'email_solicitud_docs', req: false },
    { title: 'Email: Docs Pendientes', action: 'Genera el email de DOCUMENTOS PENDIENTES.', type: 'email_docs_pendientes', req: false },
    { title: 'Email: Aviso Recordatorio', action: 'Genera el email de AVISO RECORDATORIO de documentos pendientes.', type: 'email_recordatorio', req: false },
    { title: 'Email: Plazo 10 Días', action: 'Genera el email de PLAZO PARA REMITIR DOCUMENTOS (10 días laborables).', type: 'email_plazo', req: false },
    { title: 'Email: Docs Completos', action: 'Genera el email de RECEPCIÓN DE DOCUMENTACIÓN COMPLETA.', type: 'email_docs_completos', req: false },
    { title: 'Email: Enviar Convenio', action: 'Genera el email de envío del CONVENIO DE AJUSTE al intermediario.', type: 'email_convenio', req: false },
    { title: 'Email: Informe Final', action: 'Genera el email de envío del INFORME FINAL con todos los anexos.', type: 'email_informe_final', req: false },
    { title: 'Carta Declinación', action: 'Genera la CARTA DE DECLINACIÓN al asegurado vía intermediario.', type: 'carta_declinacion', req: true },
    { title: 'Informe de Cierre', action: 'Genera el INFORME DE CIERRE a la aseguradora.', type: 'informe_cierre', req: true },
    { title: 'Descargo Legal RC', action: 'Genera el DESCARGO LEGAL (Liberación y Descargo) para el reclamante en caso de RC.', type: 'descargo_legal', req: true },
    { title: 'Resumen del Caso', action: 'Dame un resumen completo del estado actual del caso, datos disponibles y pasos pendientes.', type: 'email_resumen', req: false },
  ]

  return (
    <>
    <div className="flex h-[calc(100vh-100px)]">
      {/* LEFT PANEL */}
      <div className="w-72 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0 p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wide">Datos del Caso</span>
          <span className="text-[10px] font-mono" style={{ color: saveStatus === 'saved' ? '#059669' : saveStatus === 'saving' ? '#d97706' : '#3b82f6' }}>
            {saveStatus === 'saved' ? '✓ Guardado' : saveStatus === 'saving' ? '⏳ Guardando...' : saveStatus}
          </span>
        </div>

        <label className={lbl}>Reclamo No.</label><input className={c.reclamo ? inpF : inp} value={c.reclamo||''} onChange={e=>updateField('reclamo',e.target.value)} />
        <label className={lbl}>Asegurado</label><input className={c.asegurado ? inpF : inp} value={c.asegurado||''} onChange={e=>updateField('asegurado',e.target.value)} />
        <label className={lbl}>Aseguradora</label>
        <select className={c.aseguradora ? inpF : inp} value={c.aseguradora||''} onChange={e=>updateField('aseguradora',e.target.value)}>
          <option value="">—</option>{ASEGURADORAS.map(a=><option key={a}>{a}</option>)}
        </select>
        <label className={lbl}>Tipo de Póliza</label>
        <select className={c.tipo_poliza ? inpF : inp} value={c.tipo_poliza||''} onChange={e=>updateField('tipo_poliza',e.target.value)}>
          <option value="">—</option>{TIPOS_POLIZA.map(t=><option key={t}>{t}</option>)}
        </select>
        <label className={lbl}>Póliza No.</label><input className={c.poliza_no ? inpF : inp} value={c.poliza_no||''} onChange={e=>updateField('poliza_no',e.target.value)} />
        <label className={lbl}>Intermediario</label><input className={c.intermediario ? inpF : inp} value={c.intermediario||''} onChange={e=>updateField('intermediario',e.target.value)} />
        <label className={lbl}>Fecha Siniestro</label><input type="date" className={c.fecha_siniestro ? inpF : inp} value={c.fecha_siniestro||''} onChange={e=>updateField('fecha_siniestro',e.target.value)} />
        <label className={lbl}>Fecha Asignación</label><input type="date" className={c.fecha_asignacion ? inpF : inp} value={c.fecha_asignacion||''} onChange={e=>updateField('fecha_asignacion',e.target.value)} />
        <label className={lbl}>Fecha Inspección</label><input type="date" className={c.fecha_inspeccion ? inpF : inp} value={c.fecha_inspeccion||''} onChange={e=>updateField('fecha_inspeccion',e.target.value)} />
        <label className={lbl}>Suma Asegurada</label><input className={c.suma_asegurada ? inpF : inp} value={c.suma_asegurada||''} onChange={e=>updateField('suma_asegurada',e.target.value)} placeholder="RD$..." />
        <label className={lbl}>Deducible</label><input className={c.deducible ? inpF : inp} value={c.deducible||''} onChange={e=>updateField('deducible',e.target.value)} placeholder="%/mín." />
        <label className={lbl}>Causa</label><input className={c.causa ? inpF : inp} value={c.causa||''} onChange={e=>updateField('causa',e.target.value)} />
        <label className={lbl}>Reserva</label><input className={c.reserva ? inpF : inp} value={c.reserva||''} onChange={e=>updateField('reserva',e.target.value)} placeholder="RD$..." />
        <label className={lbl}>Ubicación Riesgo</label><input className={c.ubicacion_riesgo ? inpF : inp} value={c.ubicacion_riesgo||''} onChange={e=>updateField('ubicacion_riesgo',e.target.value)} />
        <label className={lbl}>Giro del Negocio</label><input className={c.giro_negocio ? inpF : inp} value={c.giro_negocio||''} onChange={e=>updateField('giro_negocio',e.target.value)} />
        <label className={lbl}>Asignado a</label>
        <select className={inp} value={c.assigned_to||''} onChange={e=>updateField('assigned_to',e.target.value)}>
          <option value="">Sin asignar</option>
          {profiles.map(p=><option key={p.id} value={p.id}>{p.short_name} ({p.role})</option>)}
        </select>
        <label className={lbl}>Notas Internas</label>
        <textarea className={c.notas ? inpF : inp} rows={3} value={c.notas||''} onChange={e=>updateField('notas',e.target.value)} style={{fontFamily:'inherit'}} />

        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wide mb-2">Pipeline</div>
          {STATUSES.slice(0,10).map(s=>(
            <div key={s.key} className="flex items-center gap-2 mb-1 cursor-pointer hover:opacity-80" onClick={()=>setStatus(s.key)}>
              <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0`}
                style={c.status===s.key ? {borderColor:s.color,background:s.color} : {borderColor:'#e2e8f0'}} />
              <span className={`text-[11px] ${c.status===s.key?'font-bold':'text-slate-400'}`}
                style={c.status===s.key?{color:s.color}:{}}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {c.reclamo ? `Reclamo ${c.reclamo}` : 'Nuevo Caso'} — <span className="text-blue-600">{c.asegurado}</span>
            </h1>
            <p className="text-xs text-slate-500">{[c.aseguradora,c.tipo_poliza].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="relative">
            <button onClick={()=>setShowStatusDD(!showStatusDD)} className="px-3 py-1 rounded-full text-white text-xs font-bold" style={{background:st.color}}>
              {st.label} ▾
            </button>
            {showStatusDD && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-slate-200 p-1 z-50 w-56 max-h-80 overflow-y-auto">
                {STATUSES.map(s=>(
                  <div key={s.key} className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-slate-50 text-xs" onClick={()=>setStatus(s.key)}>
                    <div className="w-2 h-2 rounded-full" style={{background:s.color}} />{s.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* NARRATIVA */}
        <div className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${hasNarr?'border-l-emerald-500':'border-l-amber-500'}`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-sm text-slate-800">📝 Narrativa del Siniestro *</h2>
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${hasNarr?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>
              {hasNarr?'✓ Lista':'⚠ Requerida'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">Describe qué pasó, quién te recibió, qué narró el asegurado, bienes afectados. Base para todos los documentos.</p>
          <textarea id="narrativa-field" className={`w-full p-3 border rounded-lg text-sm focus:border-blue-500 focus:outline-none resize-y leading-relaxed ${hasNarr?'border-emerald-300 bg-emerald-50':'border-slate-200'}`}
            rows={5} value={c.narrativa||''} onChange={e=>updateField('narrativa',e.target.value)}
            placeholder="En fecha ___, tras el apoderamiento, nos comunicamos con el intermediario para coordinar. El día ___ visitamos el riesgo en ___, donde fuimos recibidos por ___. El asegurado nos narró que ___. Observamos que ___." style={{fontFamily:'inherit'}} />
          <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
            <span>{(c.narrativa||'').length} caracteres</span><span>Mínimo: 150</span>
          </div>
        </div>

        {/* DOCUMENT GENERATION */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-bold text-sm text-slate-800 mb-3">📄 Generar Documentos e Informes</h2>
          <div className="grid grid-cols-2 gap-2">
            {docActions.map((d,i)=>(
              <button key={i} onClick={()=>generateDocument(d.title,d.action,d.type,d.req)}
                disabled={generating || (d.req && !hasNarr)}
                className={`p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-left text-xs text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed`}>
                {d.title}
              </button>
            ))}
          </div>
          {generating && <div className="mt-3 text-xs text-amber-600 font-semibold animate-pulse">⏳ Generando documento... esto puede tomar 15-30 segundos</div>}
        </div>

        {/* SAVED DOCUMENTS */}
        {savedDocs.length > 0 && (
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h2 className="font-bold text-sm text-slate-800 mb-3">📂 Documentos Generados ({savedDocs.length})</h2>
            {savedDocs.map((d:any)=>(
              <div key={d.id} className="flex items-center justify-between p-2 border-b border-slate-50 hover:bg-slate-50 rounded">
                <div className="cursor-pointer flex-1" onClick={()=>viewDoc(d)}>
                  <div className="text-xs font-semibold text-slate-700">{d.title}</div>
                  <div className="text-[10px] text-slate-400">{new Date(d.created_at).toLocaleString('es-DO',{dateStyle:'short',timeStyle:'short'})} · {d.status}</div>
                </div>
                <button onClick={()=>copyText(d.content)} className="px-2 py-1 text-[10px] text-blue-600 hover:bg-blue-50 rounded">📋 Copiar</button>
              </div>
            ))}
          </div>
        )}

        {/* ACTIVITY */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-bold text-sm text-slate-800 mb-3">📜 Historial</h2>
          {activity.length===0 ? <p className="text-xs text-slate-400">Sin actividad.</p> :
            activity.map((a:any)=>(
              <div key={a.id} className="flex items-start gap-2 mb-2 pb-2 border-b border-slate-50 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-slate-700 font-semibold">{a.action}</span>
                  {a.details && <span className="text-xs text-slate-500"> — {a.details}</span>}
                  <div className="text-[10px] text-slate-400 mt-0.5">{a.profiles?.short_name} · {new Date(a.created_at).toLocaleString('es-DO',{dateStyle:'short',timeStyle:'short'})}</div>
                </div>
              </div>
          ))}
        </div>
      </div>
    </div>

    {/* GENERATION MODAL */}
    {showGenModal && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6">
        <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
          <div className="flex items-center justify-between p-5 border-b border-slate-200">
            <h3 className="font-bold text-base text-slate-900">{genTitle}</h3>
            <button onClick={()=>setShowGenModal(false)} className="text-slate-400 hover:text-red-500 text-xl">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {generating ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="w-10 h-10 border-3 border-slate-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" style={{borderWidth:'3px'}} />
                  <p className="text-sm text-slate-500 font-semibold">Generando documento...</p>
                  <p className="text-xs text-slate-400 mt-1">Esto puede tomar 15-30 segundos</p>
                </div>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-sans">{genResult}</pre>
            )}
          </div>
          {!generating && genResult && (
            <div className="flex gap-3 p-5 border-t border-slate-200">
              <button onClick={()=>copyText(genResult)} className="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800">
                📋 Copiar al Portapapeles
              </button>
              <button onClick={()=>setShowGenModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200">
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  )
}
