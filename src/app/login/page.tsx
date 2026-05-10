'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Correo o contraseña incorrectos.')
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f2444' }}>
      <div className="bg-white rounded-2xl p-10 w-full max-w-sm shadow-2xl">
        <div className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl mx-auto mb-5" style={{ background: '#0f2444' }}>⚖️</div>
        <h1 className="text-xl font-bold text-center mb-1" style={{ color: '#0f2444' }}>Medina Tasadores, SRL.</h1>
        <p className="text-xs text-slate-500 text-center mb-8 font-mono">Sistema de Ajuste de Seguros</p>
        
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
              placeholder="tucorreo@medinatasadores.com"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-600 text-xs mb-4 font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Ingresar al Sistema'}
          </button>
        </form>
      </div>
    </div>
  )
}
