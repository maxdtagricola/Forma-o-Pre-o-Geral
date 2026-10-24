import { ALTURAS, CONTORNO_X, CONTORNO_Y, MAO_DA_ESPADA, PE_NO_QUADRO, PESO_ESPADA, TUFO_X, TUFO_Y } from './samuraiSilhueta'

// O samurai do vídeo de fundo, desenhado por cima da paisagem (o vídeo não tem mais ele). No lugar dele,
// respira e o manto balança no vento. A cada 5 minutos ele joga um dado: com 3 ou 6, faz a jornada — anda,
// com passos calmos, até perto da lua (vai ficando menor e mais enevoado), contempla, some na névoa e
// reaparece no lugar dele quando a névoa se abre; com outro número, fica onde está até o próximo dado.
// Medidas em unidades da altura do quadro do vídeo (16:9), com a origem no chão entre os pés (y negativo =
// pra cima); a silhueta vem de samuraiSilhueta.ts.

// --- o dado ---
/** De quanto em quanto tempo ele joga o dado — no relógio (10:00, 10:05, 10:10…), não desde que a página abriu. */
export const MINUTOS_ENTRE_DADOS = 5
const INTERVALO_DO_DADO = MINUTOS_ENTRE_DADOS * 60 * 1000
/** As faces que mandam andar. */
export const FACES_QUE_ANDAM = [3, 6]

/** O dado da rodada (1 a 6), sorteado a partir do número da rodada: o mesmo em todas as telas (quando ele
 * anda, anda em todos os computadores ao mesmo tempo), e recarregar a página não joga de novo. */
export function dadoDaRodada(rodada: number): number {
  // embaralhamento de 32 bits (o "fmix" do MurmurHash3)
  let x = (rodada ^ 0x9e3779b9) | 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  x ^= x >>> 16
  return ((x >>> 0) % 6) + 1
}

export interface Lancamento {
  rodada: number
  /** Quando foi jogado (ms, como Date.now()). */
  quando: number
  dado: number
  anda: boolean
}

/** O último dado jogado até o momento `ms` (como Date.now()). */
export function ultimoLancamento(ms: number): Lancamento {
  const rodada = Math.floor(ms / INTERVALO_DO_DADO)
  const dado = dadoDaRodada(rodada)
  return { rodada, quando: rodada * INTERVALO_DO_DADO, dado, anda: FACES_QUE_ANDAM.includes(dado) }
}

/** Quando sai o próximo dado (ms). */
export function proximoLancamento(ms: number): number {
  return (Math.floor(ms / INTERVALO_DO_DADO) + 1) * INTERVALO_DO_DADO
}

// --- a jornada (segundos desde que o dado mandou andar) ---
const ANDANDO = 30
const CONTEMPLANDO = 8
const SUMINDO = 8
/** A névoa de lá se desfaz (4 s), a paisagem fica sozinha (1 s), outra névoa se forma no lugar de sempre (2 s). */
const VAZIO = 7
const APARECENDO = 8
export const DURACAO_DA_JORNADA = ANDANDO + CONTEMPLANDO + SUMINDO + VAZIO + APARECENDO

const PASSOS_POR_SEGUNDO = 0.95
/** Segundos pra pegar o ritmo ao sair e pra parar no fim. */
const RAMPA = 2.2
/** Quanto cada passo (~60 cm) afasta da câmera, em "distâncias do lugar de sempre" (z = 1 ali). */
const AVANCO_POR_PASSO = 0.105
/** Onde o chão encontra a névoa lá longe (altura no quadro, 0 a 1) e o ponto embaixo da lua (largura). */
const HORIZONTE = 0.712
const RUMO_DA_LUA = 0.557
/** Névoa com a distância: quanto mais longe, mais a silhueta se mistura com a cor da névoa. */
const NEVOA_POR_DISTANCIA = 0.21
const COR_DA_NEVOA: [number, number, number] = [172, 172, 177]
/** O capim claro da faixa de névoa (umas folhas passam na frente dos pés, como no desenho original). */
const COR_DO_CAPIM: [number, number, number] = [190, 190, 196]

