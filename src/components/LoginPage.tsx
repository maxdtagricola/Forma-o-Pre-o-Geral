import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Button } from './ui/Basics'
import {
  cadastrar,
  cadastroDisponivel,
  criarSenhaNoPrimeiroAcesso,
  entrar,
  erroDaSenhaNova,
  erroDoEmailNovo,
  iniciarLogin,
  pedirCodigoDeNovaSenha,
  redefinirSenha,
  TAMANHO_MINIMO_SENHA,
} from '../auth'
import { ErroDoServidor } from '../db/db'

// -----------------------------------------------------------------------
// Entrada do site: usuário e senha (sem lista de nomes). Caminhos:
//  - usuário → senha → entra;
//  - usuário que ainda não tem senha (MÁXIMUS, GOUVÊA, MAICON no primeiro
//    uso, ou depois de o Max liberar uma nova) → cria a senha + e-mail de
//    recuperação → entra;
//  - "Cadastrar novo usuário" (um por aparelho) → entra só com o xadrez;
//  - "Esqueci minha senha" → código no e-mail de recuperação → senha nova.
// Ao entrar, auth.ts guarda a sessão e o App troca de tela sozinho.
// -----------------------------------------------------------------------

type Etapa =
  | { tipo: 'usuario' }
  | { tipo: 'senha'; usuario: string; exibicao: string }
  | { tipo: 'primeiroAcesso'; usuario: string; exibicao: string }
  | { tipo: 'cadastro' }
  | { tipo: 'esqueci'; usuario: string; exibicao: string; emailMascarado?: string }

function mensagemDe(err: unknown): string {
  return err instanceof Error ? err.message : 'Não foi possível falar com o servidor. Tente de novo.'
}

export function LoginPage() {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'usuario' })
  const [usuario, setUsuario] = useState('')

  function voltarAoInicio() {
    setEtapa({ tipo: 'usuario' })
  }

  return (
    <div className="min-h-screen bg-ink-50 flex items-center justify-center px-4 py-8">
      <div className="card max-w-sm w-full">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 font-display text-base font-bold text-white">
          R$
        </div>
        {etapa.tipo === 'usuario' && (
          <EtapaUsuario
            usuario={usuario}
            onUsuario={setUsuario}
            onSenha={(exibicao) => setEtapa({ tipo: 'senha', usuario, exibicao })}
            onPrimeiroAcesso={(exibicao) => setEtapa({ tipo: 'primeiroAcesso', usuario, exibicao })}
            onCadastrar={() => setEtapa({ tipo: 'cadastro' })}
          />
        )}
        {etapa.tipo === 'senha' && (
          <EtapaSenha
            usuario={etapa.usuario}
            exibicao={etapa.exibicao}
            onTrocarUsuario={voltarAoInicio}
            onPrimeiroAcesso={() => setEtapa({ tipo: 'primeiroAcesso', usuario: etapa.usuario, exibicao: etapa.exibicao })}
            onEsqueci={() => setEtapa({ tipo: 'esqueci', usuario: etapa.usuario, exibicao: etapa.exibicao })}
          />
        )}
        {etapa.tipo === 'primeiroAcesso' && (
          <EtapaPrimeiroAcesso usuario={etapa.usuario} exibicao={etapa.exibicao} onVoltar={voltarAoInicio} />
        )}
        {etapa.tipo === 'cadastro' && <EtapaCadastro onVoltar={voltarAoInicio} />}
        {etapa.tipo === 'esqueci' && (
          <EtapaEsqueci
            usuario={etapa.usuario}
            exibicao={etapa.exibicao}
            emailMascarado={etapa.emailMascarado}
            onCodigoEnviado={(emailMascarado) => setEtapa({ ...etapa, emailMascarado })}
            onVoltar={() => setEtapa({ tipo: 'senha', usuario: etapa.usuario, exibicao: etapa.exibicao })}
          />
        )}
      </div>
    </div>
  )
}

// --- pedaços comuns -------------------------------------------------------------------------

