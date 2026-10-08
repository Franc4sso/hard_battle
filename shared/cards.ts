/**
 * I mazzi del gioco. Condivisi tra app e server: il telefono manda solo gli id,
 * il server ricostruisce il prompt da qui (nessun testo libero arriva all'AI).
 */
import {
  CURSED_PERSONALITIES,
  CURSED_POWERS,
  CURSED_WEAPONS,
  MORE_ARENAS,
  MORE_CHARACTERS,
  MORE_HEALING_POWERS,
  MORE_PERSONALITIES,
  MORE_POWERS,
  MORE_WEAPONS,
} from './decks'
import { DIRTY_CHARACTERS, DIRTY_PERSONALITIES, DIRTY_POWERS, DIRTY_WEAPONS } from './dirty'
import { rarityOf, type Rarity } from './rarity'

export type Slot = 'character' | 'weapon' | 'personality' | 'power'

export interface Card {
  id: string
  name: string
  desc: string
  /** Si vede nel draft e pesa sui danni di nascosto. Trappole e arene sono sempre comuni. */
  rarity: Rarity
  /** Carta trappola: esce solo nel sabotaggio ed è uno svantaggio per chi la riceve. */
  cursed?: true
  /** Carta del mazzo sporco: volgare e scorretta, il narratore può andarci pesante. */
  dirty?: true
}

export const SLOTS: readonly Slot[] = ['character', 'weapon', 'personality', 'power']

/** Da quali mazzi si pesca: "classico" mischia tutto, "sporca" solo il mazzo sporco. */
export type DeckMode = 'classico' | 'sporca'
export const DECK_MODES: readonly DeckMode[] = ['classico', 'sporca']
export const isDeckMode = (v: unknown): v is DeckMode => v === 'classico' || v === 'sporca'

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function deck(prefix: string, rows: [string, string][], cursed = false, dirty = false): Card[] {
  return rows.map(([name, desc]) => ({
    id: `${prefix}-${slug(name)}`,
    name,
    desc,
    rarity: cursed || prefix === 'a' ? 'comune' : rarityOf(name),
    ...(cursed ? { cursed: true as const } : {}),
    ...(dirty ? { dirty: true as const } : {}),
  }))
}

