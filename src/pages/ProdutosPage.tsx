import { Fragment, useEffect, useMemo, useState } from 'react'
import { listQuotes, saveQuote, updateItensPreRegistro } from '../db/analysesRepo'
import { deleteProduto, sincronizarProdutos, updateProduto } from '../db/produtosRepo'
import { Button } from '../components/ui/Basics'
import { formatNumber } from '../utils'
import { SENHA_PADRAO } from '../senhaPadrao'
import type { Produto, QuoteRecord } from '../types'

interface EdicaoProduto {
  descricao: string
  referencias: string
  ncm: string
  peso: string
}

export function ProdutosPage({ currentAdmin }: { currentAdmin: string }) {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | undefined>(undefined)
  const [editando, setEditando] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<EdicaoProduto>({ descricao: '', referencias: '', ncm: '', peso: '' })
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [senhaEdicao, setSenhaEdicao] = useState('')
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [senhaExclusao, setSenhaExclusao] = useState('')

  async function refresh() {
    setLoading(true)
    try {
      const qs = await listQuotes()
      setQuotes(qs)
      // sincroniza o catálogo independente a partir das cotações atuais — uma vez sincronizado, um
      // produto continua no catálogo mesmo se a cotação de origem for excluída depois
      setProdutos(await sincronizarProdutos(qs))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar produtos do servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const semInterno = useMemo(() => produtos.filter((p) => !p.interno.trim()), [produtos])

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return produtos
    return produtos.filter(
      (p) =>
        p.interno.toLowerCase().includes(q) ||
        p.descricao.toLowerCase().includes(q) ||
        p.referencias.some((r) => r.toLowerCase().includes(q)) ||
        p.ncm.toLowerCase().includes(q),
    )
  }, [produtos, query])

  async function handleAdicionarInterno(produto: Produto) {
    const valor = (rascunhos[produto.id] ?? '').trim()
    if (!valor) {
      alert('Informe o código Interno.')
      return
    }
    const alvos = produto.referencias.map((r) => r.trim().toLowerCase()).filter(Boolean)
    if (alvos.length === 0) {
      alert('Esse item não tem Referência pra localizar em qual(is) cotação(ões) ele aparece.')
      return
    }
    setSalvando(produto.id)
    let atualizadas = 0
    let bloqueadas = 0
    try {
      for (const quote of quotes) {
        let mudouItems = false
        const novosItems = quote.items.map((item) => {
          if (!item.product.interno.trim() && alvos.includes(item.product.referencia.trim().toLowerCase())) {
            mudouItems = true
            return { ...item, product: { ...item.product, interno: valor } }
          }
          return item
        })
        let mudouPre = false
        const novosPreRegistro = quote.itensPreRegistro.map((it) => {
          if (!it.interno.trim() && alvos.includes(it.referencia.trim().toLowerCase())) {
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
      await updateProduto(produto.id, { interno: valor })
      setRascunhos((prev) => {
        const next = { ...prev }
        delete next[produto.id]
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

  function handleIniciarEdicao(produto: Produto) {
    setEditando(produto.id)
    setConfirmando(null)
    setSenhaEdicao('')
    setEdicao({
      descricao: produto.descricao,
      referencias: produto.referencias.join(', '),
      ncm: produto.ncm,
      peso: produto.peso ? String(produto.peso) : '',
    })
  }

  function handleCancelarEdicao() {
    setEditando(null)
    setConfirmando(null)
    setSenhaEdicao('')
  }

  // aplica a descrição/NCM/peso em todas as cotações onde esse produto aparece — localizado pelo
  // Interno (quando existe) ou, senão, por qualquer uma das Referências já conhecidas do produto.
  // As referências em si só são editadas no catálogo (não fazem sentido cascatear pras cotações,
  // já que cada item de cotação guarda uma única referência — a que foi usada naquele pedido — e
  // isso é histórico que não deve mudar retroativamente).
  async function aplicarEdicao(produto: Produto) {
    const alvoInterno = produto.interno.trim()
    const alvosReferencia = produto.referencias.map((r) => r.trim().toLowerCase()).filter(Boolean)
    const novaDescricao = edicao.descricao.trim()
    const novasReferencias = Array.from(
      new Set(
        edicao.referencias
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      ),
    )
    const novoNcm = edicao.ncm.trim()
    const novoPeso = Number(edicao.peso.replace(',', '.')) || 0

    setSalvando(produto.id)
    let atualizadas = 0
    let bloqueadas = 0
    try {
      if (alvoInterno || alvosReferencia.length > 0) {
        const bateItem = (p: { interno: string; referencia: string }) =>
          alvoInterno ? p.interno.trim() === alvoInterno : alvosReferencia.includes(p.referencia.trim().toLowerCase())

        for (const quote of quotes) {
          let mudouItems = false
          const novosItems = quote.items.map((item) => {
            if (!bateItem(item.product)) return item
            mudouItems = true
            return { ...item, product: { ...item.product, descricao: novaDescricao, ncm: novoNcm, peso: novoPeso } }
          })
          let mudouPre = false
          const novosPreRegistro = quote.itensPreRegistro.map((it) => {
            if (!bateItem(it)) return it
            mudouPre = true
            return { ...it, descricao: novaDescricao }
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
      }
      await updateProduto(produto.id, { descricao: novaDescricao, referencias: novasReferencias, ncm: novoNcm, peso: novoPeso })
      handleCancelarEdicao()
      await refresh()
      alert(
        `Produto atualizado${atualizadas > 0 ? ` em ${atualizadas} cotação(ões)` : ''}.` +
          (bloqueadas > 0 ? ` ${bloqueadas} não puderam ser alteradas (em análise por outro admin).` : ''),
      )
    } finally {
      setSalvando(undefined)
    }
  }

  function handleConfirmarSenha(produto: Produto) {
    if (senhaEdicao !== SENHA_PADRAO) {
      alert('Senha incorreta.')
      setSenhaEdicao('')
      return
    }
    aplicarEdicao(produto)
  }

  function handleIniciarExclusao(produto: Produto) {
    setExcluindo(produto.id)
    setEditando(null)
    setConfirmando(null)
    setSenhaExclusao('')
  }

  function handleCancelarExclusao() {
    setExcluindo(null)
    setSenhaExclusao('')
  }

  // remove só o produto do catálogo — não mexe nas cotações onde ele já apareceu, que mantêm o
  // histórico exatamente como estava
  async function handleConfirmarExclusao(produto: Produto) {
    if (senhaExclusao !== SENHA_PADRAO) {
      alert('Senha incorreta.')
      setSenhaExclusao('')
      return
    }
    setSalvando(produto.id)
    try {
      await deleteProduto(produto.id)
      handleCancelarExclusao()
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir o produto.')
    } finally {
      setSalvando(undefined)
    }
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
                <th className="py-2 pr-4 font-medium">Referência(s)</th>
                <th className="py-2 pr-4 font-medium">NCM</th>
                <th className="py-2 pr-4 font-medium text-right">Peso (kg)</th>
                <th className="py-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const emEdicao = editando === p.id
                const emConfirmacao = confirmando === p.id
                const emExclusao = excluindo === p.id
                return (
                  <Fragment key={p.id}>
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
                              value={rascunhos[p.id] ?? ''}
                              onChange={(e) => setRascunhos((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            />
                            <Button
                              variant="secondary"
                              className="shrink-0 py-1 px-2 text-xs"
                              onClick={() => handleAdicionarInterno(p)}
                              disabled={salvando === p.id}
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
                              placeholder="separe várias por vírgula"
                              value={edicao.referencias}
                              onChange={(e) => setEdicao((prev) => ({ ...prev, referencias: e.target.value }))}
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
                          <td className="py-2 pr-4 text-ink-600">{p.referencias.join(', ') || '—'}</td>
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
                              disabled={salvando === p.id}
                            >
                              Cancelar
                            </Button>
                            <Button
                              variant="secondary"
                              className="py-1 px-2 text-xs"
                              onClick={() => setConfirmando(p.id)}
                              disabled={salvando === p.id || emConfirmacao}
                            >
                              Salvar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => handleIniciarEdicao(p)}>
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              className="py-1 px-2 text-xs text-rose-600 hover:bg-rose-50"
                              onClick={() => handleIniciarExclusao(p)}
                            >
                              Excluir
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {emConfirmacao && (
                      <tr className="border-b border-ink-50 last:border-0">
                        <td colSpan={6} className="py-0">
                          <div className="my-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                            <p className="text-xs text-ink-900 mb-2">
                              Confirme a senha pra salvar a alteração de "{p.descricao || p.referencias[0]}"
                              {p.interno || p.referencias.length > 0 ? ' em todas as cotações onde esse produto aparece' : ''}.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="password"
                                className="field-input max-w-[10rem] py-1 text-xs"
                                placeholder="Senha"
                                value={senhaEdicao}
                                onChange={(e) => setSenhaEdicao(e.target.value)}
                                disabled={salvando === p.id}
                              />
                              <Button
                                variant="primary"
                                className="py-1 px-2 text-xs"
                                onClick={() => handleConfirmarSenha(p)}
                                disabled={salvando === p.id}
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
                                disabled={salvando === p.id}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {emExclusao && (
                      <tr className="border-b border-ink-50 last:border-0">
                        <td colSpan={6} className="py-0">
                          <div className="my-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                            <p className="text-xs text-ink-900 mb-2">
                              Confirme a senha pra excluir "{p.descricao || p.referencias[0] || p.interno}" do catálogo
                              de produtos. As cotações onde ele já apareceu não são alteradas — só o registro no
                              catálogo é removido.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="password"
                                className="field-input max-w-[10rem] py-1 text-xs"
                                placeholder="Senha"
                                value={senhaExclusao}
                                onChange={(e) => setSenhaExclusao(e.target.value)}
                                disabled={salvando === p.id}
                              />
                              <Button
                                variant="primary"
                                className="py-1 px-2 text-xs bg-rose-600 hover:bg-rose-700"
                                onClick={() => handleConfirmarExclusao(p)}
                                disabled={salvando === p.id}
                              >
                                Excluir
                              </Button>
                              <Button
                                variant="ghost"
                                className="py-1 px-2 text-xs"
                                onClick={handleCancelarExclusao}
                                disabled={salvando === p.id}
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