function Titulo({ children, subtitulo }: { children: ReactNode; subtitulo?: ReactNode }) {
  return (
    <div className="mb-5 text-center">
      <h1 className="font-display text-lg font-semibold text-ink-900">{children}</h1>
      {subtitulo && <p className="mt-1 text-sm text-ink-500">{subtitulo}</p>}
    </div>
  )
}

function Campo({ rotulo, ...props }: { rotulo: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-600">{rotulo}</span>
      <input className="field-input" spellCheck={false} {...props} />
    </label>
  )
}

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null
  return (
    <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {texto}
    </p>
  )
}

function Link({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-sm text-ink-800 underline-offset-2 hover:text-ink-900 hover:underline">
      {children}
    </button>
  )
}

function Formulario({ onEnviar, children }: { onEnviar: () => Promise<void> | void; children: ReactNode }) {
  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        void onEnviar()
      }}
    >
      {children}
    </form>
  )
}

/** Envio de formulário com "ocupado" e mensagem de erro — o mesmo jeito em todas as etapas. */
function useEnvio() {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  async function enviar(acao: () => Promise<void>) {
    setErro(null)
    setOcupado(true)
    try {
      await acao()
    } catch (err) {
      setErro(mensagemDe(err))
    } finally {
      setOcupado(false)
    }
  }
  return { ocupado, erro, setErro, enviar }
}

// --- etapas ---------------------------------------------------------------------------------

function EtapaUsuario({
  usuario,
  onUsuario,
  onSenha,
  onPrimeiroAcesso,
  onCadastrar,
}: {
  usuario: string
  onUsuario: (valor: string) => void
  onSenha: (exibicao: string) => void
  onPrimeiroAcesso: (exibicao: string) => void
  onCadastrar: () => void
}) {
  const { ocupado, erro, setErro, enviar } = useEnvio()
  return (
    <>
      <Titulo subtitulo="Formação de Preço">Entrar</Titulo>
      <Formulario
        onEnviar={() => {
          if (!usuario.trim()) return setErro('Digite seu usuário.')
          return enviar(async () => {
            const { estado, exibicao } = await iniciarLogin(usuario)
            if (estado === 'senha') onSenha(exibicao)
            else onPrimeiroAcesso(exibicao)
          })
        }}
      >
        <Campo
          rotulo="Usuário"
          name="usuario"
          autoComplete="off"
          autoCapitalize="none"
          autoFocus
          value={usuario}
          onChange={(e) => onUsuario(e.target.value)}
        />
        <Erro texto={erro} />
        <Button type="submit" variant="primary" className="w-full" disabled={ocupado}>
          {ocupado ? 'Conferindo…' : 'Continuar'}
        </Button>
      </Formulario>
      <div className="mt-5 border-t border-ink-100 pt-4 text-center">
        <Link onClick={onCadastrar}>Cadastrar novo usuário</Link>
      </div>
    </>
  )
}

function EtapaSenha({
  usuario,
  exibicao,
  onTrocarUsuario,
  onPrimeiroAcesso,
  onEsqueci,
}: {
  usuario: string
  exibicao: string
  onTrocarUsuario: () => void
  onPrimeiroAcesso: () => void
  onEsqueci: () => void
}) {
  const [senha, setSenha] = useState('')
  const { ocupado, erro, setErro, enviar } = useEnvio()
  return (
    <>
      <Titulo
        subtitulo={
          <>
            {exibicao} · <Link onClick={onTrocarUsuario}>trocar usuário</Link>
          </>
        }
      >
        Digite sua senha
      </Titulo>
      <Formulario
        onEnviar={() => {
          if (!senha) return setErro('Digite sua senha.')
          return enviar(async () => {
            try {
              await entrar(usuario, senha)
            } catch (err) {
              setSenha('')
              // o Max liberou uma nova senha enquanto esta tela estava aberta
              if (err instanceof ErroDoServidor && err.codigo === 'primeiro-acesso') return onPrimeiroAcesso()
              throw err
            }
          })
        }}
      >
        <Campo rotulo="Senha" type="password" name="senha" autoComplete="current-password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} />
        <Erro texto={erro} />
        <Button type="submit" variant="primary" className="w-full" disabled={ocupado}>
          {ocupado ? 'Entrando…' : 'Entrar'}
        </Button>
      </Formulario>
      <div className="mt-4 text-center">
        <Link onClick={onEsqueci}>Esqueci minha senha</Link>
      </div>
    </>
  )
}

