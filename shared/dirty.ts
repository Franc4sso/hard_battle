/**
 * Il MAZZO SPORCO: carte volgari e scorrette, da bar tra adulti.
 * In modalità "classico" si mischiano ai mazzi normali, in "solo sporca" ci sono solo queste.
 * Regola: la volgarità sta su corpo, fluidi, sesso e figuracce; i potenti si prendono in giro
 * e perdono in modo ridicolo. Niente insulti a gruppi di persone: il narratore li rifiuterebbe.
 */
type Row = [string, string]

export const DIRTY_CHARACTERS: Row[] = [
  ['Hitler', 'Bocciato all’accademia d’arte, non l’ha mai superata. Urla, pesta i piedi, e ha un solo testicolo.'],
  ['Stalin', 'Baffoni d’acciaio. Chi lo colpisce sparisce dalla foto ricordo.'],
  ['Mussolini a torso nudo', 'Mascella in fuori, dal balcone urla a un pubblico che non c’è. Finisce sempre a testa in giù.'],
  ['Nonno in carrozzina truccata', 'Motore da moto, 80 all’ora, clacson da camion. Investe chiunque e non chiede scusa.'],
  ['Kim Jong-un', 'Taglio di capelli obbligatorio per legge. Ha un bottone rosso, non sa a cosa serve.'],
  ['Napoleone complessato', 'Un metro e mezzo di complessi. Attacca chi è più alto, cioè tutti.'],
  ['Caligola', 'Ha nominato senatore il cavallo. Al cavallo è andata meglio che a te.'],
  ['Rasputin', 'Avvelenato, sparato, affogato. Ancora in piedi, e ancora ubriaco.'],
  ['Berlusconi', 'Sorriso incollato, cerone, barzelletta pronta. Ti compra l’avversario a metà round.'],
  ['Nonna che ti riempie il piatto', 'Non accetta un no. Ti ingozza finché non ti muovi più.'],
  ['Ubriaco della sagra', 'Dodici birre e la convinzione di essere un pugile. Vomita a comando.'],
  ['Idraulico col sedere di fuori', 'Si china e il pubblico sviene. Arma letale: lo spacco dei pantaloni.'],
  ['Influencer in bagno', 'Si fa i selfie sul water. Ti filma mentre perdi e ti mette su internet.'],
  ['Prete con la Ferrari', 'Elemosina in contanti. Benedice, poi ti sfonda.'],
  ['Nudista di Capocotta', 'Tutto al vento, abbronzatura integrale. Nessuno vuole toccarlo.'],
  ['Tamarro con la Punto', 'Neon sotto, cassa dietro, catena d’oro finta. Ti travolge a 30 all’ora con il bass boost.'],
  ['Zia che ti pizzica le guance', 'Dita come tenaglie, rossetto ovunque. «Ma come sei cresciuto» e ti stacca la faccia.'],
  ['Carabiniere della barzelletta', 'Ne servono due: uno legge e l’altro scrive. Qui è da solo.'],
  ['Elon Musk', 'Ha comprato l’arena e ha licenziato l’arbitro. Il razzo esplode al decollo.'],
  ['Vecchio al bar che sa tutto', 'Ha giocato in serie A, ha fatto la guerra, ha avuto tua madre. Dice lui.'],
  ['Cugino che spaccia al matrimonio', 'Bustine nella tasca della giacca buona. Occhi a palla, balla da solo.'],
  ['Enrico Papi', 'Urla «SARABANDA» e tira un pianoforte. Nessuno sa perché è ancora in tv.'],
]

export const DIRTY_WEAPONS: Row[] = [
  ['Dildo di cemento', 'Pesa dodici chili. Un colpo e vai all’ospedale, con una storia da non raccontare.'],
  ['Calzino di una settimana', 'Si regge in piedi da solo. Chi lo annusa cade.'],
  ['Sacchetto di cacca di cane', 'Raccolta con cura, lanciata senza. Non si lava via.'],
  ['Water intasato', 'Chiuso da tre giorni. Si apre in faccia all’avversario.'],
  ['Cintura di papà', 'Si sfila con un gesto solo. Il rumore basta a farti correre.'],
  ['Mutande della nonna', 'Taglia XXXL, elastico da catapulta. Avvolgono e soffocano.'],
  ['Clistere industriale', 'Pressione da idrante. Entra da dietro e il resto lo immagini.'],
  ['Peperoncino calabrese nel sedere', 'Si applica all’avversario, mai a se stessi. Effetto istantaneo.'],
  ['Bottiglia di piscio del camionista', 'Tiepida, da autogrill. Si tira a tappo aperto.'],
  ['Grembiule unto della friggitoria', 'Vent’anni di olio esausto. Schiaffeggia e lascia il segno.'],
  ['Gatto incazzato', 'Si lancia sulla faccia e si attacca con tutte e quattro le zampe.'],
  ['Rasoio del nonno', 'Non lo pulisce dal 1974. Raderà qualcosa, non si sa cosa.'],
  ['Padella con l’uovo attaccato', 'Non viene via nemmeno con la spugna. In faccia resta.'],
  ['Bidet volante', 'Strappato dal muro con i tubi ancora attaccati. Spruzza mentre vola.'],
]

export const DIRTY_PERSONALITIES: Row[] = [
  ['Ubriaco fradicio', 'Non sente i colpi, non vede l’avversario, vomita a sorpresa.'],
  ['Arrapato', 'Qualsiasi cosa gli sembra un invito. Distratto, ma insistente.'],
  ['Con la diarrea', 'Corre, ma non verso l’avversario. Arma a sorpresa.'],
  ['Stronzo patentato', 'Colpisce alle spalle, ruba la mossa, nega tutto.'],
  ['Bestemmiatore seriale', 'Ogni colpo preso scatena una litania che fa tremare l’arena.'],
  ['Esibizionista nudo', 'Si spoglia a metà rissa. L’avversario si distrae, il pubblico pure.'],
  ['Fatto come una pigna', 'Vede draghi, ride, attacca il drago. Il drago è l’avversario, forse.'],
  ['Piagnone che chiama la mamma', 'Piange al primo colpo. La mamma arriva e picchia tutti.'],
  ['Flatulento', 'Scoregge a comando, con precisione. Arma chimica.'],
  ['Megalomane in mutande', 'Si crede imperatore, ma ha dimenticato i pantaloni.'],
]

export const DIRTY_POWERS: Row[] = [
  ['Rutto sismico', 'Un rutto da 9 Richter. Cadono i denti e i muri.'],
  ['Scoreggia infuocata', 'Con l’accendino diventa un lanciafiamme. Brucia anche chi la fa.'],
  ['Sputo con la pipì dentro', 'Nessuno sa come faccia. Nessuno vuole saperlo.'],
  ['Nudità accecante', 'Si spoglia e l’avversario si copre gli occhi per tre round.'],
  ['Pisciata a pressione', 'Dodici birre di autonomia. Getto da idrante.'],
  ['Vomito a getto', 'Mirato, abbondante, con pezzi riconoscibili.'],
  ['Corruzione in contanti', 'Compra l’arbitro, il pubblico e un round intero.'],
  ['Bestemmia tuonante', 'Una sola, perfetta. Il cielo si apre e qualcosa cade sull’avversario.'],
  ['Mano morta', 'Si allunga dove non dovrebbe. L’avversario si gira e prende il colpo.'],
  ['Sudore acido', 'Dopo due round puzza così tanto che l’avversario si arrende.'],
]
