import { useEffect, useState } from 'react'
import { TRANSPORTADORAS } from '../types'
import type { DadosFreteTransportadora } from '../types'
import { formatarNumeroBR, parseNumeroFlexivel } from '../numeros'
import { formatCurrency } from '../utils'

// -----------------------------------------------------------------------
// Cotações de frete de UM fornecedor, lado a lado: até três transportadoras
// na mesma linha, cada uma com o número e o valor da cotação que devolveu.
// É o mesmo dado da aba Frete (o "Retorno da transportadora" de lá) — o que
// for salvo aqui aparece lá e vice-versa, sem cópia separada.
// -----------------------------------------------------------------------

export const QUANTIDADE_ESPACOS_FRETE = 3

export interface CotacaoFreteSalva {
  transportadora: string
  dados: DadosFreteTransportadora
  valor?: number
}

function temCotacao(dados: DadosFreteTransportadora | undefined): boolean {
  return !!dados && (!!dados.valorCotacao?.trim() || !!dados.numeroCotacao?.trim())
}

/** As cotações de frete que de fato têm número ou valor, na ordem em que foram registradas (a mesma
 * ordem guardada no servidor) — assim nenhum espaço "pula" de lugar depois de salvar. Passando de
 * três, ficam as três mais baratas (ainda na ordem de registro). */
export function cotacoesFreteVisiveis(fretes: Record<string, DadosFreteTransportadora>): {
  visiveis: CotacaoFreteSalva[]
  ocultas: number
} {
  const todas: CotacaoFreteSalva[] = Object.entries(fretes)
    .filter(([, dados]) => temCotacao(dados))
    .map(([transportadora, dados]) => ({ transportadora, dados, valor: parseNumeroFlexivel(dados.valorCotacao) }))
  if (todas.length <= QUANTIDADE_ESPACOS_FRETE) return { visiveis: todas, ocultas: 0 }
  const maisBaratas = new Set(
    [...todas]
      .sort((a, b) => (a.valor ?? Number.POSITIVE_INFINITY) - (b.valor ?? Number.POSITIVE_INFINITY))
      .slice(0, QUANTIDADE_ESPACOS_FRETE)
      .map((c) => c.transportadora),
  )
  const visiveis = todas.filter((c) => maisBaratas.has(c.transportadora))
  return { visiveis, ocultas: todas.length - visiveis.length }
}

function valorParaTexto(valor: string): string {
  const n = parseNumeroFlexivel(valor)
  return n !== undefined ? formatarNumeroBR(n, 2) : valor.trim()
}

