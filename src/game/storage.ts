import type { MatchState } from './match'

// v5: rissa a frasi suggerite, le partite salvate prima non sono compatibili.
const MATCH_KEY = 'rissa:match:v5'
const PREFS_KEY = 'rissa:prefs:v1'

export interface Prefs {
  muted: boolean
  names: [string, string]
  bestOf: number
}

const DEFAULT_PREFS: Prefs = { muted: false, names: ['', ''], bestOf: 3 }

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage pieno o bloccato: si gioca senza salvare.
  }
}

export const loadMatch = (): MatchState | undefined => {
  const m = read<MatchState>(MATCH_KEY)
  return m?.version === 5 ? m : undefined
}
export const saveMatch = (m: MatchState | undefined) => write(MATCH_KEY, m)

export const loadPrefs = (): Prefs => ({ ...DEFAULT_PREFS, ...read<Prefs>(PREFS_KEY) })
export const savePrefs = (p: Prefs) => write(PREFS_KEY, p)
