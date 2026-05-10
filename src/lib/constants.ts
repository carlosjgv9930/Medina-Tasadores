export const STATUSES = [
  { key: 'apertura', label: 'Apertura del Caso', color: '#6366f1' },
  { key: 'coordinando_inspeccion', label: 'Coordinando Inspección', color: '#f59e0b' },
  { key: 'inspeccion_realizada', label: 'Inspección Realizada', color: '#8b5cf6' },
  { key: 'resumen_enviado', label: 'Resumen Enviado', color: '#3b82f6' },
  { key: 'docs_solicitados', label: 'Docs. Solicitados', color: '#f97316' },
  { key: 'docs_parciales', label: 'Docs. Parciales', color: '#eab308' },
  { key: 'docs_completos', label: 'Docs. Completos', color: '#10b981' },
  { key: 'en_ajuste', label: 'En Ajuste', color: '#06b6d4' },
  { key: 'convenio_enviado', label: 'Convenio Enviado', color: '#8b5cf6' },
  { key: 'informe_final_enviado', label: 'Informe Final Enviado', color: '#22c55e' },
  { key: 'cerrado', label: 'Cerrado ✓', color: '#6b7280' },
  { key: 'declinado', label: 'Declinado', color: '#ef4444' },
  { key: 'sin_cobertura', label: 'Sin Cobertura', color: '#dc2626' },
] as const

export const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]))

export const ASEGURADORAS = [
  'Seguros Universal, S.A.',
  'Seguros Reservas, S.A.',
  'Seguros Crecer, S.A.',
  'Mapfre BHD Compañía de Seguros, S.A.',
  'Humano Seguros, S.A.',
  'Seguros La Colonial',
  'CoopSeguros',
]

export const TIPOS_POLIZA = [
  'Incendio y Líneas Aliadas',
  'Todo Riesgo Propiedades',
  'Avería de Maquinaria',
  'Equipos Electrónicos',
  'Responsabilidad Civil',
  'Transporte de Carga',
  'Transporte Marítimo',
  'Multirriesgo PYMES',
  'Hogar',
  'Todo Riesgo Construcción',
  'Fidelidad',
  'Cristales',
  'Vehículos',
]

export const DOC_CATEGORIES = [
  { key: 'poliza', label: 'Póliza' },
  { key: 'apoderamiento', label: 'Apoderamiento' },
  { key: 'acta_policial', label: 'Acta Policial' },
  { key: 'informe_tecnico', label: 'Informe Técnico' },
  { key: 'cotizacion', label: 'Cotización' },
  { key: 'factura', label: 'Factura' },
  { key: 'foto_inspeccion', label: 'Fotos Inspección' },
  { key: 'carta_asegurado', label: 'Carta del Asegurado' },
  { key: 'registro_mercantil', label: 'Registro Mercantil' },
  { key: 'cedula', label: 'Cédula' },
  { key: 'relacion_perdida', label: 'Relación de Pérdida' },
  { key: 'convenio_firmado', label: 'Convenio Firmado' },
  { key: 'cuadro_ajuste', label: 'Cuadro de Ajuste' },
  { key: 'informe', label: 'Informe' },
  { key: 'email', label: 'Email/Correo' },
  { key: 'descargo', label: 'Descargo' },
  { key: 'otro', label: 'Otro' },
]

export const EMPRESA = {
  nombre: 'Medina Tasadores, SRL.',
  rnc: '101-77092-9',
  direccion: 'Av. Yapur Dumit, Plaza Ary, Primer Nivel Módulo 103, Santiago de los Caballeros, Rep. Dom.',
  telefono: '(809) 233-6838/40',
}
