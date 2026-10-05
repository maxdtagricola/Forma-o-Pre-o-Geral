import { useEffect, useState } from 'react'
import { Button } from './ui/Basics'
import { getFeriadosExtras, salvarFeriadosExtras } from '../db/configRepo'
import { definirFeriadosExtras, feriadosNacionais, type FeriadoExtra } from '../diasUteis'
import { avisar } from '../dialogs'

function dataBR(chave: string): string {
  const [ano, mes, dia] = chave.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Configurações › Feriados — os locais (estaduais/municipais), que não contam como dia de trabalho
 * junto com fins de semana e feriados nacionais (esses já entram sozinhos). */
export function FeriadosCard() {
  const [lista, setLista] = useState<FeriadoExtra[]>([])
  const [data, setData] = useState('')
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [verNacionais, setVerNacionais] = useState(false)
  const ano = new Date().getFullYear()

  useEffect(() => {
    getFeriadosExtras()
      .then(setLista)
      .catch(() => {
        // sem servidor agora — a lista aparece na próxima vez
      })
  }, [])

  async function salvar(nova: FeriadoExtra[]) {
    setSalvando(true)
    try {
      const ordenada = [...nova].sort((a, b) => a.data.localeCompare(b.data))
      await salvarFeriadosExtras(ordenada)
      setLista(ordenada)
      definirFeriadosExtras(ordenada)
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
    } finally {
      setSalvando(false)
    }
  }

  async function adicionar() {
    if (!data) return void avisar('Escolha a data do feriado.')
    if (!nome.trim()) return void avisar('Dê um nome ao feriado (ex.: Aniversário de Ariquemes).')
    if (lista.some((f) => f.data === data)) return void avisar('Essa data já está na lista.')
    await salvar([...lista, { data, nome: nome.trim() }])
    setData('')
    setNome('')
  }

  const nacionais = Array.from(feriadosNacionais(ano).entries()).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="card">
      <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Feriados</h3>
      <p className="text-sm text-ink-400 mb-4">
        Fins de semana e feriados não contam nos dias úteis (tempo de cotação pendente, em andamento, previsão de
        entrega). Os nacionais já entram sozinhos — cadastre aqui os estaduais e municipais.{' '}
        <button type="button" onClick={() => setVerNacionais((v) => !v)} className="text-brand-600 hover:underline">
          {verNacionais ? 'Esconder' : 'Ver'} os nacionais de {ano}
        </button>
      </p>
      {verNacionais && (
        <ul className="mb-4 grid grid-cols-1 gap-x-6 gap-y-0.5 text-xs text-ink-500 sm:grid-cols-2">
          {nacionais.map(([chave, nomeFeriado]) => (
            <li key={chave}>
              <span className="font-mono">{dataBR(chave)}</span> — {nomeFeriado}
            </li>
          ))}
        </ul>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="field-label">Data</span>
          <input type="date" className="field-input w-44" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="block flex-1 min-w-[12rem]">
          <span className="field-label">Nome</span>
          <input
            type="text"
            className="field-input"
            placeholder="ex.: Aniversário de Ariquemes"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void adicionar()}
          />
        </label>
        <Button variant="secondary" onClick={() => void adicionar()} disabled={salvando}>
          Adicionar feriado
        </Button>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-ink-400">Nenhum feriado local cadastrado.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {lista.map((f) => (
            <li key={f.data} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-mono text-ink-600">{dataBR(f.data)}</span> — <span className="text-ink-800">{f.nome}</span>
              </span>
              <button
                type="button"
                disabled={salvando}
                onClick={() => void salvar(lista.filter((x) => x.data !== f.data))}
                className="rounded-lg px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
