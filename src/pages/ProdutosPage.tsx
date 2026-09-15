import { Fragment, useEffect, useMemo, useState } from 'react'
import { listQuotes, saveQuote, updateItensPreRegistro } from '../db/analysesRepo'
import { Button } from '../components/ui/Basics'
import { formatNumber } from '../utils'
import { SENHA_PADRAO } from '../senhaPadrao'
import type { QuoteRecord } from '../types'

interface EdicaoProduto {
  descricao: string
  referencia: string
  ncm: string
  peso: string
}

interface ProdutoResumo {
  key: string
  interno: string
  descricao: string
  referencia: string
  ncm: string
  peso: number
  updatedAt: number
}

function extrairProdutos(quotes: QuoteRecord[]): ProdutoResumo[] {
  const porChave = new Map<string, ProdutoResumo>()

  function considerar(candidato: ProdutoResumo) {
    const atual = porChave.get(candidato.key)
    if (!atual || candidato.updatedAt > atual.updatedAt) {
      porChave.set(candidato.key, candidato)
    }
  }

  for (const quote of quotes) {
    const referenciasJaPrecificadas = new Set(
      quote.items.map((it) => it.product.referencia.trim().toLowerCase()).filter(Boolean),
    )

    for (const item of quote.items) {
      const p = item.product
      const chave = p.interno.trim() || `${p.referencia.trim()}|${p.ncm.trim()}` || item.id
      considerar({
        key: chave,
        interno: p.interno,
        descricao: p.descricao,
        referencia: p.referencia,
        ncm: p.ncm,
        peso: p.peso,
        updatedAt: quote.updatedAt,
      })
    }

    for (const pre of quote.itensPreRegistro) {
      const refNorm = pre.referencia.trim().toLowerCase()
      if (refNorm && referenciasJaPrecificadas.has(refNorm)) continue // já virou item precificado nessa cotação
      const chave = pre.interno.trim() || `${pre.referencia.trim()}|` || pre.id
      considerar({
        key: chave,
        interno: pre.interno,
        descricao: pre.descricao ?? '',
        referencia: pre.referencia,
        ncm: '',
        peso: 0,
        updatedAt: quote.updatedAt,
      })
    }
  }
  return Array.from(porChave.values()).sort((a, b) =>
    (a.descricao || a.referencia).localeCompare(b.descricao || b.referencia, 'pt-BR'),
  )
}

