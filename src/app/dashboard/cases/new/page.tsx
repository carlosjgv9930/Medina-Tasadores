'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { ASEGURADORAS, TIPOS_POLIZA } from '@/lib/constants'

export default function NewCasePage() {
  const [form, setForm] = useState({
    reclamo: '', asegurado: '', aseguradora: '', tipo_poliza: '',
    poliza_no: '', intermediario: '', intermediario_email: '', intermediario_tel: '',
    fecha_siniestro: '', fecha_asignacion: '', causa: '', assigned_to: '',
  })
  const [profiles, setProfiles] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('profiles').select('id, short_name, role').then(({ data }) => {
      setProfiles(data || [])
    })
  }, [])

  function upd(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
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
      fecha_siniestro: form.fecha_siniestro || null,
      fecha_asignacion: form.fecha_asignacion || null,
    }
    if (!insertData.assigned_to) delete insertData.assigned_to
    const { data, error } = await supabase.from('cases').insert(insertData).select().single()
    if (error) { alert('Error al crear el caso: ' + error.message); setSaving(false); return }
    
    await supabase.from('case_activity').insert({
      case_id: data.id, user_id: user?.id,
      action: 'Caso creado', details: `Reclamo ${form.reclamo || 'sin número'} — ${form.asegurado}`
    })
    router.push(`/dashboard/cases/${data.id}`)
  }

  const inputClass = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
  const labelClass = "block text-xs font-semibold text-slate-600 mb-1"

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-sm p-8">
        <div className="flex items-center gap-4 mb-6 pb-5 border-b border-slate-200">
          <span className="text-3xl">📋</span>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Nuevo Caso</h1>
            <p className="text-xs text-slate-500">Solo el asegurado es obligatorio. Los demás datos se completan después.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Reclamo No.</label><input className={inputClass} value={form.reclamo} onChange={e => upd('reclamo', e.target.value)} placeholder="Ej: 568432" /></div>
            <div><label className={labelClass}>Asegurado <span className="text-red-500">*</span></label><input className={inputClass} value={form.asegurado} onChange={e => upd('asegurado', e.target.value)} placeholder="Nombre del asegurado" required /></div>
            <div><label className={labelClass}>Aseguradora</label>
              <select className={inputClass} value={form.aseguradora} onChange={e => upd('aseguradora', e.target.value)}>
                <option value="">Seleccionar...</option>
                {ASEGURADORAS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Tipo de Póliza</label>
              <select className={inputClass} value={form.tipo_poliza} onChange={e => upd('tipo_poliza', e.target.value)}>
                <option value="">Seleccionar...</option>
                {TIPOS_POLIZA.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Póliza No.</label><input className={inputClass} value={form.poliza_no} onChange={e => upd('poliza_no', e.target.value)} /></div>
            <div><label className={labelClass}>Intermediario</label><input className={inputClass} value={form.intermediario} onChange={e => upd('intermediario', e.target.value)} /></div>
            <div><label className={labelClass}>Email Intermediario</label><input className={inputClass} type="email" value={form.intermediario_email} onChange={e => upd('intermediario_email', e.target.value)} /></div>
            <div><label className={labelClass}>Tel. Intermediario</label><input className={inputClass} value={form.intermediario_tel} onChange={e => upd('intermediario_tel', e.target.value)} /></div>
            <div><label className={labelClass}>Fecha del Siniestro</label><input className={inputClass} type="date" value={form.fecha_siniestro} onChange={e => upd('fecha_siniestro', e.target.value)} /></div>
            <div><label className={labelClass}>Fecha de Asignación</label><input className={inputClass} type="date" value={form.fecha_asignacion} onChange={e => upd('fecha_asignacion', e.target.value)} /></div>
            <div><label className={labelClass}>Causa del Siniestro</label><input className={inputClass} value={form.causa} onChange={e => upd('causa', e.target.value)} placeholder="Ej: Robo, Incendio..." /></div>
            <div><label className={labelClass}>Asignar a</label>
              <select className={inputClass} value={form.assigned_to} onChange={e => upd('assigned_to', e.target.value)}>
                <option value="">Yo mismo</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.short_name} ({p.role})</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button type="button" onClick={() => router.push('/dashboard')} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-[2] py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50">
              {saving ? 'Guardando...' : '💾 Guardar y Abrir Caso →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
