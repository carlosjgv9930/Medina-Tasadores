import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Medina Tasadores, SRL. — Sistema de Ajuste',
  description: 'Sistema de gestión de casos de ajuste de seguros',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased bg-slate-100 min-h-screen" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