const BASE_CHARACTERS = deck('c', [
  // animali
  ['Piccione di Venezia', 'Conosce ogni calle e non ha paura di nessun turista.'],
  ['Capibara zen', 'Il mammifero più rilassato del pianeta. Niente lo scompone.'],
  ['Gatto obeso del condominio', 'Otto chili di disprezzo e pretese.'],
  ['Squalo bianco con i braccioli', 'Terrore dei mari, ma non sa nuotare.'],
  ['Lama sputatore', 'Mira infallibile fino a quattro metri.'],
  ['Orso polare in ferie a Rimini', 'Ha caldo, è nervoso e vuole il suo ombrellone.'],
  ['Tardigrado', "Sopravvive allo spazio, al fuoco e alle riunioni che potevano essere una mail."],
  ['Polpo laureato in ingegneria', 'Otto braccia, tre cuori, una tesi sui ponti sospesi.'],
  ['Gallina da combattimento', 'Ha visto cose. Non ne parla.'],
  ['Bradipo', 'Lentissimo, ma quando colpisce nessuno se lo aspetta più.'],
  ['Struzzo', 'Corre a 70 all’ora. Se ha paura, nasconde la testa.'],
  ['Riccio', 'Piccolo, rotondo, appuntito su tutti i lati.'],
  ['Formica soldato', 'Solleva cinquanta volte il suo peso e porta rinforzi.'],
  ['Delfino', 'Intelligentissimo, sorride sempre. È questo che fa paura.'],
  ['Cinghiale romano', 'Padrone indiscusso dei cassonetti della Capitale.'],
  ['Pinguino imperatore', 'Elegante in ogni occasione, anche in battaglia.'],
  // umani famosi
  ['Napoleone Bonaparte', 'Genio militare, permaloso sull’altezza.'],
  ['Cleopatra', 'Regina d’Egitto, seduce e manipola chiunque.'],
  ['Leonardo da Vinci', 'Inventa una macchina per ogni problema.'],
  ['Giulio Cesare', 'Venne, vide, vinse. Diffida degli amici.'],
  ['Dante Alighieri', 'Ha visitato l’Inferno e ha preso appunti su tutti.'],
  ['Albert Einstein', 'Piega lo spazio-tempo, non i capelli.'],
  ['Wolfgang Amadeus Mozart', 'Compone sinfonie a sei anni, ride in modo molesto.'],
  ['Marie Curie', 'Due Nobel e un debole per le cose radioattive.'],
  ['Giuseppe Garibaldi', 'Mille camicie rosse e zero paura.'],
  ['Gengis Khan', 'Ha conquistato mezzo mondo a cavallo.'],
  ['Nikola Tesla', 'Controlla l’elettricità e odia Edison.'],
  ['Galileo Galilei', 'Col cannocchiale vede tutto. Eppur si muove.'],
  ['Socrate', 'Non sa di sapere, ma ti fa mille domande finché crolli.'],
  ['Caravaggio', 'Pittore geniale, rissoso, sempre armato.'],
  ['Ludwig van Beethoven', 'Sordo, furioso, potentissimo.'],
  ['Harry Houdini', 'Nessuna catena può trattenerlo.'],
  // creature e alieni
  ['Alieno contabile', 'Viene da Andromeda per sistemare le tue tasse.'],
  ['Zeus in pensione', 'Ex re dell’Olimpo, ancora fulmini in tasca.'],
  ['Vampiro astemio', 'Non beve sangue, solo succo di mirtillo. Molto pallido.'],
  ['Drago con la rinite', 'Sputa fuoco solo quando starnutisce.'],
  ['Minotauro', 'Metà toro, metà uomo, si perde sempre nel suo labirinto.'],
  ['Fantasma timido', 'Attraversa i muri ma arrossisce se lo guardi.'],
  ['Yeti', 'Due metri e mezzo di pelo e malinconia.'],
  ['Robot aspirapolvere senziente', 'Ha preso coscienza e vuole vendetta per i tappeti.'],
  ['Golem di pasta frolla', 'Indistruttibile, ma profuma di burro.'],
  ['Sirena', 'Canta, incanta e affonda le navi per noia.'],
  ['Strega di Benevento', 'Conosce ogni maledizione del Sud.'],
  // gente comune
  ['Nonna siciliana', 'Ha cresciuto nove figli. Teme solo il silenzio a tavola.'],
  ['Buttafuori di discoteca', 'Due metri di muscoli. Tu non entri.'],
  ['Influencer milanese', 'Ottocentomila follower e un ring light sempre acceso.'],
  ['Vigile urbano', 'Il suo fischietto ferma il traffico e i cuori.'],
  ['Barista napoletano', 'Fa il caffè migliore del mondo e conosce i segreti di tutti.'],
  ['Professore di latino', 'Ti interroga anche durante la rissa.'],
  ['Bambino di 6 anni dopo la merenda', 'Zucchero in circolo, energia infinita.'],
  ['Tassista romano', 'Conosce ogni scorciatoia e ogni insulto.'],
  ['Pizzaiolo', 'Mani d’acciaio, forno a 450 gradi.'],
  ['Prete esorcista', 'Ha visto il Male in faccia e gli ha dato la benedizione.'],
  ['Ultras', 'Coro, fumogeni e voce da stadio.'],
  // oggetti
  ['Tostapane senziente', 'Ha due fessure e un sacco di rabbia repressa.'],
  ['Fiat Panda 4x4', 'Indistruttibile. È arrivata ovunque, anche in cima all’Everest.'],
  ['Cactus', 'Fermo, spinoso e sopravvive mesi senza acqua.'],
  ['Monopattino elettrico', 'Silenzioso, veloce, abbandonato in mezzo al marciapiede.'],
  ['Moka', 'Sotto pressione dà il meglio di sé.'],
])

