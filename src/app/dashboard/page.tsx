'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'

type Case = {
  id: string; reclamo: string; asegurado: string; aseguradora: string;
  tipo_poliza: string; status: string; intermediario: string;
  created_at: string; assigned_to: string;
  assigned_profile?: { short_name: string } | null;
}

export default function DashboardPage() {
  const [cases, setCases] = useState<Case[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadCases() }, [])

  async function loadCases() {
    const { data } = await supabase
      .from('cases')
      .select('*, assigned_profile:profiles!cases_assigned_to_fkey(short_name)')
      .order('created_at', { ascending: false })
    setCases(data || [])
    setLoading(false)
  }

  async function deleteCase(id: string) {
    if (!confirm('¿Eliminar este caso permanentemente?')) return
    await supabase.from('cases').delete().eq('id', id)
    loadCases()
  }

  const filtered = cases.filter(c => {
    if (filter === 'active') return !['cerrado', 'declinado'].includes(c.status)
    if (filter === 'closed') return ['cerrado', 'declinado'].includes(c.status)
    return true
  })

  const active = cases.filter(c => !['cerrado', 'declinado'].includes(c.status)).length
  const total = cases.length
  const enAjuste = cases.filter(c => c.status === 'en_ajuste').length
  const closed = cases.filter(c => ['cerrado', 'declinado'].includes(c.status)).length

  return (
    <div className="p-6">
      {/* STATS */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { n: active, l: 'Activos', color: 'text-blue-700' },
          { n: total, l: 'Total', color: 'text-slate-500' },
          { n: enAjuste, l: 'En Ajuste', color: 'text-amber-600' },
          { n: closed, l: 'Cerrados', color: 'text-green-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
            <div className={`text-2xl font-bold ${s.color}`}>{s.n}</div>
            <div className="text-xs text-slate-500">{s.l}</div>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div className="flex gap-2 mb-4">
        {['all', 'active', 'closed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${filter === f ? 'bg-blue-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
            {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : 'Cerrados'}
          </button>
        ))}
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[130px_1fr_160px_140px_140px_80px_40px] px-4 py-3 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono">
          <div>Reclamo</div><div>Asegurado</div><div>Aseguradora</div><div>Tipo Póliza</div><div>Estatus</div><div>Asign.</div><div></div>
        </div>
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Cargando casos...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <div className="text-4xl mb-3">📋</div>
            <p className="font-semibold text-sm mb-1">Sin casos registrados</p>
            <p className="text-xs">Clic en <Link href="/dashboard/cases/new" className="text-blue-600 font-semibold">+ Nuevo Caso</Link> para comenzar</p>
          </div>
        ) : filtered.map((c, i) => (
          <Link href={`/dashboard/cases/${c.id}`} key={c.id}
            className={`grid grid-cols-[130px_1fr_160px_140px_140px_80px_40px] px-4 py-3 items-center border-b border-slate-50 hover:bg-blue-50/50 transition cursor-pointer ${i % 2 ? 'bg-slate-50/50' : ''}`}>
            <div className="font-mono text-xs text-blue-700 font-semibold">{c.reclamo || '—'}</div>
            <div>
              <div className="font-semibold text-sm text-slate-900">{c.asegurado || '—'}</div>
              <div className="text-[11px] text-slate-400">{c.intermediario || ''}</div>
            </div>
            <div className="text-xs text-slate-600">{(c.aseguradora || '—').replace(' S.A.', '').replace(' Compañía de Seguros', '')}</div>
            <div className="text-xs text-slate-500">{c.tipo_poliza || '—'}</div>
            <div><StatusBadge status={c.status} /></div>
            <div className="text-[11px] text-slate-400">{c.assigned_profile?.short_name || '—'}</div>
            <div onClick={e => { e.preventDefault(); e.stopPropagation(); deleteCase(c.id) }}
              className="text-xs text-red-400 hover:text-red-600 cursor-pointer font-bold">✕</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
