import { useState } from 'react'
import { Button } from './ui/Basics'
import { alterarMinhaConta, erroDaSenhaNova, erroDoEmailNovo, TAMANHO_MINIMO_SENHA } from '../auth'
import { avisar } from '../dialogs'
import type { UsuarioLogado } from '../sessaoUsuario'

/** Troca a própria senha e/ou o e-mail de recuperação — sempre pedindo a senha atual. */
export function MinhaContaModal({ usuario, onFechar }: { usuario: UsuarioLogado; onFechar: () => void }) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [emailConfirmacao, setEmailConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function handleSalvar() {
    setErro(null)
    const trocaSenha = novaSenha !== '' || confirmacao !== ''
    const trocaEmail = novoEmail.trim() !== '' || emailConfirmacao.trim() !== ''
    if (!trocaSenha && !trocaEmail) return setErro('Preencha a nova senha ou o novo e-mail.')
    if (!senhaAtual) return setErro('Digite sua senha atual para confirmar.')
    const problema = (trocaSenha ? erroDaSenhaNova(novaSenha, confirmacao) : null) ?? (trocaEmail ? erroDoEmailNovo(novoEmail, emailConfirmacao) : null)
    if (problema) return setErro(problema)
    setSalvando(true)
    try {
      await alterarMinhaConta({
        senhaAtual,
        novaSenha: trocaSenha ? novaSenha : undefined,
        novoEmail: trocaEmail ? novoEmail.trim() : undefined,
      })
      onFechar()
      void avisar(
        trocaSenha
          ? 'Dados salvos. Nos outros aparelhos onde você estava logado, entre de novo com a senha nova.'
          : 'E-mail de recuperação atualizado.',
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
    } finally {
      setSalvando(false)
    }
  }

  const campo = 'field-input'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="card max-w-sm w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold text-ink-900">Minha conta</h3>
        <p className="mb-4 text-sm text-ink-500">
          {usuario.exibicao}
          {usuario.emailMascarado && ` · recuperação: ${usuario.emailMascarado}`}
        </p>
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void handleSalvar()
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Trocar senha</p>
          <input
            className={campo}
            type="password"
            autoComplete="new-password"
            placeholder={`Nova senha (mínimo ${TAMANHO_MINIMO_SENHA} caracteres)`}
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
          />
          <input
            className={campo}
            type="password"
            autoComplete="new-password"
            placeholder="Confirme a nova senha"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
          />
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Trocar e-mail de recuperação</p>
          <input className={campo} type="email" autoComplete="email" placeholder="Novo e-mail" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />
          <input
            className={campo}
            type="email"
            autoComplete="off"
            placeholder="Confirme o novo e-mail"
            value={emailConfirmacao}
            onChange={(e) => setEmailConfirmacao(e.target.value)}
          />
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Confirmação</p>
          <input
            className={campo}
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha atual"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
          />
          {erro && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