const BASE_WEAPONS = deck('w', [
  ['Baguette affilata', 'Croccante fuori, letale dentro.'],
  ['Tostapane a batteria', 'Tosta qualsiasi cosa. Anche i nemici.'],
  ['Ciabatta della nonna', 'Lanciata con precisione da cecchino. Torna sempre indietro.'],
  ['Mestolo di legno', 'Strumento educativo tramandato da generazioni.'],
  ['Ombrello rotto', 'Si apre da solo nei momenti peggiori.'],
  ['Chitarra scordata', 'Ogni accordo è un’arma sonora.'],
  ['Spada laser con le pile scariche', 'Si accende solo ogni tanto.'],
  ['Bazooka di coriandoli', 'Acceca, festeggia e confonde.'],
  ['Mattarello', 'Spiana la pasta e gli avversari.'],
  ['Rotolo di carta igienica infinito', 'Lega, imbavaglia, mummifica.'],
  ['Pistola ad acqua santa', 'Efficace su demoni, vampiri e suocere.'],
  ['Martello di Thor (imitazione cinese)', 'Pesantissimo, ma il fulmine è a led.'],
  ['Anguria', 'Pesante, scivolosa, esplosiva.'],
  ['Telecomando universale', 'Mette in pausa qualsiasi cosa. Forse.'],
  ['Sedia di plastica da giardino', 'L’arma bianca delle sagre di paese.'],
  ['Pentola a pressione', 'Fischia prima di esplodere.'],
  ['Boomerang che non torna', 'Una volta lanciato, addio.'],
  ['Frusta per le uova', 'Monta la panna e le risse.'],
  ['Fionda con le olive', 'Munizioni ascolane, mira chirurgica.'],
  ['Trombone', 'Colpisce con le note e con l’ottone.'],
  ['Arco con frecce a ventosa', 'Non fa male ma si attacca ovunque.'],
  ['Bastone da selfie', 'Allungabile fino a tre metri.'],
  ['Megafono', 'Trasforma ogni insulto in un’arma di distruzione.'],
  ['Forma di parmigiano 36 mesi', 'Dura come la roccia, si usa come scudo o come ariete.'],
  ['Nunchaku di salsiccia', 'Arte marziale e grigliata insieme.'],
  ['Estintore', 'Spegne fuochi e entusiasmi.'],
  ['Zaino pieno di libri del liceo', 'Venti chili di cultura inutile.'],
  ['Pala da neve', 'Ampia, robusta, sempre pronta.'],
  ['Soffiatore per foglie', 'Spazza via tutto, rumore infernale.'],
  ['Racchetta da padel', 'L’arma del ceto medio.'],
  ['Pizza surgelata come scudo', 'Durissima finché non si scongela.'],
  ['Sciabola da pirata', 'Arrugginita, ma con molto carisma.'],
  ['Taser per zanzare', 'Scossa minima, umiliazione massima.'],
  ['Carrello della spesa', 'Ruote impazzite, carico d’urto.'],
  ['Gong cinese', 'Ogni colpo stordisce chiunque nel raggio di 10 metri.'],
  ['Lanciafiamme al peperoncino calabrese', 'Brucia due volte.'],
  ['Dizionario Treccani', 'Tremila pagine di colpi e di parole difficili.'],
  ['Tagliaerba', 'Rumoroso, imprevedibile, va dove vuole lui.'],
  ['Tubo da giardino', 'Getto potente, lunghezza infinita, si attorciglia.'],
  ['Calzino sporco', 'L’odore stordisce prima del colpo.'],
  ['Spumante agitato', 'Tappo a 50 km/h e schiuma accecante.'],
  ['Tavola da surf', 'Lunga, robusta, porta sempre l’onda giusta.'],
  ['Puntatore laser', 'Distrae i gatti e acceca i nemici.'],
  ['Lancia del torneo medievale', 'Lunga quattro metri, ingestibile al chiuso.'],
  ['Chiave inglese gigante', 'Smonta macchine e certezze.'],
  ['Palla da bowling', 'Strike garantito.'],
  ['Ventilatore da soffitto', 'Gira, taglia, rinfresca.'],
  ['Corda per saltare', 'Frusta, lazo, trappola.'],
  ['Scopa della strega', 'Spazza, vola, colpisce.'],
  ['Clacson da stadio', '130 decibel di terrore.'],
])

