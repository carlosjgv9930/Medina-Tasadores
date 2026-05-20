'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { ASEGURADORAS, TIPOS_POLIZA } from '@/lib/constants'

export default function NewCasePage() {
  const [form, setForm] = useState({
    reclamo: '', asegurado: '', aseguradora: '', tipo_poliza: '',
    poliza_no: '', intermediario: '', intermediario_email: '', intermediario_tel: '',
    fecha_siniestro: '', fecha_asignacion: '', causa: '', assigned_to: '',
    vigencia: '', suma_asegurada: '', deducible: '',
  })
  const [profiles, setProfiles] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [polizaFile, setPolizaFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState('')
  const polizaRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('profiles').select('id, short_name, role').then(({ data }) => setProfiles(data || []))
  }, [])

  function upd(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handlePolizaSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPolizaFile(file)

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setExtracting(true)
      setExtractMsg('Extrayendo datos de la póliza...')
      try {
        const reader = new FileReader()
        const base64 = await new Promise<string>((res) => {
          reader.onload = (ev) => res((ev.target?.result as string).split(',')[1])
          reader.readAsDataURL(file)
        })
        const resp = await fetch('/api/extract-poliza', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64, fileType: file.type, fileName: file.name }),
        })
        const data = await resp.json()
        if (!data.error) {
          const updates: Partial<typeof form> = {}
          const mapping: Record<string, keyof typeof form> = {
            vigencia: 'vigencia', suma_asegurada: 'suma_asegurada',
            deducible: 'deducible', tipo_poliza: 'tipo_poliza',
            poliza_no: 'poliza_no', intermediario: 'intermediario',
          }
          let count = 0
          for (const [k, v] of Object.entries(mapping)) {
            if (data[k] && !form[v]) { updates[v] = data[k]; count++ }
          }
          if (data.asegurado && !form.asegurado) updates.asegurado = data.asegurado
          setForm(prev => ({ ...prev, ...updates }))
          setExtractMsg(count > 0 ? `✅ ${count} campo${count !== 1 ? 's' : ''} completado${count !== 1 ? 's' : ''} automáticamente` : '✅ Póliza registrada (no se encontraron nuevos campos)')
        } else {
          setExtractMsg('⚠️ ' + data.error)
        }
      } catch {
        setExtractMsg('⚠️ No se pudo extraer datos. El archivo quedará adjunto.')
      }
      setExtracting(false)
    } else {
      setExtractMsg('📎 Archivo registrado (solo PDF permite extracción automática)')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.asegurado.trim()) { alert('El nombre del asegurado es obligatorio.'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const insertData: any = {
      ...form,
      created_by: user?.id,
      assigned_to: form.assigned_to || user?.id,
      fecha_siniestro:  form.fecha_siniestro  || null,
      fecha_asignacion: form.fecha_asignacion || null,
      poliza_doc_name:  polizaFile?.name || null,
    }
    if (!insertData.assigned_to) delete insertData.assigned_to

    const { data, error } = await supabase.from('cases').insert(insertData).select().single()
    if (error) { alert('Error al crear el caso: ' + error.message); setSaving(false); return }

    // Nombre de la póliza ya está incluido en insertData.poliza_doc_name

    await supabase.from('case_activity').insert({
      case_id: data.id, user_id: user?.id,
      action: 'Caso creado',
      details: `Reclamo ${form.reclamo || 'sin número'} — ${form.asegurado}`,
    })

    router.push(`/dashboard/cases/${data.id}`)
  }

  const S = {
    page:     { maxWidth:'720px', margin:'0 auto', padding:'28px 24px' },
    card:     { backgroundColor:'white', borderRadius:'14px', border:'1px solid #e2e8f0', overflow:'hidden' },
    header:   { padding:'24px 28px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:'14px' },
    body:     { padding:'28px' },
    section:  { marginBottom:'28px' },
    sLabel:   { fontSize:'10px', fontWeight:700, color:'#94a3b8', textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:'14px', display:'block' },
    grid2:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' },
    field:    { display:'flex', flexDirection:'column' as const, gap:'5px' },
    label:    { fontSize:'11px', fontWeight:600, color:'#475569' },
    input:    { padding:'8px 11px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', color:'#0f172a', outline:'none', backgroundColor:'white', transition:'border 0.15s' },
    select:   { padding:'8px 11px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', color:'#0f172a', outline:'none', backgroundColor:'white', appearance:'auto' as const },
    divider:  { height:'1px', backgroundColor:'#f1f5f9', margin:'0 0 24px 0' },
    foot:     { display:'flex', gap:'10px', paddingTop:'20px', borderTop:'1px solid #f1f5f9' },
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Header */}
        <div style={S.header}>
          <div style={{ width:'44px', height:'44px', backgroundColor:'#eff6ff', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', flexShrink:0 }}>📋</div>
          <div>
            <h1 style={{ fontSize:'16px', fontWeight:700, color:'#0f172a', margin:0 }}>Nuevo Caso</h1>
            <p style={{ fontSize:'12px', color:'#94a3b8', margin:0, marginTop:'2px' }}>Solo el asegurado es obligatorio. Los demás datos se completan después.</p>
          </div>
        </div>

        <div style={S.body}>
          <form onSubmit={handleSubmit}>

            {/* IDENTIFICACIÓN */}
            <div style={S.section}>
              <span style={S.sLabel}>Identificación del Caso</span>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Reclamo No.</label>
                  <input style={S.input} value={form.reclamo} onChange={e => upd('reclamo', e.target.value)} placeholder="Ej: 568432" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Asegurado <span style={{ color:'#ef4444' }}>*</span></label>
                  <input style={S.input} value={form.asegurado} onChange={e => upd('asegurado', e.target.value)} placeholder="Nombre completo del asegurado" required />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Aseguradora</label>
                  <select style={S.select} value={form.aseguradora} onChange={e => upd('aseguradora', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {ASEGURADORAS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Causa del Siniestro</label>
                  <input style={S.input} value={form.causa} onChange={e => upd('causa', e.target.value)} placeholder="Ej: Robo, Incendio, Inundación..." />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Fecha del Siniestro</label>
                  <input style={{ ...S.input, colorScheme:'light' }} type="date" value={form.fecha_siniestro} onChange={e => upd('fecha_siniestro', e.target.value)} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Fecha de Asignación</label>
                  <input style={{ ...S.input, colorScheme:'light' }} type="date" value={form.fecha_asignacion} onChange={e => upd('fecha_asignacion', e.target.value)} />
                </div>
              </div>
            </div>

            <div style={S.divider} />

            {/* PÓLIZA */}
            <div style={S.section}>
              <span style={S.sLabel}>Datos de la Póliza</span>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Tipo de Póliza</label>
                  <select style={S.select} value={form.tipo_poliza} onChange={e => upd('tipo_poliza', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {TIPOS_POLIZA.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Póliza No.</label>
                  <input style={S.input} value={form.poliza_no} onChange={e => upd('poliza_no', e.target.value)} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Vigencia</label>
                  <input style={S.input} value={form.vigencia} onChange={e => upd('vigencia', e.target.value)} placeholder="ej: 01/01/2025 – 01/01/2026" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Suma Asegurada</label>
                  <input style={S.input} value={form.suma_asegurada} onChange={e => upd('suma_asegurada', e.target.value)} placeholder="DOP 1,500,000.00" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Deducible</label>
                  <input style={S.input} value={form.deducible} onChange={e => upd('deducible', e.target.value)} placeholder="2% o DOP 15,000.00" />
                </div>
              </div>
            </div>

            <div style={S.divider} />

            {/* INTERMEDIARIO */}
            <div style={S.section}>
              <span style={S.sLabel}>Intermediario</span>
              <div style={S.grid2}>
                <div style={S.field}>
                  <label style={S.label}>Nombre del Intermediario</label>
                  <input style={S.input} value={form.intermediario} onChange={e => upd('intermediario', e.target.value)} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Email</label>
                  <input style={S.input} type="email" value={form.intermediario_email} onChange={e => upd('intermediario_email', e.target.value)} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Teléfono</label>
                  <input style={S.input} value={form.intermediario_tel} onChange={e => upd('intermediario_tel', e.target.value)} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Asignar a</label>
                  <select style={S.select} value={form.assigned_to} onChange={e => upd('assigned_to', e.target.value)}>
                    <option value="">Yo mismo</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.short_name} ({p.role})</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={S.divider} />

            {/* CONDICIONES PARTICULARES */}
            <div style={S.section}>
              <span style={S.sLabel}>Condiciones Particulares de la Póliza</span>
              <div style={{ padding:'18px', backgroundColor:'#f8fafc', borderRadius:'10px', border:'1px dashed #cbd5e1' }}>
                {polizaFile ? (
                  <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                    <span style={{ fontSize:'24px' }}>📄</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'13px', fontWeight:600, color:'#0f172a' }}>{polizaFile.name}</div>
                      <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'2px' }}>
                        {extracting ? '⏳ ' : ''}{extractMsg}
                      </div>
                    </div>
                    <button type="button" onClick={() => { setPolizaFile(null); setExtractMsg(''); if (polizaRef.current) polizaRef.current.value = '' }}
                      style={{ fontSize:'12px', color:'#94a3b8', background:'none', border:'none', cursor:'pointer' }}>
                      ✕ Quitar
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'28px', marginBottom:'8px' }}>📎</div>
                    <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'12px' }}>
                      Sube las condiciones particulares para extraer datos automáticamente.<br />
                      <span style={{ color:'#94a3b8' }}>Si no las tienes aún, puedes cargarlas después desde el caso.</span>
                    </p>
                    <label style={{ padding:'8px 16px', backgroundColor:'white', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'12px', fontWeight:600, color:'#475569', cursor:'pointer' }}>
                      Seleccionar PDF o Word
                      <input ref={polizaRef} type="file" accept=".pdf,.doc,.docx" onChange={handlePolizaSelect} hidden />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* ACTIONS */}
            <div style={S.foot}>
              <button type="button" onClick={() => router.push('/dashboard')}
                style={{ flex:1, padding:'11px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', color:'#64748b', cursor:'pointer', backgroundColor:'white', fontWeight:500 }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving || extracting}
                style={{ flex:2, padding:'11px', backgroundColor: saving ? '#94a3b8' : '#1e3a8a', color:'white', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer', transition:'background-color 0.15s' }}>
                {saving ? 'Guardando...' : '💾 Guardar y Abrir Caso →'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  )
}
