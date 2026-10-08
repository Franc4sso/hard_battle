/**
 * Rarità delle carte. Si vede nel draft (etichetta e cornice), pesa sui danni
 * di nascosto: gli attacchi non mostrano mai quanto valgono.
 * Le leggendarie e le epiche sono scelte a mano (le carte più assurde o
 * potenti); le rare si assegnano con un hash fisso del nome, così la
 * proporzione resta stabile senza elencarle tutte.
 */
export type Rarity = 'comune' | 'rara' | 'epica' | 'leggendaria'
export const RARITIES: readonly Rarity[] = ['comune', 'rara', 'epica', 'leggendaria']

/** Quanto spesso esce ciascun livello quando si pescano le carte. */
export const RARITY_ODDS: Record<Rarity, number> = { comune: 0.6, rara: 0.28, epica: 0.1, leggendaria: 0.02 }

/** Livello numerico, per i danni nascosti: comune 0 … leggendaria 3. */
export const RARITY_LEVEL: Record<Rarity, 0 | 1 | 2 | 3> = { comune: 0, rara: 1, epica: 2, leggendaria: 3 }

export const RARITY_LABEL: Record<Rarity, string> = { comune: 'Comune', rara: 'Rara', epica: 'Epica', leggendaria: 'Leggendaria' }

const LEGENDARY = new Set([
  // personaggi
  'Zeus in pensione',
  'Kraken',
  'Genio della lampada',
  'Hitler',
  'Berlusconi',
  // armi
  'Martello di Thor (imitazione cinese)',
  'Tridente di Poseidone',
  'Dildo di cemento',
  // personalità
  'Convinto di essere in un film',
  'Bestemmiatore seriale',
  // superpoteri
  'Ferma il tempo per 3 secondi',
  'Scambia il corpo con l’avversario',
  'Copia il superpotere avversario',
  'Bestemmia tuonante',
])

const EPIC = new Set([
  // personaggi
  'Squalo bianco con i braccioli',
  'Drago con la rinite',
  'Minotauro',
  'Yeti',
  'Golem di pasta frolla',
  'Strega di Benevento',
  'Nonna siciliana',
  'Gengis Khan',
  'Nikola Tesla',
  'Ercole',
  'Ciclope',
  'Fenice',
  'Medusa',
  'Lupo mannaro',
  'Intelligenza artificiale permalosa',
  'Nonno cyborg',
  'Tasso del miele',
  'Annibale',
  'Attila',
  'Stalin',
  'Mussolini a torso nudo',
  'Nonno in carrozzina truccata',
  'Kim Jong-un',
  'Caligola',
  'Rasputin',
  'Elon Musk',
  // armi
  'Spada laser con le pile scariche',
  'Bazooka di coriandoli',
  'Lanciafiamme al peperoncino calabrese',
  'Forma di parmigiano 36 mesi',
  'Catapulta portatile',
  'Martello pneumatico',
  'Lancia del torneo medievale',
  'Chiave inglese gigante',
  'Palla da bowling',
  'Estintore',
  'Pentola a pressione',
  'Clistere industriale',
  'Bidet volante',
  'Gatto incazzato',
  // personalità
  'Scienziato pazzo',
  'Attore shakespeariano',
  'Calcolatore freddo',
  'Vendicativo',
  'Cavaliere medievale',
  'Prestigiatore',
  'Gentilissimo ma spietato',
  'Pirata nel cuore',
  'Stronzo patentato',
  'Fatto come una pigna',
  // superpoteri
  'Diventa gigante quando si arrabbia',
  'Si moltiplica in 10 copie',
  'Pavimento di lava',
  'Gravità invertita',
  'Laser dagli occhi',
  'Restituisce il colpo raddoppiato',
  'Evoca un esercito di nonne',
  'Pelle di titanio',
  'Temporale di polpette',
  'Raggio congelante',
  'Terremoto personale',
  'Onda anomala',
  'Gigantismo improvviso',
  'Clonazione dell’arma',
  'Rutto sismico',
  'Scoreggia infuocata',
  'Corruzione in contanti',
])

function hash(s: string): number {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}

/** Tra le carte non scelte a mano, circa una su tre è rara: così in tutto le rare sono intorno al 28%. */
const RARE_SHARE = 0.33

export function rarityOf(name: string): Rarity {
  if (LEGENDARY.has(name)) return 'leggendaria'
  if (EPIC.has(name)) return 'epica'
  return hash(name) / 4294967296 < RARE_SHARE ? 'rara' : 'comune'
}