function EspacoFrete({
  cotacao,
  opcoesTransportadora,
  maisBarata,
  habilitado,
  onSalvar,
  onTrocarTransportadora,
  onLimpar,
}: {
  /** undefined = espaço vazio, pronto pra uma cotação nova. */
  cotacao?: CotacaoFreteSalva
  opcoesTransportadora: string[]
  maisBarata: boolean
  habilitado: boolean
  onSalvar: (transportadora: string, numero: string, valor: string) => Promise<void>
  onTrocarTransportadora: (antiga: string, nova: string, numero: string, valor: string) => Promise<void>
  onLimpar: (transportadora: string) => Promise<void>
}) {
  const [transportadora, setTransportadora] = useState(cotacao?.transportadora ?? '')
  const [numero, setNumero] = useState(cotacao?.dados.numeroCotacao ?? '')
  const [valor, setValor] = useState(cotacao ? valorParaTexto(cotacao.dados.valorCotacao) : '')
  const [salvando, setSalvando] = useState(false)

  // acompanha o que vier salvo de fora (aba Frete, outro espaço) enquanto ninguém está editando aqui
  useEffect(() => {
    setTransportadora(cotacao?.transportadora ?? '')
    setNumero(cotacao?.dados.numeroCotacao ?? '')
    setValor(cotacao ? valorParaTexto(cotacao.dados.valorCotacao) : '')
  }, [cotacao?.transportadora, cotacao?.dados.numeroCotacao, cotacao?.dados.valorCotacao])

  async function executar(acao: () => Promise<void>) {
    setSalvando(true)
    try {
      await acao()
    } finally {
      setSalvando(false)
    }
  }

  async function salvarSeMudou(proxNumero = numero, proxValor = valor) {
    if (!habilitado || !transportadora) return
    const valorFormatado = valorParaTexto(proxValor)
    if (valorFormatado !== proxValor) setValor(valorFormatado)
    const numeroLimpo = proxNumero.trim()
    const mesmoQueSalvo =
      cotacao &&
      cotacao.transportadora === transportadora &&
      (cotacao.dados.numeroCotacao ?? '') === numeroLimpo &&
      valorParaTexto(cotacao.dados.valorCotacao ?? '') === valorFormatado
    if (mesmoQueSalvo) return
    // espaço novo só vira cotação quando tem número ou valor — só escolher a transportadora não grava nada
    if (!cotacao && !numeroLimpo && !valorFormatado) return
    await executar(() => onSalvar(transportadora, numeroLimpo, valorFormatado))
  }

  async function handleTrocarTransportadora(nova: string) {
    const antiga = transportadora
    setTransportadora(nova)
    if (!habilitado) return
    if (cotacao && antiga && nova && antiga !== nova) {
      await executar(() => onTrocarTransportadora(antiga, nova, numero.trim(), valorParaTexto(valor)))
    } else if (!cotacao && nova && (numero.trim() || valor.trim())) {
      await executar(() => onSalvar(nova, numero.trim(), valorParaTexto(valor)))
    }
  }

  const valorNumerico = parseNumeroFlexivel(valor)
  const inputCls =
    'rounded border border-ink-200 bg-surface px-1.5 py-0.5 text-[11px] text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-60'

  return (
    <div
      className={`flex max-w-full flex-wrap items-center gap-1 rounded-md border px-1 py-0.5 ${
        maisBarata ? 'border-emerald-500 bg-emerald-500/10' : cotacao ? 'border-ink-200 bg-surface' : 'border-dashed border-ink-200 bg-surface/60'
      }`}
      onClick={(e) => e.stopPropagation()}
      // grava só quando o foco sai do espaço inteiro (não ao pular do Nº pro valor): gravar um
      // espaço novo faz ele virar a cotação daquela transportadora — se isso acontecesse no meio da
      // digitação, o valor que ainda estava sendo digitado se perdia
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void salvarSeMudou()
      }}
    >
      <select
        value={transportadora}
        disabled={!habilitado || salvando}
        onChange={(e) => void handleTrocarTransportadora(e.target.value)}
        title="Transportadora dessa cotação de frete"
        className={`${inputCls} w-[5.75rem] sm:w-[6.25rem] font-medium`}
      >
        <option value="">Transportad.…</option>
        {opcoesTransportadora.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={numero}
        disabled={!habilitado || salvando || !transportadora}
        onChange={(e) => setNumero(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder="Nº"
        title={numero ? `Nº da cotação de frete: ${numero}` : 'Número da cotação de frete'}
        className={`${inputCls} w-[3.5rem] sm:w-[3.75rem] font-mono`}
      />
      <div className="relative w-[4.75rem] sm:w-[5.25rem]">
        <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-ink-400">R$</span>
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          disabled={!habilitado || salvando || !transportadora}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="0,00"
          title={valorNumerico !== undefined ? formatCurrency(valorNumerico) : 'Valor da cotação de frete'}
          className={`${inputCls} w-full pl-5 text-right font-mono tabular-nums`}
        />
      </div>
      {maisBarata && (
        <span className="shrink-0 rounded-full bg-emerald-600 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-white">
          menor
        </span>
      )}
      {cotacao && habilitado && (
        <button
          type="button"
          disabled={salvando}
          onClick={() => void executar(() => onLimpar(cotacao.transportadora))}
          title="Tirar essa cotação de frete"
          aria-label="Tirar essa cotação de frete"
          className="shrink-0 h-4 w-4 rounded-full text-ink-400 hover:bg-rose-50 hover:text-rose-600 text-xs leading-none"
        >
          ×
        </button>
      )}
    </div>
  )
}

/** Os três espaços de cotação de frete de um fornecedor, na mesma linha. */
export function FreteFornecedorSlots({
  fretes,
  habilitado,
  motivoDesabilitado,
  onSalvar,
  onLimpar,
}: {
  fretes: Record<string, DadosFreteTransportadora>
  habilitado: boolean
  motivoDesabilitado?: string
  onSalvar: (transportadora: string, numero: string, valor: string) => Promise<void>
  onLimpar: (transportadora: string) => Promise<void>
}) {
  const { visiveis, ocultas } = cotacoesFreteVisiveis(fretes)
  const usadas = new Set(Object.keys(fretes).filter((t) => temCotacao(fretes[t])))
  const comValor = visiveis.filter((c) => c.valor !== undefined && c.valor > 0)
  const menorValor = comValor.length >= 2 ? Math.min(...comValor.map((c) => c.valor!)) : undefined
  const espacosVazios = Math.max(0, QUANTIDADE_ESPACOS_FRETE - visiveis.length)

  function opcoesPara(atual?: string): string[] {
    const lista = TRANSPORTADORAS.filter((t) => t === atual || !usadas.has(t))
    if (atual && !lista.includes(atual)) lista.push(atual)
    return lista
  }

  async function trocar(antiga: string, nova: string, numero: string, valor: string) {
    await onSalvar(nova, numero, valor)
    await onLimpar(antiga)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" title={!habilitado ? motivoDesabilitado : undefined}>
      {visiveis.map((c) => (
        <EspacoFrete
          key={c.transportadora}
          cotacao={c}
          opcoesTransportadora={opcoesPara(c.transportadora)}
          maisBarata={menorValor !== undefined && c.valor === menorValor}
          habilitado={habilitado}
          onSalvar={onSalvar}
          onTrocarTransportadora={trocar}
          onLimpar={onLimpar}
        />
      ))}
      {Array.from({ length: espacosVazios }, (_, i) => (
        <EspacoFrete
          key={`novo-${visiveis.length + i}`}
          opcoesTransportadora={opcoesPara()}
          maisBarata={false}
          habilitado={habilitado}
          onSalvar={onSalvar}
          onTrocarTransportadora={trocar}
          onLimpar={onLimpar}
        />
      ))}
      {ocultas > 0 && (
        <span className="text-[11px] text-ink-400">+{ocultas} cotação(ões) de frete na aba Frete</span>
      )}
      {!habilitado && motivoDesabilitado && <span className="text-[11px] text-amber-700">{motivoDesabilitado}</span>}
    </div>
  )
}
