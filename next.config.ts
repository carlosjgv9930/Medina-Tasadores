import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  webpack: (config: any) => {
    // Necesario para que pdfjs-dist funcione en componentes cliente
    // sin intentar compilar el módulo nativo "canvas" de Node.js
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    }
    return config
  },
}

export default nextConfig
