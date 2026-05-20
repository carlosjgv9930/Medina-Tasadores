'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'

type Case = {
  id: string; reclamo: string; asegurado: string; aseguradora: string;
  tipo_poliza: string; status: string; intermediario: string;
  created_at: string; assigned_to: string; fecha_siniestro: string;
  assigned_profile?: { short_name: string } | null;
}

export default function DashboardPage() {
  const [cases, setCases] = useState<Case[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
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
    if (!confirm('¿Eliminar este caso permanentemente? Esta acción no se puede deshacer.')) return
    await supabase.from('cases').delete().eq('id', id)
    loadCases()
  }

  const filtered = cases.filter(c => {
    const matchFilter =
      filter === 'all' ? true :
      filter === 'active' ? !['cerrado', 'declinado', 'sin_cobertura'].includes(c.status) :
      ['cerrado', 'declinado', 'sin_cobertura'].includes(c.status)
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (c.asegurado || '').toLowerCase().includes(q) ||
      (c.reclamo || '').toLowerCase().includes(q) ||
      (c.aseguradora || '').toLowerCase().includes(q) ||
      (c.intermediario || '').toLowerCase().includes(q)
    return matchFilter && matchSearch
  })

  const active   = cases.filter(c => !['cerrado','declinado','sin_cobertura'].includes(c.status)).length
  const total    = cases.length
  const enAjuste = cases.filter(c => c.status === 'en_ajuste').length
  const closed   = cases.filter(c => ['cerrado','declinado','sin_cobertura'].includes(c.status)).length

  const stats = [
    { n: active,   label: 'Activos',   icon: '📂', color: '#2563eb', bg: '#eff6ff' },
    { n: total,    label: 'Total',     icon: '🗂️',  color: '#64748b', bg: '#f8fafc' },
    { n: enAjuste, label: 'En Ajuste', icon: '⚖️',  color: '#d97706', bg: '#fffbeb' },
    { n: closed,   label: 'Cerrados',  icon: '✅',  color: '#16a34a', bg: '#f0fdf4' },
  ]

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('es-DO', { day:'2-digit', month:'short', year:'2-digit' }) : '—'

  return (
    <div style={{ padding: '24px', backgroundColor: '#f8fafc', minHeight: '100%' }}>

      {/* STATS */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'24px' }}>
        {stats.map((s, i) => (
          <div key={i} style={{ backgroundColor:'white', borderRadius:'12px', padding:'20px', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:'14px' }}>
            <div style={{ width:'44px', height:'44px', borderRadius:'10px', backgroundColor:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flexShrink:0 }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize:'26px', fontWeight:700, color:s.color, lineHeight:1 }}>{s.n}</div>
              <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'3px', fontWeight:500 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* TOOLBAR */}
      <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
        {/* Search */}
        <div style={{ flex:1, position:'relative' }}>
          <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#94a3b8', fontSize:'14px' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por asegurado, reclamo, aseguradora..."
            style={{ width:'100%', paddingLeft:'36px', paddingRight:'12px', paddingTop:'9px', paddingBottom:'9px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', outline:'none', backgroundColor:'white', color:'#0f172a', boxSizing:'border-box' }}
          />
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:'4px', backgroundColor:'white', borderRadius:'8px', border:'1px solid #e2e8f0', padding:'4px' }}>
          {[
            { key:'all',    label:'Todos' },
            { key:'active', label:'Activos' },
            { key:'closed', label:'Cerrados' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding:'6px 14px', borderRadius:'6px', fontSize:'12px', fontWeight:600, border:'none', cursor:'pointer', transition:'all 0.15s', backgroundColor: filter===f.key ? '#2563eb' : 'transparent', color: filter===f.key ? 'white' : '#64748b' }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* New case button */}
        <Link href="/dashboard/cases/new"
          style={{ padding:'9px 18px', backgroundColor:'#1e3a8a', color:'white', borderRadius:'8px', fontSize:'13px', fontWeight:600, textDecoration:'none', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:'6px' }}>
          + Nuevo Caso
        </Link>
      </div>

      {/* TABLE */}
      <div style={{ backgroundColor:'white', borderRadius:'12px', border:'1px solid #e2e8f0', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 150px 130px 150px 90px 36px', padding:'10px 16px', backgroundColor:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
          {['Reclamo', 'Asegurado / Intermediario', 'Aseguradora', 'Tipo Póliza', 'Estatus', 'Asign.', ''].map((h, i) => (
            <div key={i} style={{ fontSize:'10px', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding:'60px', textAlign:'center', color:'#94a3b8', fontSize:'14px' }}>
            <div style={{ fontSize:'32px', marginBottom:'12px' }}>⏳</div>
            Cargando casos...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:'60px', textAlign:'center', color:'#94a3b8' }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>📋</div>
            <p style={{ fontSize:'14px', fontWeight:600, color:'#475569', marginBottom:'6px' }}>
              {search ? 'Sin resultados para tu búsqueda' : 'Sin casos registrados'}
            </p>
            <p style={{ fontSize:'12px', marginBottom:'16px' }}>
              {search ? 'Intenta con otros términos' : 'Empieza creando tu primer caso'}
            </p>
            {!search && (
              <Link href="/dashboard/cases/new"
                style={{ padding:'8px 16px', backgroundColor:'#2563eb', color:'white', borderRadius:'8px', fontSize:'13px', fontWeight:600, textDecoration:'none' }}>
                + Nuevo Caso
              </Link>
            )}
          </div>
        ) : filtered.map((c, i) => (
          <Link href={`/dashboard/cases/${c.id}`} key={c.id}
            style={{ display:'grid', gridTemplateColumns:'140px 1fr 150px 130px 150px 90px 36px', padding:'11px 16px', alignItems:'center', borderBottom: i < filtered.length-1 ? '1px solid #f1f5f9' : 'none', textDecoration:'none', backgroundColor: i%2===0 ? 'white' : '#fafafa', transition:'background-color 0.1s' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#eff6ff')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = i%2===0 ? 'white' : '#fafafa')}
          >
            <div style={{ fontFamily:'monospace', fontSize:'11px', color:'#2563eb', fontWeight:700 }}>
              {c.reclamo || <span style={{ color:'#cbd5e1' }}>Sin número</span>}
            </div>
            <div>
              <div style={{ fontSize:'13px', fontWeight:600, color:'#0f172a' }}>{c.asegurado || '—'}</div>
              <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'1px' }}>{c.intermediario || ''}</div>
            </div>
            <div style={{ fontSize:'12px', color:'#475569' }}>
              {(c.aseguradora || '—').replace(' S.A.','').replace(' Compañía de Seguros','').replace(', S.A.','').slice(0,22)}
            </div>
            <div style={{ fontSize:'11px', color:'#64748b' }}>{c.tipo_poliza ? c.tipo_poliza.slice(0,18) : '—'}</div>
            <div><StatusBadge status={c.status} /></div>
            <div style={{ fontSize:'11px', color:'#94a3b8' }}>{c.assigned_profile?.short_name || '—'}</div>
            <div
              onClick={e => { e.preventDefault(); e.stopPropagation(); deleteCase(c.id) }}
              style={{ fontSize:'14px', color:'#fca5a5', cursor:'pointer', textAlign:'center', lineHeight:1 }}
              title="Eliminar caso"
            >✕</div>
          </Link>
        ))}
      </div>

      {filtered.length > 0 && (
        <div style={{ marginTop:'12px', fontSize:'11px', color:'#94a3b8', textAlign:'right' }}>
          {filtered.length} {filtered.length === 1 ? 'caso' : 'casos'} {filter !== 'all' ? 'filtrados' : 'en total'}
        </div>
      )}
    </div>
  )
}