const suave = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
/** ∫ de 0 a x de suave (pra contar os passos nas rampas). */
const integralSuave = (x: number) => x * x * x - (x * x * x * x) / 2

/** Passos dados até `tau` segundos de caminhada (o ritmo cresce e diminui nas rampas). */
function passosAte(tau: number): number {
  const D = ANDANDO
  const R = RAMPA
  if (tau <= 0) return 0
  if (tau < R) return PASSOS_POR_SEGUNDO * R * integralSuave(tau / R)
  if (tau < D - R) return PASSOS_POR_SEGUNDO * (R / 2 + (tau - R))
  if (tau < D) return PASSOS_POR_SEGUNDO * (D - R - R * integralSuave((D - tau) / R))
  return PASSOS_POR_SEGUNDO * (D - R)
}
const PASSOS_ATE_LA = passosAte(ANDANDO)
const LONGE = 1 + AVANCO_POR_PASSO * PASSOS_ATE_LA

export interface Neblina {
  /** Distância em que ela está (a do samurai). */
  z: number
  alfa: number
  /** Segundos desde que ela começou (ela vai sendo levada pelo vento). */
  deriva: number
}

export interface Pose {
  /** Distância da câmera (1 = o lugar de sempre). */
  z: number
  /** 0 parado, 1 andando (entre um e outro, pegando ou perdendo o ritmo). */
  andar: number
  /** Passos dados (a fase da caminhada). */
  passo: number
  opacidade: number
  neblina: Neblina | null
}

/** No lugar de sempre (respirando, com o manto no vento — o desenho cuida disso). */
export const POSE_NO_LUGAR: Pose = { z: 1, andar: 0, passo: 0, opacidade: 1, neblina: null }

/** Onde o samurai está `s` segundos depois de o dado mandar andar (fora da jornada: no lugar dele). */
export function poseDaJornada(segundos: number): Pose {
  if (!(segundos >= 0 && segundos < DURACAO_DA_JORNADA)) return POSE_NO_LUGAR
  let s = segundos
  if (s < ANDANDO) {
    const passo = passosAte(s)
    const andar = s < RAMPA ? suave(s / RAMPA) : s > ANDANDO - RAMPA ? suave((ANDANDO - s) / RAMPA) : 1
    return { z: 1 + AVANCO_POR_PASSO * passo, andar, passo, opacidade: 1, neblina: null }
  }
  s -= ANDANDO
  const longe = { z: LONGE, andar: 0, passo: PASSOS_ATE_LA }
  if (s < CONTEMPLANDO) return { ...longe, opacidade: 1, neblina: null }
  s -= CONTEMPLANDO
  // a névoa vem e o envolve
  if (s < SUMINDO) {
    const x = s / SUMINDO
    return { ...longe, opacidade: 1 - suave(x), neblina: { z: LONGE, alfa: 0.55 * suave(x / 0.6), deriva: s } }
  }
  s -= SUMINDO
  if (s < VAZIO) {
    // a névoa de lá se desfaz; no fim, outra se forma no lugar de sempre
    if (s < 4) return { ...longe, opacidade: 0, neblina: { z: LONGE, alfa: 0.55 * (1 - suave(s / 4)), deriva: SUMINDO + s } }
    if (s < VAZIO - 2) return { ...longe, opacidade: 0, neblina: null }
    return { z: 1, andar: 0, passo: 0, opacidade: 0, neblina: { z: 1, alfa: 0.55 * suave((s - (VAZIO - 2)) / 2), deriva: s - (VAZIO - 2) } }
  }
  s -= VAZIO
  // a névoa se abre e ele está lá
  const x = s / APARECENDO
  return { z: 1, andar: 0, passo: 0, opacidade: suave(s / 6), neblina: { z: 1, alfa: 0.55 * (1 - suave(x)), deriva: 2 + s } }
}

/** Onde o samurai está no relógio (`ms` como Date.now()): na jornada, se o dado da rodada mandou andar e ela
 * ainda não acabou; senão, no lugar dele. `dado` troca o dado de verdade (pros testes). */
