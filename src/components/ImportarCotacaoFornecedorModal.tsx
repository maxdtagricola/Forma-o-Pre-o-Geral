import { useState } from 'react'
import { Button } from './ui/Basics'
import { AutocompleteField, TextField } from './ui/Field'
import { importarCotacaoFornecedor, type ItemDetectadoFornecedor } from '../cotacaoFornecedorImport'
import type { QuoteItem } from '../types'

interface LinhaEditavel extends ItemDetectadoFornecedor {
  incluir: boolean
  valorTexto: string
}

const ACEITA_ARQUIVOS = '.xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.gif'

export function ImportarCotacaoFornecedorModal({
  items,
  fornecedorSuggestions,
  fornecedoresNomes,
  onConfirmar,
  onClose,
}: {
  items: QuoteItem[]
  fornecedorSuggestions: { value: string; label: string }[]
  fornecedoresNomes: string[]
  onConfirmar: (fornecedor: string, marca: string, itens: { itemId: string; valorUnitario: number }[]) => void
  onClose: () => void
}) {
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | undefined>(undefined)
  const [avisoLeituraFraca, setAvisoLeituraFraca] = useState<string | undefined>(undefined)
  const [fornecedorDetectado, setFornecedorDetectado] = useState<string | undefined>(undefined)
  const [fornecedor, setFornecedor] = useState('')
  const [marca, setMarca] = useState('')
  const [linhas, setLinhas] = useState<LinhaEditavel[] | undefined>(undefined)

  async function handleArquivoSelecionado(file: File) {
    setLendo(true)
    setErro(undefined)
    setAvisoLeituraFraca(undefined)
    setLinhas(undefined)
    setNomeArquivo(file.name)
    try {
      const resultado = await importarCotacaoFornecedor(file, items, fornecedoresNomes)
      setFornecedorDetectado(resultado.fornecedorDetectado)
      setFornecedor(resultado.fornecedorDetectado ?? '')
      setAvisoLeituraFraca(resultado.avisoLeituraFraca)
      setLinhas(
        resultado.itens.map((item) => ({
          ...item,
          incluir: item.valorDetectado !== undefined,
          valorTexto: item.valorDetectado !== undefined ? String(item.valorDetectado).replace('.', ',') : '',
        })),
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  function patchLinha(itemId: string, patch: Partial<LinhaEditavel>) {
    setLinhas((prev) => prev?.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)))
  }

  const linhasProntas = (linhas ?? []).filter((l) => l.incluir && Number(l.valorTexto.replace(',', '.')) > 0)
  const podeConfirmar = fornecedor.trim().length > 0 && linhasProntas.length > 0

  function handleConfirmar() {
    if (!podeConfirmar) return
    onConfirmar(
      fornecedor.trim(),
      marca.trim(),
      linhasProntas.map((l) => ({ itemId: l.itemId, valorUnitario: Number(l.valorTexto.replace(',', '.')) })),
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-900">Importar cotação do fornecedor</h3>
            <p className="text-sm text-ink-400">Planilha, PDF ou foto/print da cotação — leio e casei pela Referência.</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-3">
          <label className="block">
            <span className="field-label">Arquivo</span>
            <input
              type="file"
              accept={ACEITA_ARQUIVOS}
              disabled={lendo}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleArquivoSelecionado(file)
                e.target.value = ''
              }}
              className="field-input"
            />
          </label>
          {nomeArquivo && !lendo && <p className="text-xs text-ink-400">{nomeArquivo}</p>}
          {lendo && (
            <p className="text-sm text-ink-400">
              Lendo arquivo… {nomeArquivo.match(/\.(pdf|png|jpe?g|webp|bmp|gif)$/i) && 'imagem e PDF escaneado podem levar alguns segundos (OCR).'}
            </p>
          )}
          {erro && <p className="text-sm text-rose-600">{erro}</p>}

          {linhas !== undefined && (
            <>
              {avisoLeituraFraca && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{avisoLeituraFraca}</p>
              )}

              {fornecedorDetectado && (
                <p className="text-xs text-emerald-700">
                  Fornecedor identificado no arquivo: <strong>{fornecedorDetectado}</strong> — confirme ou troque abaixo.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <AutocompleteField label="Fornecedor" value={fornecedor} onChange={setFornecedor} suggestions={fornecedorSuggestions} />
                <TextField label="Marca (opcional, vale pra todos os itens marcados)" value={marca} onChange={setMarca} />
              </div>

              {linhas.length > 0 ? (
                <div className="rounded-xl border border-ink-100 overflow-hidden">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-ink-50 text-left text-ink-400">
                        <th className="py-2 px-2 w-8"></th>
                        <th className="py-2 px-2 font-medium">Item da cotação</th>
                        <th className="py-2 px-2 font-medium w-32 text-right">Valor unt.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l) => (
                        <tr key={l.itemId} className="border-t border-ink-100">
                          <td className="py-2 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={l.incluir}
                              onChange={(e) => patchLinha(l.itemId, { incluir: e.target.checked })}
                            />
                          </td>
                          <td className="py-2 px-2">
                            <p className="text-ink-800">{l.descricao || l.referencia || '(sem descrição)'}</p>
                            <p className="text-xs text-ink-400">Ref. {l.referencia}</p>
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="R$"
                              value={l.valorTexto}
                              onChange={(e) => patchLinha(l.itemId, { valorTexto: e.target.value, incluir: true })}
                              className="field-input text-right tabular-nums py-1"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                !avisoLeituraFraca && (
                  <p className="text-sm text-ink-400 text-center py-4">
                    Não encontrei nenhuma referência dessa cotação nesse arquivo.
                  </p>
                )
              )}
            </>
          )}
        </div>

        <div className="flex justify-between items-center gap-2 pt-3 border-t border-ink-100">
          <p className="text-xs text-ink-400">
            {linhasProntas.length > 0 && `${linhasProntas.length} item(ns) pronto(s) — confira os valores antes de confirmar.`}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleConfirmar} disabled={!podeConfirmar}>
              Adicionar {linhasProntas.length > 0 ? `(${linhasProntas.length})` : ''} ao comparador
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
