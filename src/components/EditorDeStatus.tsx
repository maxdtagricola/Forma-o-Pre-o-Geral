import { useState } from 'react'
import { Button } from './ui/Basics'
import { avisar, confirmar } from '../dialogs'
import { corPadraoDoStatus } from '../statusColors'
import {
  USO_DO_STATUS,
  codigoParaStatusNovo,
  defsDe,
  salvarStatusConfig,
  statusDe,
  type DefStatus,
  type TipoStatus,
} from '../statusConfig'

const OUTRO: Record<TipoStatus, TipoStatus> = { cotacoes: 'notas', notas: 'cotacoes' }

/** Configurações › Status (cotações, ou frete e notas): nome, cor, ordem, status novos. Os do sistema
 * podem ser renomeados e mudar de lugar em relação aos criados, mas não ser excluídos nem trocar de
 * ordem entre si (ver statusConfig.ts). A cor grava na hora; o resto, no "Salvar status". */
export function EditorDeStatus({
  tipo,
  cores,
  onCor,
  contarUso,
}: {
  tipo: TipoStatus
  cores: Record<string, string>
  onCor: (status: string, cor: string) => void
  /** Quantas cotações/notas estão nesse status agora — status em uso não é excluído. */
  contarUso: (status: string) => Promise<number>
}) {
  const [rascunho, setRascunho] = useState<DefStatus[]>(() => defsDe(tipo).map((d) => ({ ...d })))
  const [novoNome, setNovoNome] = useState('')
  const [depoisDe, setDepoisDe] = useState(() => {
    const lista = statusDe(tipo)
    // por padrão, antes do último (nas cotações, antes de ARQUIVO)
    return lista[Math.max(0, lista.length - 2)]
  })
  const [salvando, setSalvando] = useState(false)
  const lista = rascunho.map((d) => d.id)
  const mudou = JSON.stringify(rascunho) !== JSON.stringify(defsDe(tipo))

  function cor(id: string): string {
    return cores[id] || corPadraoDoStatus(id, lista)
  }

  function renomear(i: number, nome: string) {
    setRascunho((atual) => atual.map((d, k) => (k === i ? { ...d, nome } : d)))
  }

  /** Dois do sistema não trocam de ordem entre si — as regras do site dependem da ordem deles. */
  function podeTrocar(i: number, j: number): boolean {
    return j >= 0 && j < rascunho.length && !(rascunho[i].sistema && rascunho[j].sistema)
  }

  function mover(i: number, j: number) {
    if (!podeTrocar(i, j)) return
    setRascunho((atual) => {
      const nova = [...atual]
      ;[nova[i], nova[j]] = [nova[j], nova[i]]
      return nova
    })
  }

  function criar() {
    const nome = novoNome.trim().replace(/\s+/g, ' ')
    if (nome.length < 2) return void avisar('Dê um nome ao status novo (pelo menos 2 letras).')
    if (rascunho.some((d) => d.nome.toUpperCase() === nome.toUpperCase())) return void avisar('Já existe um status com esse nome.')
    const id = codigoParaStatusNovo(nome, [...lista, ...statusDe(OUTRO[tipo])])
    const posicao = Math.max(0, lista.indexOf(depoisDe)) + 1
    setRascunho((atual) => [...atual.slice(0, posicao), { id, nome: nome.toUpperCase(), sistema: false }, ...atual.slice(posicao)])
    setNovoNome('')
  }

  async function excluir(i: number) {
    const d = rascunho[i]
    const emUso = await contarUso(d.id)
    if (emUso > 0) {
      void avisar(
        `${emUso} ${tipo === 'cotacoes' ? (emUso === 1 ? 'cotação está' : 'cotações estão') : emUso === 1 ? 'nota está' : 'notas estão'} em "${d.nome}" agora. Mude o status delas antes de excluir.`,
      )
      return
    }
    if (!(await confirmar(`Excluir o status "${d.nome}"? (Ele só some de verdade depois de "Salvar status".)`, { confirmText: 'Excluir', tone: 'danger' }))) return
    setRascunho((atual) => atual.filter((_, k) => k !== i))
  }

  async function salvar() {
    const vazio = rascunho.find((d) => !d.nome.trim())
    if (vazio) return void avisar('Todo status precisa de um nome.')
    const nomes = rascunho.map((d) => d.nome.trim().toUpperCase())
    const repetido = nomes.find((n, i) => nomes.indexOf(n) !== i)
    if (repetido) return void avisar(`Há dois status com o nome "${repetido}".`)
    setSalvando(true)
    try {
      // o campo só mostra em maiúsculas (CSS) — grava em maiúsculas de verdade, como os do sistema
      const limpo = rascunho.map((d) => ({ ...d, nome: d.nome.trim().replace(/\s+/g, ' ').toUpperCase() }))
      await salvarStatusConfig({ [tipo]: limpo, [OUTRO[tipo]]: defsDe(OUTRO[tipo]) } as Record<TipoStatus, DefStatus[]>)
      setRascunho(defsDe(tipo).map((d) => ({ ...d })))
      void avisar('Status salvos — já valem em todo o site (nos outros aparelhos, ao abrir o site de novo).')
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar os status no servidor.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div>
      <p className="mb-4 text-xs text-ink-400">
        O nome é o que aparece no site — renomear não muda nenhuma {tipo === 'cotacoes' ? 'cotação' : 'nota'} já gravada. Os
        marcados com "do sistema" disparam alguma regra do site: podem ser renomeados, mas não excluídos, e não trocam de ordem
        entre si. Os criados por você entram onde quiser e podem ser excluídos. A cor muda na hora; o resto, no "Salvar status".
      </p>
      <ol className="divide-y divide-ink-100 rounded-xl border border-ink-100" aria-label="Status, na ordem do fluxo">
        {rascunho.map((d, i) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <input
              type="color"
              value={cor(d.id)}
              onChange={(e) => onCor(d.id, e.target.value)}
              aria-label={`Cor de ${d.nome}`}
              className="h-7 w-9 shrink-0 cursor-pointer rounded border border-ink-200 p-0"
            />
            <input
              className="field-input min-w-[10rem] flex-1 py-1.5 text-sm font-medium uppercase"
              value={d.nome}
              maxLength={40}
              aria-label={`Nome do status ${d.id}`}
              onChange={(e) => renomear(i, e.target.value)}
            />
            {d.sistema ? (
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600" title={USO_DO_STATUS[tipo][d.id]}>
                do sistema
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">criado por você</span>
            )}
            <span className="flex gap-1">
              <button
                type="button"
                onClick={() => mover(i, i - 1)}
                disabled={!podeTrocar(i, i - 1)}
                aria-label={`Subir ${d.nome}`}
                className="h-7 w-7 rounded-lg border border-ink-200 text-xs text-ink-600 hover:bg-ink-50 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => mover(i, i + 1)}
                disabled={!podeTrocar(i, i + 1)}
                aria-label={`Descer ${d.nome}`}
                className="h-7 w-7 rounded-lg border border-ink-200 text-xs text-ink-600 hover:bg-ink-50 disabled:opacity-30"
              >
                ↓
              </button>
              {!d.sistema && (
                <button
                  type="button"
                  onClick={() => void excluir(i)}
                  aria-label={`Excluir ${d.nome}`}
                  className="rounded-lg px-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  Excluir
                </button>
              )}
            </span>
            {d.sistema && USO_DO_STATUS[tipo][d.id] && <p className="w-full pl-11 text-[11px] text-ink-400">{USO_DO_STATUS[tipo][d.id]}</p>}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-ink-200 p-3">
        <label className="min-w-[10rem] flex-1">
          <span className="field-label">Status novo</span>
          <input
            className="field-input uppercase"
            maxLength={40}
            placeholder="Nome do status"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                criar()
              }
            }}
          />
        </label>
        <label>
          <span className="field-label">Entra depois de</span>
          <select className="field-input w-auto" value={depoisDe} onChange={(e) => setDepoisDe(e.target.value)} aria-label="Entra depois de">
            {rascunho.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={criar}>
          Criar status
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void salvar()} disabled={!mudou || salvando}>
          {salvando ? 'Salvando…' : 'Salvar status'}
        </Button>
        {mudou && (
          <Button variant="ghost" onClick={() => setRascunho(defsDe(tipo).map((d) => ({ ...d })))}>
            Desfazer alterações
          </Button>
        )}
      </div>
    </div>
  )
}
