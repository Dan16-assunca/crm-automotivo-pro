import { useRef, useEffect, useState } from 'react'
import { Bell, Search, X } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

export function Topbar() {
  const { user } = useAuthStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') { setSearchOpen(false); setSearchValue('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <header style={{
      height: 52, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 20px',
      background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
      flexShrink: 0, gap: 12,
    }}>

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 380, position: 'relative' }}>
        <Search size={13} style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text4)', pointerEvents: 'none',
        }} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar leads, veículos..."
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setSearchOpen(false)}
          style={{
            width: '100%', height: 34, paddingLeft: 30, paddingRight: searchValue ? 28 : 50,
            background: 'var(--bg3)', border: `1px solid ${searchOpen ? 'var(--neon-border)' : 'var(--border)'}`,
            borderRadius: 7, color: 'var(--text)', fontSize: 11,
            outline: 'none', fontFamily: 'DM Sans, sans-serif',
            transition: 'border-color .15s',
          }}
        />
        {searchValue ? (
          <button
            onClick={() => setSearchValue('')}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--text4)', cursor: 'pointer', padding: 2,
            }}
          ><X size={12} /></button>
        ) : (
          <kbd style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'var(--bg4)', border: '1px solid var(--border2)',
            color: 'var(--text4)', fontSize: 9, padding: '2px 6px', borderRadius: 4,
            fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none',
          }}>⌘K</kbd>
        )}
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Notifications */}
        <button style={{
          width: 34, height: 34, borderRadius: 7,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', color: 'var(--text4)',
          cursor: 'pointer', position: 'relative', transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text2)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text4)' }}
        >
          <Bell size={15} strokeWidth={1.75} />
          <span style={{
            position: 'absolute', top: 7, right: 7,
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--red)', border: '1.5px solid var(--bg2)',
          }} />
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingLeft: 4 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'var(--neon-dim)', border: '1px solid var(--neon-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: 'var(--neon)',
          }}>
            {user?.full_name?.slice(0, 2).toUpperCase() ?? 'AD'}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>
              {user?.full_name?.split(' ')[0] ?? 'Administrador'}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text4)', textTransform: 'capitalize', marginTop: 1 }}>
              {user?.role ?? 'Admin'}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