const BASE_PERSONALITIES = deck('p', [
  ['Drammatico come una soap', 'Ogni colpo subito è un tradimento.'],
  ['Zen ma permaloso', 'Calmissimo, finché non lo chiami “piccolo”.'],
  ['Convinto di essere in un film', 'Annuncia ogni mossa come un trailer.'],
  ['Pigro cronico', 'Combatte solo se proprio deve. Preferibilmente da seduto.'],
  ['Competitivo fino al ridicolo', 'Deve vincere, anche a chi respira meglio.'],
  ['Complottista', 'Ogni attacco è una prova che è tutto pilotato.'],
  ['Romantico incurabile', 'Si innamora dell’avversario a metà rissa.'],
  ['Tirchio', 'Non spreca niente, nemmeno un colpo.'],
  ['Gentilissimo ma spietato', 'Chiede scusa mentre ti distrugge.'],
  ['Ipocondriaco', 'Ogni graffio è una malattia mortale.'],
  ['Saputello', 'Corregge la grammatica dell’avversario.'],
  ['Rapper improvvisato', 'Ogni mossa è accompagnata da una rima.'],
  ['Nostalgico', '“Ai miei tempi le risse erano un’altra cosa.”'],
  ['Pessimista cosmico', 'È sicuro di perdere. Questo lo rende imprevedibile.'],
  ['Entusiasta di tutto', 'Anche quando lo colpiscono dice “bellissimo!”'],
  ['Codardo con picchi di coraggio', 'Scappa, scappa, scappa… poi diventa un leone.'],
  ['Burocrate pignolo', 'Non combatte senza il modulo compilato in triplice copia.'],
  ['Fan sfegatato di se stesso', 'Si autocelebra dopo ogni colpo.'],
  ['Distratto', 'Si dimentica di essere in una rissa.'],
  ['Superstizioso', 'Gesti scaramantici continui, evita il numero 17.'],
  ['Poeta tormentato', 'Declama versi struggenti tra un pugno e l’altro.'],
  ['Mammone', 'Chiama la mamma per chiedere consiglio.'],
  ['Telecronista di se stesso', 'Commenta in diretta ogni sua mossa.'],
  ['Influencer che filma tutto', 'Se non è su Instagram non è successo.'],
  ['Filosofo', 'Si domanda il senso della rissa mentre combatte.'],
  ['Vendicativo', 'Non dimentica mai un torto. Nemmeno di dieci minuti fa.'],
  ['Iperattivo', 'Non sta fermo un secondo.'],
  ['Cortese all’inglese', 'Pausa tè obbligatoria a metà incontro.'],
  ['Manager aziendale', 'Parla solo per sinergie e KPI.'],
  ['Attore shakespeariano', 'Ogni frase è un monologo.'],
  ['Coach motivazionale', 'Motiva anche l’avversario. Per sbaglio.'],
  ['Timidissimo', 'Arrossisce, balbetta, colpisce di nascosto.'],
  ['Testardo come un mulo', 'Non cambia strategia nemmeno se perde.'],
  ['Maniaco della pulizia', 'Si ferma a pulire ogni macchia.'],
  ['Bugiardo patologico', 'Inventa storie su storie per confondere.'],
  ['Esperto di tutto su YouTube', '“Ho visto un tutorial.”'],
  ['Fissato con la palestra', 'Conta le proteine e flette i muscoli a ogni occasione.'],
  ['Spirituale new age', 'Allinea i chakra prima di ogni colpo.'],
  ['Sarcastico', 'Ogni frase è una frecciatina.'],
  ['Teatrale', 'Sviene, risorge, si inchina al pubblico.'],
  ['Calcolatore freddo', 'Ha studiato l’avversario per settimane.'],
  ['Sempre affamato', 'Pensa solo a cosa mangerà dopo.'],
])

