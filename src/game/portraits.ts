import type { Monster } from '../../shared/battle'

/**
 * Il ritratto è un'immagine servita da /api/portrait, identificata da personaggio
 * e arma: il browser la tiene in cache, il server pure. Qui si tiene solo nota di
 * quali sono già arrivate o fallite, per non far lampeggiare la scheda.
 */
export const portraitUrl = (m: Pick<Monster, 'character' | 'weapon'>) => `/api/portrait/${m.character.id}/${m.weapon.id}`

const state = new Map<string, 'loading' | 'ready' | 'failed'>()

export const portraitState = (m: Pick<Monster, 'character' | 'weapon'>) => state.get(portraitUrl(m))

/**
 * Fa partire la generazione appena il mostro è confermato, mentre l'altro
 * giocatore sta ancora componendo: al VS il ritratto è di solito già pronto.
 */
export function preloadPortrait(m: Pick<Monster, 'character' | 'weapon'>) {
  const url = portraitUrl(m)
  if (state.has(url) || typeof Image === 'undefined') return
  state.set(url, 'loading')
  const img = new Image()
  img.onload = () => state.set(url, 'ready')
  img.onerror = () => state.set(url, 'failed')
  img.src = url
}

export const markPortrait = (m: Pick<Monster, 'character' | 'weapon'>, s: 'ready' | 'failed') => state.set(portraitUrl(m), s)