function EtapaPrimeiroAcesso({ usuario, exibicao, onVoltar }: { usuario: string; exibicao: string; onVoltar: () => void }) {
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [email, setEmail] = useState('')
  const [emailConfirmacao, setEmailConfirmacao] = useState('')
  const { ocupado, erro, setErro, enviar } = useEnvio()
  return (
    <>
      <Titulo subtitulo={`Olá, ${exibicao}! Crie sua senha — ela vai ser pedida sempre que entrar.`}>Primeiro acesso</Titulo>
      <Formulario
        onEnviar={() => {
          const problema = erroDaSenhaNova(senha, confirmacao) ?? erroDoEmailNovo(email, emailConfirmacao)
          if (problema) return setErro(problema)
          return enviar(() => criarSenhaNoPrimeiroAcesso(usuario, senha, email.trim()))
        }}
      >
        <Campo
          rotulo={`Senha (mínimo ${TAMANHO_MINIMO_SENHA} caracteres)`}
          type="password"
          autoComplete="new-password"
          autoFocus
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <Campo rotulo="Confirme a senha" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
        <p className="pt-1 text-xs text-ink-500">E-mail de recuperação — usado só para mandar um código, se você esquecer a senha.</p>
        <Campo rotulo="E-mail de recuperação" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo rotulo="Confirme o e-mail" type="email" autoComplete="off" value={emailConfirmacao} onChange={(e) => setEmailConfirmacao(e.target.value)} />
        <Erro texto={erro} />
        <Button type="submit" variant="primary" className="w-full" disabled={ocupado}>
          {ocupado ? 'Salvando…' : 'Criar senha e entrar'}
        </Button>
      </Formulario>
      <div className="mt-4 text-center">
        <Link onClick={onVoltar}>Voltar</Link>
      </div>
    </>
  )
}