export function poseNoRelogio(ms: number, dado?: number): Pose {
  const l = ultimoLancamento(ms)
  const anda = dado === undefined ? l.anda : FACES_QUE_ANDAM.includes(dado)
  return anda ? poseDaJornada((ms - l.quando) / 1000) : POSE_NO_LUGAR
}

// --- desenho ---

export interface Tela {
  /** Tamanho da área (px de CSS) e densidade de pixels. */
  largura: number
  altura: number
  dpr: number
}

export interface Caixa {
  x: number
  y: number
  w: number
  h: number
}

/** Onde o quadro do vídeo (16:9, object-fit: cover) fica na tela, em px do canvas. */
function quadroNaTela(tela: Tela) {
  const w = Math.max(tela.largura, (tela.altura * 16) / 9)
  const h = (w * 9) / 16
  return { x: ((tela.largura - w) / 2) * tela.dpr, y: ((tela.altura - h) / 2) * tela.dpr, w: w * tela.dpr, h: h * tela.dpr }
}

function misturar(a: [number, number, number], b: [number, number, number], k: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`
}

function girar(x: number, y: number, cx: number, cy: number, ang: number): [number, number] {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * c - dy * s, cy + dx * s + dy * c]
}

const { aba: ABA, ombros: OMBROS, cintura: CINTURA, barra: BARRA } = ALTURAS
const PESCOCO = ABA + 0.012
/** Folhas de capim na frente dos pés: [x da base, altura, inclinação, fase do balanço]. */
const CAPIM: [number, number, number, number][] = [
  [-0.03, 0.03, 0.011, 0.0],
  [0.027, 0.036, 0.013, 1.7],
]

/** Onde ficam os pés na distância z (o chão sobe em direção ao horizonte e vai pra baixo da lua). */
function chaoNaTela(q: ReturnType<typeof quadroNaTela>, z: number) {
  const u = RUMO_DA_LUA + (PE_NO_QUADRO.u - RUMO_DA_LUA) / z
  const v = HORIZONTE + (PE_NO_QUADRO.v - HORIZONTE) / z
  return { x: q.x + u * q.w, y: q.y + v * q.h, escala: q.h / z }
}

function folgaDe(q: ReturnType<typeof quadroNaTela>, c: Caixa): Caixa {
  const f = 4 + (8 * q.h) / 1440
  return { x: c.x - f, y: c.y - f, w: c.w + 2 * f, h: c.h + 2 * f }
}

/** Desenha o samurai (pés, silhueta e o capim na frente) na `pose`, sem transparência (quem chama esmaece a
 * figura inteira de uma vez), e devolve a área que sujou no canvas. `t` (segundos) move a respiração e o
 * vento. */
export function desenharFigura(ctx: CanvasRenderingContext2D, tela: Tela, t: number, pose: Pose): Caixa | null {
  const q = quadroNaTela(tela)
  const z = pose.z
  const { x: ox, y: oy, escala } = chaoNaTela(q, z)
  const nevoaDaDistancia = 1 - Math.exp(-NEVOA_POR_DISTANCIA * (z - 1))

  // ritmo do corpo
  const a = pose.andar
  const fase = Math.PI * pose.passo
  const lado = Math.sin(fase) // + com o pé direito no ar, - com o esquerdo
  const sobe = lado * lado // 0 com os dois pés no chão, 1 no meio do passo
  const resp = Math.sin((2 * Math.PI * t) / 5.2)
  const balanco = Math.sin((2 * Math.PI * t) / 9.5)
  const rajada = 0.65 + 0.35 * Math.sin((2 * Math.PI * t) / 7.7) * Math.sin((2 * Math.PI * t) / 3.1 + 1)
  const corpoX = 0.0042 * a * lado + 0.0018 * (1 - a) * balanco
  const corpoY = -0.0055 * a * sobe
  const inclina = 0.0075 * a * lado + 0.0025 * (1 - a) * balanco
  const respira = 0.012 * resp * (1 - 0.5 * a)
  const anguloEspada = 0.02 * (1 - a) * Math.sin((2 * Math.PI * t) / 6.3) + 0.05 * a * Math.sin(fase + 0.7)
  const anguloChapeu = 0.012 * Math.sin((2 * Math.PI * t) / 7.1) + 0.008 * a * Math.sin(fase - 0.4)

  const pontos = new Float64Array(CONTORNO_X.length * 2)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  for (let i = 0; i < CONTORNO_X.length; i++) {
    const x0 = CONTORNO_X[i]
    const y0 = CONTORNO_Y[i]
    let x = x0
    let y = y0
    // respiração: o tronco estica de leve a partir da cintura
    if (y0 < CINTURA) {
      const k = Math.min(1, (CINTURA - y0) / (CINTURA - OMBROS))
      y = CINTURA + (y - CINTURA) * (1 + respira * 0.6)
      x *= 1 + respira * 0.4 * k
    }
    // chapéu (e cabeça): inclina em volta do pescoço
    if (y0 < PESCOCO) {
      const pc = suave((PESCOCO - y0) / 0.02)
      ;[x, y] = girar(x, y, 0, PESCOCO, anguloChapeu * pc)
    }
    // espada: gira na mão
    const pe = PESO_ESPADA[i]
    if (pe > 0) {
      const [gx, gy] = girar(x, y, MAO_DA_ESPADA.x, MAO_DA_ESPADA.y, anguloEspada)
      x += (gx - x) * pe
      y += (gy - y) * pe
    }
    // manto (da cintura pra baixo): balança com o passo e com o vento (que sopra pra direita)
    const r = suave((y0 - CINTURA) / (BARRA - CINTURA))
    if (r > 0) {
      const r2 = r * r
      x += r2 * (0.0065 * a * Math.sin(fase - Math.PI / 2) + 0.003 * rajada * (0.6 + 0.4 * Math.sin((2 * Math.PI * t) / 2.3 + y0 * 35)))
      if (x0 > 0.02) x += r2 * 0.0028 * rajada * Math.sin((2 * Math.PI * t) / 1.9 + y0 * 60) * suave((x0 - 0.02) / 0.04)
      // a barra sobe do lado da perna que vai à frente
      const perna = x0 > 0 ? Math.max(0, lado) : Math.max(0, -lado)
      y -= r2 * r * 0.0058 * a * perna * suave(Math.abs(x0) / 0.03)
    }
    // corpo inteiro: sobe e desce a cada passo e pende pros lados
    ;[x, y] = girar(x, y, 0, 0, inclina)
    x += corpoX
    y += corpoY
    const sx = ox + x * escala
    const sy = oy + y * escala
    pontos[2 * i] = sx
    pontos[2 * i + 1] = sy
    if (sx < minX) minX = sx
    if (sx > maxX) maxX = sx
    if (sy < minY) minY = sy
  }

  const corSilhueta = misturar([0, 0, 0], COR_DA_NEVOA, nevoaDaDistancia)
  ctx.save()
  ctx.fillStyle = corSilhueta
  // a silhueta, com o brilho leve em volta (a lua por trás)
  ctx.shadowColor = `rgba(215,215,222,${(0.32 * (1 - nevoaDaDistancia)).toFixed(3)})`
  ctx.shadowBlur = (6 * q.h) / 1440 / z
  ctx.beginPath()
  ctx.moveTo(pontos[0], pontos[1])
  for (let i = 1; i < CONTORNO_X.length; i++) ctx.lineTo(pontos[2 * i], pontos[2 * i + 1])
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
  // pés no capim (depois da silhueta, cobrindo o brilho da barra): a massa escura com pontas embaixo do
  // manto. Em cima acompanha o corpo, embaixo fica no chão; as pontas balançam no vento e, andando, o lado
  // do pé que sai do chão sobe pra dentro do manto
  const levantaDireito = 0.011 * a * Math.pow(Math.max(0, lado), 0.8)
  const levantaEsquerdo = 0.011 * a * Math.pow(Math.max(0, -lado), 0.8)
  ctx.beginPath()
  for (let i = 0; i < TUFO_X.length; i++) {
    const x0 = TUFO_X[i]
    const y0 = TUFO_Y[i]
    const ponta = suave((y0 - BARRA) / -BARRA) // 0 na barra, 1 no chão
    const levanta = x0 > 0 ? levantaDireito : levantaEsquerdo
    const x = x0 + corpoX * (1 - ponta) + 0.0022 * rajada * ponta * Math.sin((2 * Math.PI * t) / 2.2 + x0 * 80)
    const y = y0 + corpoY * (1 - ponta) - levanta * ponta * suave(Math.abs(x0) / 0.012)
    const sx = ox + x * escala
    const sy = oy + y * escala
    if (i === 0) ctx.moveTo(sx, sy)
    else ctx.lineTo(sx, sy)
  }
  ctx.closePath()
  ctx.fill()
  // umas folhas de capim claro na frente dos pés, balançando no vento
  ctx.fillStyle = misturar(COR_DO_CAPIM, COR_DA_NEVOA, nevoaDaDistancia)
  for (const [bx, alt, incl, ph] of CAPIM) {
    const ponta = incl + 0.004 * rajada * Math.sin((2 * Math.PI * t) / 2.2 + ph)
    const base = ox + bx * escala
    const chao = oy + 0.004 * escala
    const meia = 0.0011 * escala
    ctx.beginPath()
    ctx.moveTo(base - meia, chao)
    ctx.quadraticCurveTo(base + ponta * 0.3 * escala, chao - alt * 0.6 * escala, base + ponta * escala, chao - alt * escala)
    ctx.quadraticCurveTo(base + ponta * 0.3 * escala + meia, chao - alt * 0.6 * escala, base + meia, chao)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  // o capim passa um pouco dos lados da silhueta
  const x0 = Math.min(minX, ox - 0.04 * escala)
  const x1 = Math.max(maxX, ox + 0.06 * escala)
  return folgaDe(q, { x: x0, y: minY, w: x1 - x0, h: oy + 0.008 * escala - minY })
}

/** A névoa que envolve o samurai lá longe (ou que se abre no lugar de sempre): nuvens suaves, levadas
 * pro lado pelo vento. Devolve a área que sujou no canvas. */
export function desenharNeblina(ctx: CanvasRenderingContext2D, tela: Tela, pose: Pose): Caixa | null {
  const neblina = pose.neblina
  if (!neblina || neblina.alfa <= 0.001) return null
  const q = quadroNaTela(tela)
  let caixa: Caixa | null = null
  const { x: cxChao, y: cyChao, escala: ez } = chaoNaTela(q, neblina.z)
  const nx = cxChao + (0.004 + 0.0045 * neblina.deriva) * ez
  const ny = cyChao - 0.15 * ez
  const [cr, cg, cb] = COR_DA_NEVOA
  // [deslocamento x, y, raio x, raio y, força]: um banco de névoa largo e baixo, e outros mais leves
  for (const [dx, dy, rx, ry, k] of [
    [0, 0, 0.26, 0.21, 1],
    [0.09, 0.09, 0.3, 0.09, 0.8],
    [-0.1, 0.07, 0.22, 0.08, 0.7],
    [-0.04, -0.17, 0.15, 0.1, 0.5],
  ] as const) {
    const cx = nx + dx * ez
    const cy = ny + dy * ez
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(rx * ez, ry * ez)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${(neblina.alfa * k).toFixed(3)})`)
    g.addColorStop(0.55, `rgba(${cr},${cg},${cb},${(neblina.alfa * k * 0.55).toFixed(3)})`)
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, 2 * Math.PI)
    ctx.fill()
    ctx.restore()
    caixa = unirCaixas(caixa, { x: cx - rx * ez, y: cy - ry * ez, w: 2 * rx * ez, h: 2 * ry * ez })
  }
  return caixa && folgaDe(q, caixa)
}

export function unirCaixas(a: Caixa | null, b: Caixa | null): Caixa | null {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}