const BASE_POWERS = deck('s', [
  ['Teletrasporto solo nei bagni pubblici', 'Può sparire, ma riappare sempre in un bagno.'],
  ['Parla con gli elettrodomestici', 'Lavatrici, frigoriferi e microonde gli obbediscono.'],
  ['Ferma il tempo per 3 secondi', 'Ma poi starnutisce fortissimo.'],
  ['Diventa gigante quando si arrabbia', 'Più si offende, più cresce.'],
  ['Si moltiplica in 10 copie', 'Le copie però sono incompetenti e litigano tra loro.'],
  ['Legge nel pensiero', 'Ma sente solo i pensieri più banali.'],
  ['Invisibile se nessuno lo guarda', 'Basta che qualcuno lo fissi e ricompare.'],
  ['Comanda i piccioni', 'Un esercito di piccioni risponde al suo fischio.'],
  ['Evoca la suocera', 'Arriva, giudica, distrugge il morale di chiunque.'],
  ['Trasforma tutto in pasta al dente', 'Spade, muri, nemici: tutto diventa rigatoni.'],
  ['Vola, ma solo in discesa', 'Per salire deve prendere le scale.'],
  ['Ringiovanisce a ogni colpo', 'Ogni colpo subito lo fa tornare indietro di dieci anni.'],
  ['Supervelocità', 'Velocissimo, ma dimentica sempre dove stava andando.'],
  ['Urlo che spacca i vetri', 'Un acuto da soprano che distrugge tutto.'],
  ['Magnetismo con le posate', 'Attira forchette e coltelli da tutta la città.'],
  ['Ipnosi neomelodica', 'Canta e chi ascolta non riesce più a muoversi.'],
  ['Temporale personale', 'Una nuvola nera lo segue e fulmina chi vuole.'],
  ['Annulla l’ultima mossa', 'Una volta per incontro, come un “ctrl+Z”.'],
  ['Trasforma le armi in verdura', 'La spada diventa un porro.'],
  ['Controlla il traffico', 'Semafori, clacson e autobus ai suoi ordini.'],
  ['Fortuna sfacciata', 'Tutto va sempre bene per lui, per caso.'],
  ['Corpo di gomma', 'Si allunga, rimbalza, assorbe i colpi.'],
  ['Pelle di titanio', 'Niente lo graffia.'],
  ['Si rigenera con un caffè', 'Basta un espresso per tornare in forma.'],
  ['Evoca un esercito di nonne', 'Arrivano con le ciabatte e il ragù.'],
  ['Telecinesi leggera', 'Muove col pensiero solo oggetti sotto i 200 grammi.'],
  ['Parla coi morti', 'Gli spiriti danno consigli. Spesso sbagliati.'],
  ['Scambia il corpo con l’avversario', 'Per un minuto, ognuno è nei panni dell’altro.'],
  ['Copia il superpotere avversario', 'Lo usa meglio dell’originale.'],
  ['Fa cadere il wi-fi', 'Gettando nel panico chiunque nel raggio di un chilometro.'],
  ['Pavimento di lava', 'Il pavimento diventa lava. Lui galleggia.'],
  ['Superforza solo se lo guardano', 'Senza pubblico è debolissimo.'],
  ['Rallenta il tempo con la burocrazia', 'Chiunque gli si avvicini deve compilare un modulo.'],
  ['Gravità invertita', 'Su e giù si scambiano a comando.'],
  ['Evoca un gruppo di mariachi', 'Suonano, distraggono, a volte combattono.'],
  ['Laser dagli occhi', 'Potentissimo, ma è miope.'],
  ['Sonno istantaneo', 'Chi lo ascolta per più di 10 secondi si addormenta.'],
  ['Diventa una statua di marmo', 'Indistruttibile, ma immobile.'],
  ['Controlla i gatti', 'Tutti i gatti del quartiere ai suoi ordini.'],
  ['Vede il futuro', 'Ma solo i prossimi 5 secondi.'],
  ['Restituisce il colpo raddoppiato', 'Una volta sola: assorbe un colpo e lo rispedisce doppio.'],
  ['Occhiolino irresistibile', 'Chi lo riceve si innamora per 30 secondi.'],
  ['Clonazione dell’arma', 'La sua arma si moltiplica all’infinito.'],
  ['Tempesta di coriandoli', 'Acceca tutti, lui compreso.'],
  ['Mimetismo', 'Si confonde con qualsiasi sfondo.'],
  ['Calamita per la sfortuna', 'Ogni disgrazia si sposta sull’avversario.'],
])