function EtapaCadastro({ onVoltar }: { onVoltar: () => void }) {
  const [disponivel, setDisponivel] = useState<{ disponivel: boolean; exibicao?: string } | null>(null)
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [email, setEmail] = useState('')
  const [emailConfirmacao, setEmailConfirmacao] = useState('')
  const { ocupado, erro, setErro, enviar } = useEnvio()

  useEffect(() => {
    cadastroDisponivel()
      .then(setDisponivel)
      .catch((err) => {
        setErro(mensagemDe(err))
        setDisponivel({ disponivel: true })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!disponivel) {
    return <p className="py-6 text-center text-sm text-ink-500">Conferindo este aparelho…</p>
  }

  if (!disponivel.disponivel) {
    return (
      <>
        <Titulo>Cadastrar novo usuário</Titulo>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Este aparelho já cadastrou o usuário <span className="font-semibold">{disponivel.exibicao}</span>. Cada aparelho pode
          cadastrar só um usuário — entre com ele.
        </p>
        <Button type="button" variant="primary" className="mt-4 w-full" onClick={onVoltar}>
          Voltar para o login
        </Button>
      </>
    )
  }

  return (
    <>
      <Titulo subtitulo="No começo, o acesso é só ao xadrez. O administrador define sua função no site.">Cadastrar novo usuário</Titulo>
      <Formulario
        onEnviar={() => {
          const nomeLimpo = nome.trim().replace(/\s+/g, ' ')
          let problema: string | null = null
          if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,19}$/u.test(nomeLimpo)) {
            problema = 'O nome de usuário precisa ter de 2 a 20 letras ou números (pode ter espaço, ponto, hífen ou _).'
          }
          problema = problema ?? erroDaSenhaNova(senha, confirmacao) ?? erroDoEmailNovo(email, emailConfirmacao)
          if (problema) return setErro(problema)
          return enviar(() => cadastrar(nomeLimpo, senha, email.trim()))
        }}
      >
        <Campo rotulo="Nome de usuário" autoComplete="off" autoFocus maxLength={20} value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo
          rotulo={`Senha (mínimo ${TAMANHO_MINIMO_SENHA} caracteres)`}
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <Campo rotulo="Confirme a senha" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
        <p className="pt-1 text-xs text-ink-500">E-mail de recuperação — usado só para mandar um código, se você esquecer a senha.</p>
        <Campo rotulo="E-mail de recuperação" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo rotulo="Confirme o e-mail" type="email" autoComplete="off" value={emailConfirmacao} onChange={(e) => setEmailConfirmacao(e.target.value)} />
        <Erro texto={erro} />
        <Button type="submit" variant="primary" className="w-full" disabled={ocupado}>
          {ocupado ? 'Cadastrando…' : 'Cadastrar e entrar'}
        </Button>
      </Formulario>
      <div className="mt-4 text-center">
        <Link onClick={onVoltar}>Voltar</Link>
      </div>
    </>
  )
}

function EtapaEsqueci({
  usuario,
  exibicao,
  emailMascarado,
  onCodigoEnviado,
  onVoltar,
}: {
  usuario: string
  exibicao: string
  emailMascarado?: string
  onCodigoEnviado: (emailMascarado: string) => void
  onVoltar: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [reenviado, setReenviado] = useState(false)
  const { ocupado, erro, setErro, enviar } = useEnvio()

  function enviarCodigo(reenvio: boolean) {
    return enviar(async () => {
      setReenviado(false)
      onCodigoEnviado(await pedirCodigoDeNovaSenha(usuario))
      if (reenvio) setReenviado(true)
    })
  }

  if (!emailMascarado) {
    return (
      <>
        <Titulo subtitulo={exibicao}>Esqueci minha senha</Titulo>
        <p className="mb-4 text-sm text-ink-600">Vamos mandar um código de 6 números para o seu e-mail de recuperação.</p>
        <Erro texto={erro} />
        <Button type="button" variant="primary" className="mt-3 w-full" disabled={ocupado} onClick={() => void enviarCodigo(false)}>
          {ocupado ? 'Enviando…' : 'Enviar código'}
        </Button>
        <div className="mt-4 text-center">
          <Link onClick={onVoltar}>Voltar</Link>
        </div>
      </>
    )
  }

  return (
    <>
      <Titulo subtitulo={exibicao}>Nova senha</Titulo>
      <p className="mb-3 text-sm text-ink-600">
        Enviamos um código para <span className="font-medium">{emailMascarado}</span>. Confira também a caixa de spam. Ele vale
        por 15 minutos.
      </p>
      <Formulario
        onEnviar={() => {
          const digitos = codigo.replace(/\D/g, '')
          if (digitos.length !== 6) return setErro('Digite os 6 números do código que chegou no e-mail.')
          const problema = erroDaSenhaNova(senha, confirmacao)
          if (problema) return setErro(problema)
          return enviar(() => redefinirSenha(usuario, digitos, senha))
        }}
      >
        <Campo
          rotulo="Código do e-mail"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={7}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
        <Campo
          rotulo={`Nova senha (mínimo ${TAMANHO_MINIMO_SENHA} caracteres)`}
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <Campo rotulo="Confirme a nova senha" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
        <Erro texto={erro} />
        {reenviado && <p className="text-sm text-emerald-700">Código reenviado.</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={ocupado}>
          {ocupado ? 'Salvando…' : 'Salvar nova senha e entrar'}
        </Button>
      </Formulario>
      <div className="mt-4 flex justify-between">
        <Link onClick={onVoltar}>Voltar</Link>
        <Link onClick={() => void enviarCodigo(true)}>Reenviar código</Link>
      </div>
    </>
  )
}
