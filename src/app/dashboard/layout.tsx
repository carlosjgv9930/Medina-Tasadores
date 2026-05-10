'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { EMPRESA } from '@/lib/constants'

type Profile = { id: string; full_name: string; short_name: string; role: string; email: string }
const ProfileContext = createContext<Profile | null>(null)
export function useProfile() { return useContext(ProfileContext) }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile(data)
      setLoading(false)
    }
    load()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-100"><div className="text-slate-400 text-sm">Cargando...</div></div>

  return (
    <ProfileContext.Provider value={profile}>
      <div className="min-h-screen flex flex-col">
        <header className="h-14 flex items-center justify-between px-6 text-white flex-shrink-0" style={{ background: '#0f2444' }}>
          <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-90">
            <span className="text-xl">⚖️</span>
            <div>
              <div className="font-bold text-sm">{EMPRESA.nombre}</div>
              <div className="text-[10px] text-sky-300 font-mono">Sistema de Ajuste de Seguros</div>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs font-semibold">{profile?.short_name}</div>
              <div className="text-[10px] text-sky-300 font-mono capitalize">{profile?.role}</div>
            </div>
            <button onClick={handleLogout} className="px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-md hover:bg-white/20">Salir</button>
          </div>
        </header>
        <nav className="bg-white border-b border-slate-200 px-6 flex items-center gap-1 h-11 flex-shrink-0">
          <Link href="/dashboard" className={`px-4 py-2 text-xs font-semibold rounded-md transition ${pathname === '/dashboard' ? 'bg-blue-700 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>📊 Dashboard</Link>
          <Link href="/dashboard/cases/new" className={`px-4 py-2 text-xs font-semibold rounded-md transition ${pathname === '/dashboard/cases/new' ? 'bg-blue-700 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>+ Nuevo Caso</Link>
        </nav>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </ProfileContext.Provider>
  )
}
