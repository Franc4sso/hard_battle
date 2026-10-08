import { useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { play } from '../audio/sfx'
import { markPortrait, portraitState, portraitUrl } from '../game/portraits'
import type { Slot } from '../../shared/cards'
import type { Monster, Side } from '../../shared/battle'

export const PLAYER_COLORS: Record<Side, string> = { 0: '#FF4B3E', 1: '#2F7BFF' }
/** Versione scura, leggibile come testo su bianco. */
export const PLAYER_TEXT: Record<Side, string> = { 0: '#D42A1E', 1: '#1F5FD6' }
export const LETTER_COLORS = ['#7CE0FF', '#FF7AC2', '#8CF0A8']

export const SLOT_INFO: Record<Slot, { label: string; title: string }> = {
  character: { label: 'Personaggio', title: 'IL PERSONAGGIO' },
  weapon: { label: 'Arma', title: 'L’ARMA' },
  personality: { label: 'Personalità', title: 'LA PERSONALITÀ' },
  power: { label: 'Superpotere', title: 'IL SUPERPOTERE' },
}

type Variant = 'ink' | 'red' | 'white' | 'ghost'

export function Button({
  variant = 'ink',
  className = '',
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${className}`}
      onClick={(e) => {
        play('tap')
        onClick?.(e)
      }}
      {...rest}
    />
  )
}

/** Ritardo d'animazione e rotazione come variabili CSS. */
export const anim = (d: number, rot?: number): CSSProperties =>
  ({ '--d': `${d}s`, ...(rot === undefined ? {} : { '--rot': `${rot}deg` }) }) as CSSProperties

export function Footer({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex flex-col gap-3 pt-2">{children}</div>
}

export function HpBar({ hp }: { hp: number }) {
  const color = hp > 50 ? '#2BD99A' : hp > 20 ? '#FFB020' : '#FF4B3E'
  return (
    <div className="hp" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hp} aria-label="Punti vita">
      <div style={{ width: `${Math.max(0, hp)}%`, background: color }} />
    </div>
  )
}

/**
 * Il ritratto del mostro, generato dal server. Finché non arriva si vede un
 * riquadro a righe; se non arriva, il riquadro resta: la scheda non salta.
 * Un ritratto fallito si ritenta una volta a ogni nuova schermata (il server
 * non mette in cache i fallimenti, quindi è un vero secondo tentativo).
 */
export function Portrait({ monster, size = 'md', className = '' }: { monster: Pick<Monster, 'character' | 'weapon'>; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const url = portraitUrl(monster)
  const initial = () => (portraitState(monster) === 'ready' ? 'ready' : 'loading')
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(initial)
  useEffect(() => {
    setState(initial())
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`portrait portrait-${size} ${state} ${className}`} aria-hidden={state !== 'ready'}>
      {state !== 'failed' && (
        <img
          src={url}
          alt=""
          decoding="async"
          onLoad={() => {
            markPortrait(monster, 'ready')
            setState('ready')
          }}
          onError={() => {
            markPortrait(monster, 'failed')
            setState('failed')
          }}
        />
      )}
      {state !== 'ready' && <span className="comic text-[13px] leading-tight">{state === 'failed' ? 'SENZA\nRITRATTO' : 'RITRATTO\nIN ARRIVO'}</span>}
    </div>
  )
}

export function Sheet({ children, onClose }: { children: ReactNode; onClose(): void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet a-rise" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

const ICONS = {
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M17 9l5 6" />
      <path d="M22 9l-5 6" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
}

export function Icon({ name, size = 22 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}
