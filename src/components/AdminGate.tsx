import { useEffect, useState } from 'react'
import { ADMINS, type AdminName } from '../types'
import { listPartidasXadrez } from '../db/xadrezRepo'

export function AdminGate({
  onSelect,
  onSelectPlayer,
}: {
  onSelect: (admin: AdminName) => void
  onSelectPlayer: (nome: string) => void
}) {
  const [jogadoresExistentes, setJogadoresExistentes] = useState<string[]>([])
  const [novoNome, setNovoNome] = useState('')

  useEffect(() => {
    listPartidasXadrez()
      .then((partidas) => {
        const nomes = Array.from(new Set(partidas.map((p) => p.jogador))).filter(
          (nome) => !(ADMINS as string[]).includes(nome),
        )
        setJogadoresExistentes(nomes)
      })
      .catch(() => {
        // lista de jogadores é só um atalho — se o servidor falhar, segue só com o campo de nome
      })
  }, [])

  function entrarComoNovoJogador() {
    const nome = novoNome.trim()
    if (!nome) return
    onSelectPlayer(nome)
  }

  return (
    <div className="min-h-screen bg-ink-50 flex items-center justify-center px-4 py-8">
      <div className="card max-w-sm w-full text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 font-display text-base font-bold text-white">
          R$
        </div>
        <h1 className="font-display text-lg font-semibold text-ink-900 mb-5">Quem está usando?</h1>
        <div className="flex flex-col gap-2">
          {ADMINS.map((admin) => (
            <button
              key={admin}
              type="button"
              onClick={() => onSelect(admin)}
              className="rounded-lg border border-ink-200 px-4 py-3 text-sm font-medium text-ink-800 hover:border-brand-600 hover:bg-ink-50 transition"
            >
              {admin}
            </button>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-ink-100">
          {jogadoresExistentes.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-3">
              {jogadoresExistentes.map((nome) => (
                <button
                  key={nome}
                  type="button"
                  onClick={() => onSelectPlayer(nome)}
                  className="pill-tab border border-ink-200 text-ink-600 hover:bg-ink-50"
                >
                  {nome}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              className="field-input flex-1"
              placeholder="Adicionar novo jogador"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && entrarComoNovoJogador()}
            />
            <button
              type="button"
              onClick={entrarComoNovoJogador}
              disabled={!novoNome.trim()}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:border-brand-600 hover:bg-ink-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