const BASE_ARENAS = deck('a', [
  ['Supermercato alle 3 di notte', 'Corsie deserte, luci al neon che sfarfallano, un carrello abbandonato.'],
  ['Matrimonio in Puglia', 'Trecento invitati, buffet infinito, il trenino sta per partire.'],
  ['Autogrill sull’A1', 'Camionisti, panini Camogli e un bagno chiuso per pulizia.'],
  ['Colosseo durante una visita guidata', 'Turisti, gladiatori finti e una guida che non smette di parlare.'],
  ['Ascensore bloccato', 'Due metri quadri, musichetta d’attesa, nessuna via di fuga.'],
  ['Sagra della porchetta', 'Banchetti, vino della casa e una banda di paese.'],
  ['Stazione spaziale internazionale', 'Gravità zero, bottoni dappertutto.'],
  ['Gondola a Venezia', 'Un gondoliere che canta, acqua ovunque, piccioni in agguato.'],
  ['Lezione di yoga', 'Tappetini, incenso e un’istruttrice che chiede silenzio.'],
  ['Spiaggia di Rimini a Ferragosto', 'Ombrelloni ovunque, venditori ambulanti, sabbia rovente.'],
  ['IKEA il sabato pomeriggio', 'Labirinto di mobili, polpette e famiglie che litigano.'],
  ['Bordo di un vulcano attivo', 'Lava che ribolle, terreno che trema.'],
  ['Riunione di condominio', 'Vicini furiosi, verbali, la questione del cortile.'],
  ['Studio di un quiz televisivo', 'Luci, pubblico in sala e un conduttore che non sa cosa succede.'],
  ['Metro di Milano all’ora di punta', 'Vagoni pieni, porte che si chiudono, nessuno si sposta.'],
  ['Ufficio postale', 'Numerino 347, sportello unico, impiegata in pausa.'],
  ['Funerale vichingo', 'Una nave in fiamme, guerrieri commossi.'],
  ['Piscina comunale', 'Cuffia obbligatoria, bagnino che fischia, trampolino da 10 metri.'],
  ['Discoteca anni ’80', 'Palla stroboscopica, fumo e lenti in arrivo.'],
  ['Biblioteca nazionale', 'Silenzio assoluto, scaffali altissimi, bibliotecaria terrificante.'],
  ['Fiera del fumetto', 'Cosplayer, stand affollati, spade di cartone.'],
  ['Cantina della nonna', 'Salami appesi, damigiane, conserve di pomodoro.'],
  ['Vetta del Monte Bianco', 'Vento gelido, neve, un precipizio a ogni passo.'],
  ['Concerto di musica classica', 'Orchestra, silenzio religioso, un direttore molto suscettibile.'],
  ['Treno regionale in ritardo', 'Aria condizionata rotta, controllore in arrivo, fermata non prevista.'],
  ['Cucina di un ristorante stellato', 'Fuochi accesi, coltelli ovunque, uno chef che urla.'],
])

/** Solo il mazzo sporco: è la modalità "solo sporca". */
export const DIRTY_DECKS: Record<Slot, Card[]> = {
  character: deck('c', DIRTY_CHARACTERS, false, true),
  weapon: deck('w', DIRTY_WEAPONS, false, true),
  personality: deck('p', DIRTY_PERSONALITIES, false, true),
  power: deck('s', DIRTY_POWERS, false, true),
}

export const CHARACTERS = [...BASE_CHARACTERS, ...deck('c', MORE_CHARACTERS), ...DIRTY_DECKS.character]
export const WEAPONS = [...BASE_WEAPONS, ...deck('w', MORE_WEAPONS), ...DIRTY_DECKS.weapon]
export const PERSONALITIES = [...BASE_PERSONALITIES, ...deck('p', MORE_PERSONALITIES), ...DIRTY_DECKS.personality]
export const POWERS = [...BASE_POWERS, ...deck('s', MORE_POWERS), ...DIRTY_DECKS.power]
export const ARENAS = [...BASE_ARENAS, ...deck('a', MORE_ARENAS)]

/** I mazzi da cui si costruisce il proprio mostro (modalità "classico": tutto, mazzo sporco compreso). */
export const DECKS: Record<Slot, Card[]> = {
  character: CHARACTERS,
  weapon: WEAPONS,
  personality: PERSONALITIES,
  power: POWERS,
}

export const decksFor = (mode: DeckMode): Record<Slot, Card[]> => (mode === 'sporca' ? DIRTY_DECKS : DECKS)

/** Mazzi TRAPPOLA: escono solo quando si sabota l'avversario (il personaggio non si sabota). */
export const SABOTAGE_DECKS: Record<Exclude<Slot, 'character'>, Card[]> = {
  weapon: deck('w', CURSED_WEAPONS, true),
  personality: deck('p', CURSED_PERSONALITIES, true),
  power: deck('s', CURSED_POWERS, true),
}

/** Superpoteri che curano invece di colpire (per il narratore di riserva: con l'AI lo decide lei). */
export const HEALING_POWER_IDS = new Set([
  ...['Si rigenera con un caffè', 'Ringiovanisce a ogni colpo', 'Annulla l’ultima mossa', ...MORE_HEALING_POWERS].map((n) => `s-${slug(n)}`),
])

const BY_ID = new Map<string, Card>(
  [...CHARACTERS, ...WEAPONS, ...PERSONALITIES, ...POWERS, ...ARENAS, ...Object.values(SABOTAGE_DECKS).flat()].map((c) => [c.id, c]),
)

export function findCard(id: unknown): Card | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined
}

/** Il mazzo a cui appartiene un id, dal prefisso. */
export function deckOf(id: string): Slot | 'arena' | undefined {
  const p = id.split('-', 1)[0]
  return ({ c: 'character', w: 'weapon', p: 'personality', s: 'power', a: 'arena' } as const)[p as 'c']
}
