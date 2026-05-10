import { STATUS_MAP } from '@/lib/constants'

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, color: '#64748b' }
  return (
    <span
      className="px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-block"
      style={{ background: s.color + '22', color: s.color }}
    >
      {s.label}
    </span>
  )
}