export function ProdutosPage({ currentAdmin }: { currentAdmin: string }) {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | undefined>(undefined)
  const [editando, setEditando] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<EdicaoProduto>({ descricao: '', referencia: '', ncm: '', peso: '' })
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [senhaEdicao, setSenhaEdicao] = useState('')

  async function refresh() {
    setLoading(true)
    try {
      setQuotes(await listQuotes())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar produtos do servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const produtos = useMemo(() => extrairProdutos(quotes), [quotes])
  const semInterno = useMemo(() => produtos.filter((p) => !p.interno.trim()), [produtos])

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return produtos
    return produtos.filter(
      (p) =>
        p.interno.toLowerCase().includes(q) ||
        p.descricao.toLowerCase().includes(q) ||
        p.referencia.toLowerCase().includes(q) ||
        p.ncm.toLowerCase().includes(q),
    )
  }, [produtos, query])

  async function handleAdicionarInterno(produto: ProdutoResumo) {
    const valor = (rascunhos[produto.key] ?? '').trim()
    if (!valor) {
      alert('Informe o código Interno.')
      return
    }
    const alvo = produto.referencia.trim().toLowerCase()
    if (!alvo) {
      alert('Esse item não tem Referência pra localizar em qual(is) cotação(ões) ele aparece.')
      return
    }
    setSalvando(produto.key)
    let atualizadas = 0
    let bloqueadas = 0
    try {
      for (const quote of quotes) {
        let mudouItems = false
        const novosItems = quote.items.map((item) => {
          if (!item.product.interno.trim() && item.product.referencia.trim().toLowerCase() === alvo) {
            mudouItems = true
            return { ...item, product: { ...item.product, interno: valor } }
          }
          return item
        })
        let mudouPre = false
        const novosPreRegistro = quote.itensPreRegistro.map((it) => {
          if (!it.interno.trim() && it.referencia.trim().toLowerCase() === alvo) {
            mudouPre = true
            return { ...it, interno: valor }
          }
          return it
        })
        if (!mudouItems && !mudouPre) continue

        try {
          if (mudouItems) {
            await saveQuote(currentAdmin, quote.vendedor, quote.tipoReferencia, quote.cliente, quote.maquina, novosItems, quote.id)
          }
          if (mudouPre) {
            await updateItensPreRegistro(quote.id, novosPreRegistro, currentAdmin)
          }
          atualizadas++
        } catch {
          bloqueadas++
        }
      }
      setRascunhos((prev) => {
        const next = { ...prev }
        delete next[produto.key]
        return next
      })
      await refresh()
      alert(
        `Interno adicionado em ${atualizadas} cotação(ões).` +
          (bloqueadas > 0 ? ` ${bloqueadas} não puderam ser alteradas (em análise por outro admin).` : ''),
      )
    } finally {
      setSalvando(undefined)
    }
  }

  function handleIniciarEdicao(produto: ProdutoResumo) {
    setEditando(produto.key)
    setConfirmando(null)
    setSenhaEdicao('')
    setEdicao({
      descricao: produto.descricao,
      referencia: produto.referencia,
      ncm: produto.ncm,
      peso: produto.peso ? String(produto.peso) : '',
    })
  }

  function handleCancelarEdicao() {
    setEditando(null)
    setConfirmando(null)
    setSenhaEdicao('')
  }

  // aplica a edição em todas as cotações onde esse produto aparece — localizado pelo Interno
  // (quando existe) ou, senão, pela Referência que ele tinha antes da edição
  async function aplicarEdicao(produto: ProdutoResumo) {
    const alvoInterno = produto.interno.trim()
    const alvoReferencia = produto.referencia.trim().toLowerCase()
    if (!alvoInterno && !alvoReferencia) {
      alert('Esse item não tem Interno nem Referência pra localizar em qual(is) cotação(ões) ele aparece.')
      return
    }
    const novaDescricao = edicao.descricao.trim()
    const novaReferencia = edicao.referencia.trim()
    const novoNcm = edicao.ncm.trim()
    const novoPeso = Number(edicao.peso.replace(',', '.')) || 0

    setSalvando(produto.key)
    let atualizadas = 0
    let bloqueadas = 0
    try {
      for (const quote of quotes) {
        const bateItem = (p: { interno: string; referencia: string }) =>
          alvoInterno ? p.interno.trim() === alvoInterno : p.referencia.trim().toLowerCase() === alvoReferencia

        let mudouItems = false
        const novosItems = quote.items.map((item) => {
          if (!bateItem(item.product)) return item
          mudouItems = true
          return {
            ...item,
            product: { ...item.product, descricao: novaDescricao, referencia: novaReferencia, ncm: novoNcm, peso: novoPeso },
          }
        })
        let mudouPre = false
        const novosPreRegistro = quote.itensPreRegistro.map((it) => {
          if (!bateItem(it)) return it
          mudouPre = true
          return { ...it, descricao: novaDescricao, referencia: novaReferencia }
        })
        if (!mudouItems && !mudouPre) continue

        try {
          if (mudouItems) {
            await saveQuote(currentAdmin, quote.vendedor, quote.tipoReferencia, quote.cliente, quote.maquina, novosItems, quote.id)
          }
          if (mudouPre) {
            await updateItensPreRegistro(quote.id, novosPreRegistro, currentAdmin)
          }
          atualizadas++
        } catch {
          bloqueadas++
        }
      }
      handleCancelarEdicao()
      await refresh()
      alert(
        `Produto atualizado em ${atualizadas} cotação(ões).` +
          (bloqueadas > 0 ? ` ${bloqueadas} não puderam ser alteradas (em análise por outro admin).` : ''),
      )
    } finally {
      setSalvando(undefined)
    }
  }

  function handleConfirmarSenha(produto: ProdutoResumo) {
    if (senhaEdicao !== SENHA_PADRAO) {
      alert('Senha incorreta.')
      setSenhaEdicao('')
      return
    }
    aplicarEdicao(produto)
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Produtos</h2>
        <p className="text-sm text-ink-400 mb-4">
          Produtos já registrados em alguma cotação (precificados ou só na lista de itens a cotar) — um por código
          Interno (ou por referência + NCM quando não há Interno).
        </p>
        <input
          type="text"
          className="field-input max-w-sm"
          placeholder="Buscar por interno, descrição, referência ou NCM…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!loading && semInterno.length > 0 && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            {semInterno.length} produto(s) sem código Interno. Quer completar agora? Preencha o campo na linha
            correspondente, na tabela abaixo.
          </p>
        </div>
      )}

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">
            {produtos.length === 0 ? 'Nenhum produto salvo ainda.' : 'Nada encontrado.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-400 border-b border-ink-100">
                <th className="py-2 pr-4 font-medium min-w-[12rem]">Interno</th>
                <th className="py-2 pr-4 font-medium">Descrição</th>
                <th className="py-2 pr-4 font-medium">Referência</th>
                <th className="py-2 pr-4 font-medium">NCM</th>
                <th className="py-2 pr-4 font-medium text-right">Peso (kg)</th>
                <th className="py-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const emEdicao = editando === p.key
                const emConfirmacao = confirmando === p.key
                return (
                  <Fragment key={p.key}>
                    <tr className="border-b border-ink-50 last:border-0">
                      <td className="py-2 pr-4 font-mono text-ink-800">
                        {p.interno ? (
                          p.interno
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              className="field-input py-1 text-xs font-mono"
                              placeholder="adicionar interno"
                              value={rascunhos[p.key] ?? ''}
                              onChange={(e) => setRascunhos((prev) => ({ ...prev, [p.key]: e.target.value }))}
                            />
                            <Button
                              variant="secondary"
                              className="shrink-0 py-1 px-2 text-xs"
                              onClick={() => handleAdicionarInterno(p)}
                              disabled={salvando === p.key}
                            >
                              Salvar
                            </Button>
                          </div>
                        )}
                      </td>
                      {emEdicao ? (
                        <>
                          <td className="py-2 pr-4">
                            <input
                              type="text"
                              className="field-input py-1 text-xs"
                              value={edicao.descricao}
                              onChange={(e) => setEdicao((prev) => ({ ...prev, descricao: e.target.value }))}
                            />
                          </td>
                          <td className="py-2 pr-4">
                            <input
                              type="text"
                              className="field-input py-1 text-xs"
                              value={edicao.referencia}
                              onChange={(e) => setEdicao((prev) => ({ ...prev, referencia: e.target.value }))}
                            />
                          </td>
                          <td className="py-2 pr-4">
                            <input
                              type="text"
                              className="field-input py-1 text-xs font-mono"
                              value={edicao.ncm}
                              onChange={(e) => setEdicao((prev) => ({ ...prev, ncm: e.target.value }))}
                            />
                          </td>
                          <td className="py-2 pr-0">
                            <input
                              type="text"
                              inputMode="decimal"
                              className="field-input py-1 text-xs text-right"
                              value={edicao.peso}
                              onChange={(e) => setEdicao((prev) => ({ ...prev, peso: e.target.value }))}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-4 text-ink-800">{p.descricao || '—'}</td>
                          <td className="py-2 pr-4 text-ink-600">{p.referencia || '—'}</td>
                          <td className="py-2 pr-4 font-mono text-ink-600">{p.ncm || '—'}</td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums text-ink-600">
                            {p.peso ? formatNumber(p.peso, 2) : '—'}
                          </td>
                        </>
                      )}
                      <td className="py-2 text-right">
                        {emEdicao ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              className="py-1 px-2 text-xs"
                              onClick={handleCancelarEdicao}
                              disabled={salvando === p.key}
                            >
                              Cancelar
                            </Button>
                            <Button
                              variant="secondary"
                              className="py-1 px-2 text-xs"
                              onClick={() => setConfirmando(p.key)}
                              disabled={salvando === p.key || emConfirmacao}
                            >
                              Salvar
                            </Button>
                          </div>
                        ) : (
                          <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => handleIniciarEdicao(p)}>
                            Editar
                          </Button>
                        )}
                      </td>
                    </tr>
                    {emConfirmacao && (
                      <tr className="border-b border-ink-50 last:border-0">
                        <td colSpan={6} className="py-0">
                          <div className="my-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                            <p className="text-xs text-ink-900 mb-2">
                              Confirme a senha pra salvar a alteração de "{p.descricao || p.referencia}" em todas as
                              cotações onde esse produto aparece.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="password"
                                className="field-input max-w-[10rem] py-1 text-xs"
                                placeholder="Senha"
                                value={senhaEdicao}
                                onChange={(e) => setSenhaEdicao(e.target.value)}
                                disabled={salvando === p.key}
                              />
                              <Button
                                variant="primary"
                                className="py-1 px-2 text-xs"
                                onClick={() => handleConfirmarSenha(p)}
                                disabled={salvando === p.key}
                              >
                                Confirmar
                              </Button>
                              <Button
                                variant="ghost"
                                className="py-1 px-2 text-xs"
                                onClick={() => {
                                  setConfirmando(null)
                                  setSenhaEdicao('')
                                }}
                                disabled={salvando === p.key}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
