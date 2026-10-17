import { useEffect, useState } from 'react'
import { cadastrarUsuario, definirPapel, excluirUsuario, liberarNovaSenha, listarUsuarios, type UsuarioCadastrado } from '../auth'
import { avisar, confirmar } from '../dialogs'
import { ABAS_CONFIGURAVEIS, ABAS_PADRAO, getAbasPorUsuario, salvarAbasDoUsuario } from '../abasPermitidas'
import type { TabKey } from './Layout'
import type { PapelUsuario } from '../sessaoUsuario'

const ROTULO_PAPEL: Record<PapelUsuario, string> = {
  xadrez: 'Só xadrez (Tela Inicial)',
  admin: 'Administrador (site completo)',
}

const NOME_VALIDO = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,19}$/u

/** Configurações › Usuários — só pro Max: cadastra quem vai usar o site, define a função e as abas de
 * cada um, libera senha nova, exclui. */
/** `embutido`: dentro da janela de Configurações, que já tem a moldura e o título. */
export function UsuariosCard({ embutido = false }: { embutido?: boolean } = {}) {
  const [usuarios, setUsuarios] = useState<UsuarioCadastrado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [abasPorUsuario, setAbasPorUsuario] = useState<Record<string, TabKey[]>>({})
  const [editandoAbas, setEditandoAbas] = useState<{ login: string; abas: Set<TabKey> } | null>(null)
  const [nomeNovo, setNomeNovo] = useState('')
  const [papelNovo, setPapelNovo] = useState<PapelUsuario>('admin')

  async function recarregar() {
    setCarregando(true)
    try {
      const [lista, abas] = await Promise.all([listarUsuarios(), getAbasPorUsuario()])
      // quem espera uma definição primeiro, depois na ordem do cadastro
      setUsuarios(lista.sort((a, b) => Number(b.pendente) - Number(a.pendente) || a.criadoEm.localeCompare(b.criadoEm)))
      setAbasPorUsuario(abas)
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao carregar os usuários.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void recarregar()
  }, [])

  async function executar(login: string, acao: () => Promise<void>, sucesso: string) {
    setOcupado(login)
    try {
      await acao()
      await recarregar()
      void avisar(sucesso)
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
    } finally {
      setOcupado(null)
    }
  }

  async function handleCadastrar() {
    const nome = nomeNovo.trim().replace(/\s+/g, ' ')
    if (!NOME_VALIDO.test(nome)) {
      void avisar('O nome de usuário precisa ter de 2 a 20 letras ou números (pode ter espaço, ponto, hífen ou _).')
      return
    }
    await executar(
      '__novo__',
      async () => {
        await cadastrarUsuario(nome, papelNovo)
        setNomeNovo('')
      },
      `${nome} cadastrado como "${ROTULO_PAPEL[papelNovo]}". No primeiro acesso, ele digita o nome de usuário e cria a própria senha` +
        (papelNovo === 'admin' ? ' — as abas que ele vê dá pra escolher aqui, em "Abas".' : '.'),
    )
  }

  async function handlePapel(u: UsuarioCadastrado, papel: PapelUsuario) {
    if (!(await confirmar(`Definir ${u.exibicao} como "${ROTULO_PAPEL[papel]}"?`))) return
    await executar(u.login, () => definirPapel(u.login, papel), `${u.exibicao} agora é "${ROTULO_PAPEL[papel]}".`)
  }

  async function handleLiberarSenha(u: UsuarioCadastrado) {
    const ok = await confirmar(
      `Apagar a senha de ${u.exibicao}? Ele sai de todos os aparelhos e, no próximo acesso, cria uma senha nova (e informa o e-mail de recuperação de novo).`,
      { confirmText: 'Liberar nova senha' },
    )
    if (!ok) return
    await executar(u.login, () => liberarNovaSenha(u.login), `Senha de ${u.exibicao} liberada — ele cria uma nova no próximo acesso.`)
  }

  async function handleExcluir(u: UsuarioCadastrado) {
    const ok = await confirmar(`Excluir o usuário ${u.exibicao}? As partidas de xadrez dele continuam salvas.`, {
      confirmText: 'Excluir',
      tone: 'danger',
    })
    if (!ok) return
    await executar(u.login, () => excluirUsuario(u.login), `Usuário ${u.exibicao} excluído.`)
  }

  function abasDe(login: string): TabKey[] {
    return abasPorUsuario[login] ?? ABAS_PADRAO
  }

  function alternarAba(tab: TabKey) {
    setEditandoAbas((atual) => {
      if (!atual) return atual
      const abas = new Set(atual.abas)
      if (abas.has(tab)) abas.delete(tab)
      else abas.add(tab)
      return { ...atual, abas }
    })
  }

  async function handleSalvarAbas(u: UsuarioCadastrado) {
    if (!editandoAbas) return
    // na ordem do menu
    const abas = ABAS_CONFIGURAVEIS.map((a) => a.key).filter((k) => editandoAbas.abas.has(k))
    await executar(
      u.login,
      async () => {
        await salvarAbasDoUsuario(u.login, abas)
        setEditandoAbas(null)
      },
      `Abas de ${u.exibicao} salvas — valem na próxima vez que ele abrir o site.`,
    )
  }

  const grupos = Array.from(new Set(ABAS_CONFIGURAVEIS.map((a) => a.grupo)))

  return (
    <div className={embutido ? undefined : 'card'}>
      {!embutido && <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Usuários</h3>}
      <p className="text-sm text-ink-400 mb-4">
        Só você cadastra quem vai usar o site. Aqui também ficam a função e as abas que cada um vê.
      </p>

      <form
        className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-ink-100 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void handleCadastrar()
        }}
      >
        <label className="min-w-[10rem] flex-1">
          <span className="field-label">Novo usuário</span>
          <input
            className="field-input"
            maxLength={20}
            autoComplete="off"
            placeholder="Nome de usuário"
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
          />
        </label>
        <label>
          <span className="field-label">Função</span>
          <select
            className="field-input w-auto"
            aria-label="Função do novo usuário"
            value={papelNovo}
            onChange={(e) => setPapelNovo(e.target.value as PapelUsuario)}
          >
            <option value="admin">{ROTULO_PAPEL.admin}</option>
            <option value="xadrez">{ROTULO_PAPEL.xadrez}</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={ocupado === '__novo__' || !nomeNovo.trim()}
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-surface transition hover:opacity-90 disabled:opacity-50"
        >
          Cadastrar
        </button>
        <p className="w-full text-xs text-ink-400">
          A pessoa entra com esse nome e cria a própria senha (e o e-mail de recuperação) no primeiro acesso.
        </p>
      </form>

      {carregando && usuarios.length === 0 ? (
        <p className="text-sm text-ink-400">Carregando…</p>
      ) : (
        <div className="divide-y divide-ink-100">
          {usuarios.map((u) => {
            const abas = abasDe(u.login)
            const editando = editandoAbas?.login === u.login ? editandoAbas : null
            return (
              <div key={u.login} className="py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">
                      {u.exibicao}
                      {u.nome !== u.exibicao && <span className="font-normal text-ink-400"> · no app: {u.nome}</span>}
                      {u.pendente && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">aguardando função</span>
                      )}
                      {!u.temSenha && <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">ainda sem senha</span>}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {u.email || 'sem e-mail de recuperação'}
                      {u.criadoEm && ` · desde ${u.criadoEm.slice(0, 10).split('-').reverse().join('/')}`}
                      {!u.gestor && u.papel === 'admin' && (
                        <>
                          {' · abas: '}
                          {abas.length === ABAS_CONFIGURAVEIS.length ? 'todas' : `${abas.length} de ${ABAS_CONFIGURAVEIS.length}`}
                        </>
                      )}
                    </p>
                  </div>
                  {u.gestor ? (
                    <span className="text-xs text-ink-400">Administrador (gerencia os usuários, vê todas as abas)</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="field-input w-auto py-1.5 text-sm"
                        aria-label={`Função de ${u.exibicao}`}
                        value={u.papel}
                        disabled={ocupado === u.login}
                        onChange={(e) => void handlePapel(u, e.target.value as PapelUsuario)}
                      >
                        <option value="xadrez">{ROTULO_PAPEL.xadrez}</option>
                        <option value="admin">{ROTULO_PAPEL.admin}</option>
                      </select>
                      {u.papel === 'admin' && (
                        <button
                          type="button"
                          aria-expanded={!!editando}
                          disabled={ocupado === u.login}
                          onClick={() => setEditandoAbas(editando ? null : { login: u.login, abas: new Set(abas) })}
                          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                        >
                          Abas
                        </button>
                      )}
                      {u.pendente && (
                        <button
                          type="button"
                          disabled={ocupado === u.login}
                          onClick={() => void handlePapel(u, u.papel)}
                          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                        >
                          Manter só xadrez
                        </button>
                      )}
                      {u.temSenha && (
                        <button
                          type="button"
                          disabled={ocupado === u.login}
                          onClick={() => void handleLiberarSenha(u)}
                          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                        >
                          Liberar nova senha
                        </button>
                      )}
                      {!u.semente && (
                        <button
                          type="button"
                          disabled={ocupado === u.login}
                          onClick={() => void handleExcluir(u)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {editando && (
                  <fieldset className="mt-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
                    <legend className="px-1 text-xs font-semibold text-ink-700">Abas que {u.exibicao} vê</legend>
                    <p className="mb-2 text-xs text-ink-400">
                      A Tela Inicial e as partes pessoais de Configurações (minha conta, saída automática, vídeo de fundo)
                      aparecem sempre.
                    </p>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                      {grupos.map((grupo) => (
                        <div key={grupo}>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{grupo}</p>
                          {ABAS_CONFIGURAVEIS.filter((a) => a.grupo === grupo).map((a) => (
                            <label key={a.key} className="flex items-center gap-2 py-0.5 text-sm text-ink-700">
                              <input type="checkbox" checked={editando.abas.has(a.key)} onChange={() => alternarAba(a.key)} />
                              {a.label}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={ocupado === u.login}
                        onClick={() => void handleSalvarAbas(u)}
                        className="rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-surface transition hover:opacity-90"
                      >
                        Salvar abas
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoAbas({ login: u.login, abas: new Set(ABAS_CONFIGURAVEIS.map((a) => a.key)) })}
                        className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100"
                      >
                        Marcar todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoAbas({ login: u.login, abas: new Set() })}
                        className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100"
                      >
                        Desmarcar todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoAbas(null)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-500 hover:bg-ink-100"
                      >
                        Cancelar
                      </button>
                    </div>
                  </fieldset>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
