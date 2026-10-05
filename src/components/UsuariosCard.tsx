import { useEffect, useState } from 'react'
import { definirPapel, excluirUsuario, liberarNovaSenha, listarUsuarios, type UsuarioCadastrado } from '../auth'
import { avisar, confirmar } from '../dialogs'
import type { PapelUsuario } from '../sessaoUsuario'

const ROTULO_PAPEL: Record<PapelUsuario, string> = {
  xadrez: 'Só xadrez (Tela Inicial)',
  admin: 'Administrador (site completo)',
}

/** Configurações › Usuários — só pro Max: define a função de quem se cadastrou, libera senha nova, exclui. */
export function UsuariosCard() {
  const [usuarios, setUsuarios] = useState<UsuarioCadastrado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)

  async function recarregar() {
    setCarregando(true)
    try {
      const lista = await listarUsuarios()
      // quem espera uma definição primeiro, depois na ordem do cadastro
      setUsuarios(lista.sort((a, b) => Number(b.pendente) - Number(a.pendente) || a.criadoEm.localeCompare(b.criadoEm)))
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

  return (
    <div className="card">
      <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Usuários</h3>
      <p className="text-sm text-ink-400 mb-4">
        Quem se cadastra sozinho começa só com o xadrez — defina aqui a função de cada um.
      </p>
      {carregando && usuarios.length === 0 ? (
        <p className="text-sm text-ink-400">Carregando…</p>
      ) : (
        <div className="divide-y divide-ink-100">
          {usuarios.map((u) => (
            <div key={u.login} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
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
                </p>
              </div>
              {u.gestor ? (
                <span className="text-xs text-ink-400">Administrador (gerencia os usuários)</span>
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
          ))}
        </div>
      )}
    </div>
  )
}
