import { ABAS_CONFIGURAVEIS } from '../abasPermitidas'
import { nomeDoStatus, statusDe, type TipoStatus } from '../statusConfig'
import { PARTES_TELA_INICIAL, TODAS_AS_PARTES, type ParteTelaInicial } from '../telaInicialPorUsuario'
import type { PermissoesDoUsuario } from '../tiposUsuario'
import type { TabKey } from './Layout'

/** Caixinhas de abas, do que aparece na Tela Inicial e de status (pra quais status pode mudar) — o mesmo
 * editor pra um usuário e pra um tipo de usuário. Tudo marcado = sem restrição (vale também pro que
 * for criado depois). */
export function EditorPermissoes({ valor, onChange }: { valor: PermissoesDoUsuario; onChange: (novo: PermissoesDoUsuario) => void }) {
  const grupos = Array.from(new Set(ABAS_CONFIGURAVEIS.map((a) => a.grupo)))
  const partesMarcadas = valor.telaInicial ?? TODAS_AS_PARTES

  function definirPartes(marcadas: ParteTelaInicial[]) {
    const todas = TODAS_AS_PARTES.every((p) => marcadas.includes(p))
    onChange({ ...valor, telaInicial: todas ? null : TODAS_AS_PARTES.filter((p) => marcadas.includes(p)) })
  }

  function alternarParte(p: ParteTelaInicial) {
    definirPartes(partesMarcadas.includes(p) ? partesMarcadas.filter((x) => x !== p) : [...partesMarcadas, p])
  }

  function alternarAba(tab: TabKey) {
    const abas = valor.abas.includes(tab) ? valor.abas.filter((a) => a !== tab) : [...valor.abas, tab]
    // na ordem do menu
    onChange({ ...valor, abas: ABAS_CONFIGURAVEIS.map((a) => a.key).filter((k) => abas.includes(k)) })
  }

  function marcadosDe(tipo: TipoStatus): string[] {
    const lista = tipo === 'cotacoes' ? valor.statusCotacoes : valor.statusNotas
    return lista ?? statusDe(tipo)
  }

  function definirStatus(tipo: TipoStatus, marcados: string[]) {
    // todos marcados: sem restrição (null), e aí os status criados depois também valem
    const todos = statusDe(tipo).every((s) => marcados.includes(s))
    const novo = todos ? null : statusDe(tipo).filter((s) => marcados.includes(s))
    onChange(tipo === 'cotacoes' ? { ...valor, statusCotacoes: novo } : { ...valor, statusNotas: novo })
  }

  function alternarStatus(tipo: TipoStatus, s: string) {
    const marcados = marcadosDe(tipo)
    definirStatus(tipo, marcados.includes(s) ? marcados.filter((x) => x !== s) : [...marcados, s])
  }

  const atalhos = (onTodos: () => void, onNenhum: () => void) => (
    <span className="ml-2 text-[11px] font-normal normal-case tracking-normal">
      <button type="button" onClick={onTodos} className="text-ink-600 underline-offset-2 hover:underline">
        todos
      </button>
      {' · '}
      <button type="button" onClick={onNenhum} className="text-ink-600 underline-offset-2 hover:underline">
        nenhum
      </button>
    </span>
  )

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-ink-700">
          Abas que vê
          {atalhos(
            () => onChange({ ...valor, abas: ABAS_CONFIGURAVEIS.map((a) => a.key) }),
            () => onChange({ ...valor, abas: [] }),
          )}
        </legend>
        <p className="mb-2 text-[11px] text-ink-400">
          A Tela Inicial e as partes pessoais de Configurações (minha conta, saída automática, vídeo de fundo) aparecem sempre.
        </p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {grupos.map((grupo) => (
            <div key={grupo}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{grupo}</p>
              {ABAS_CONFIGURAVEIS.filter((a) => a.grupo === grupo).map((a) => (
                <label key={a.key} className="flex items-center gap-2 py-0.5 text-sm text-ink-700">
                  <input type="checkbox" checked={valor.abas.includes(a.key)} onChange={() => alternarAba(a.key)} />
                  {a.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-ink-700">
          O que aparece na Tela Inicial
          {atalhos(
            () => definirPartes(TODAS_AS_PARTES),
            () => definirPartes([]),
          )}
        </legend>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {PARTES_TELA_INICIAL.map((p) => (
            <label key={p.key} className="flex items-start gap-2 py-0.5 text-sm text-ink-700">
              <input
                type="checkbox"
                className="mt-1"
                aria-label={`Tela Inicial: ${p.label}`}
                checked={partesMarcadas.includes(p.key)}
                onChange={() => alternarParte(p.key)}
              />
              <span>
                {p.label}
                {p.dica && <span className="block text-[11px] text-ink-400">{p.dica}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {(['cotacoes', 'notas'] as const).map((tipo) => {
        const marcados = marcadosDe(tipo)
        return (
          <fieldset key={tipo}>
            <legend className="mb-1 text-xs font-semibold text-ink-700">
              {tipo === 'cotacoes' ? 'Status das cotações' : 'Status de frete e notas'} para os quais pode mudar
              {atalhos(
                () => definirStatus(tipo, statusDe(tipo)),
                () => definirStatus(tipo, []),
              )}
            </legend>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {statusDe(tipo).map((s) => (
                <label key={s} className="flex items-center gap-2 py-0.5 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    aria-label={`${tipo === 'cotacoes' ? 'Cotação' : 'Nota'}: ${nomeDoStatus(s, tipo)}`}
                    checked={marcados.includes(s)}
                    onChange={() => alternarStatus(tipo, s)}
                  />
                  {nomeDoStatus(s, tipo)}
                </label>
              ))}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
