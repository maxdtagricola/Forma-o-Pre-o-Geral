import { useSyncExternalStore } from 'react'

// -----------------------------------------------------------------------
// Dias úteis — fim de semana e feriado não contam (ninguém trabalha), pra
// medir há quanto tempo uma cotação está pendente, em andamento etc.
//
// Feriados nacionais (fixos e os móveis, que dependem da Páscoa) entram
// sozinhos; os locais (estaduais/municipais) ficam em Configurações ›
// Feriados e são carregados com definirFeriadosExtras ao abrir o app.
// -----------------------------------------------------------------------

/** "AAAA-MM-DD" de uma data, no horário local. */
export function chaveDoDia(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

/** Domingo de Páscoa do ano (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias)
}

const FERIADOS_FIXOS: [number, number, string][] = [
  [1, 1, 'Confraternização Universal'],
  [4, 21, 'Tiradentes'],
  [5, 1, 'Dia do Trabalho'],
  [9, 7, 'Independência'],
  [10, 12, 'Nossa Senhora Aparecida'],
  [11, 2, 'Finados'],
  [11, 15, 'Proclamação da República'],
  [11, 20, 'Consciência Negra'],
  [12, 25, 'Natal'],
]

const cacheNacionais = new Map<number, Map<string, string>>()

/** Feriados nacionais do ano: "AAAA-MM-DD" → nome. */
export function feriadosNacionais(ano: number): Map<string, string> {
  const pronto = cacheNacionais.get(ano)
  if (pronto) return pronto
  const mapa = new Map<string, string>()
  for (const [mes, dia, nome] of FERIADOS_FIXOS) mapa.set(chaveDoDia(new Date(ano, mes - 1, dia)), nome)
  const domingoDePascoa = pascoa(ano)
  mapa.set(chaveDoDia(somarDias(domingoDePascoa, -48)), 'Carnaval (segunda)')
  mapa.set(chaveDoDia(somarDias(domingoDePascoa, -47)), 'Carnaval (terça)')
  mapa.set(chaveDoDia(somarDias(domingoDePascoa, -2)), 'Sexta-feira Santa')
  mapa.set(chaveDoDia(somarDias(domingoDePascoa, 60)), 'Corpus Christi')
  cacheNacionais.set(ano, mapa)
  return mapa
}

export interface FeriadoExtra {
  /** "AAAA-MM-DD" */
  data: string
  nome: string
}

let extras = new Map<string, string>()
// muda a cada vez que os feriados locais são carregados/alterados — quem mostra contagem de dias
// úteis assina (useVersaoFeriados) pra recalcular
let versao = 0
let ouvintes: Array<() => void> = []

/** Feriados locais cadastrados em Configurações (valem além dos nacionais). */
export function definirFeriadosExtras(lista: FeriadoExtra[]): void {
  extras = new Map(lista.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.data)).map((f) => [f.data, f.nome]))
  versao++
  for (const ouvinte of ouvintes) ouvinte()
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.push(ouvinte)
  return () => {
    ouvintes = ouvintes.filter((o) => o !== ouvinte)
  }
}

/** Redesenha o componente quando os feriados locais mudam (a contagem de dias úteis muda junto). */
export function useVersaoFeriados(): number {
  return useSyncExternalStore(assinar, () => versao)
}

/** Nome do feriado nessa data (nacional ou cadastrado), ou undefined. */
export function feriadoNoDia(data: Date): string | undefined {
  const chave = chaveDoDia(data)
  return extras.get(chave) ?? feriadosNacionais(data.getFullYear()).get(chave)
}

export function ehDiaUtil(data: Date): boolean {
  const semana = data.getDay()
  return semana !== 0 && semana !== 6 && !feriadoNoDia(data)
}

/** Dias úteis desde `inicio` até `fim` (padrão: agora): conta os dias úteis DEPOIS do dia do início,
 * até o dia do fim inclusive — criada hoje = 0; criada na sexta e hoje é segunda = 1. */
export function diasUteisDesde(inicio: number, fim: number = Date.now()): number {
  const primeiro = new Date(inicio)
  const ultimo = new Date(fim)
  const fimDoDia = new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate()).getTime()
  let dia = new Date(primeiro.getFullYear(), primeiro.getMonth(), primeiro.getDate() + 1)
  let total = 0
  // limite de segurança (data muito antiga/errada não trava a tela)
  for (let i = 0; dia.getTime() <= fimDoDia && i < 3660; i++) {
    if (ehDiaUtil(dia)) total++
    dia = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1)
  }
  return total
}

/** Dias úteis de hoje até a data (positivo: faltam; negativo: já passou; 0: é hoje). */
export function diasUteisAte(dataAlvo: number, agora: number = Date.now()): number {
  const hoje = new Date(new Date(agora).getFullYear(), new Date(agora).getMonth(), new Date(agora).getDate()).getTime()
  const alvo = new Date(new Date(dataAlvo).getFullYear(), new Date(dataAlvo).getMonth(), new Date(dataAlvo).getDate()).getTime()
  if (alvo === hoje) return 0
  return alvo > hoje ? diasUteisDesde(hoje, alvo) : -diasUteisDesde(alvo, hoje)
}

/** "hoje", "1 dia útil", "3 dias úteis". */
export function textoDiasUteis(dias: number): string {
  if (dias <= 0) return 'hoje'
  return dias === 1 ? '1 dia útil' : `${dias} dias úteis`
}
