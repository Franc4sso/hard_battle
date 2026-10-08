import type { Card } from '../../shared/cards'
import type { Monster } from '../../shared/battle'

/**
 * Il ritratto è un'immagine servita da /api/portrait, identificata da personaggio,
 * arma e stadio di evoluzione: il browser la tiene in cache, il server pure. Qui si
 * tiene solo nota di quali sono già arrivate o fallite, per non far lampeggiare la scheda.
 */
export const portraitUrl = (m: Pick<Monster, 'character' | 'weapon' | 'stage'>) =>
  `/api/portrait/${m.character.id}/${m.weapon.id}${m.stage ? `?stage=${m.stage}` : ''}`

/** La foto del K.O. di una rissa: vincitore, perdente e arena. */
export const koUrl = (winner: Pick<Monster, 'character' | 'weapon'>, loser: Pick<Monster, 'character' | 'weapon'>, arena: Card) =>
  `/api/ko/${winner.character.id}/${winner.weapon.id}/${loser.character.id}/${loser.weapon.id}/${arena.id}`

const state = new Map<string, 'loading' | 'ready' | 'failed'>()

export const portraitState = (m: Pick<Monster, 'character' | 'weapon' | 'stage'>) => state.get(portraitUrl(m))

/** Fa partire la generazione di un'immagine in anticipo, così quando serve è già pronta. */
export function preload(url: string) {
  if (state.has(url) || typeof Image === 'undefined') return
  state.set(url, 'loading')
  const img = new Image()
  img.onload = () => state.set(url, 'ready')
  img.onerror = () => state.set(url, 'failed')
  img.src = url
}

/** Il ritratto parte appena il mostro è completo, mentre l'altro giocatore sta ancora componendo. */
export const preloadPortrait = (m: Pick<Monster, 'character' | 'weapon' | 'stage'>) => preload(portraitUrl(m))

export const markPortrait = (m: Pick<Monster, 'character' | 'weapon' | 'stage'>, s: 'ready' | 'failed') => state.set(portraitUrl(m), s)
