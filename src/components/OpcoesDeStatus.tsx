import { nomeDoStatus, podeMudarStatusPara, statusDe, type TipoStatus } from '../statusConfig'

/** As <option> de um <select> de status: na ordem do fluxo, com o nome editado em Configurações. Num
 * select que MUDA o status, os sem permissão ficam desativados (o atual sempre aparece); num filtro
 * (`filtro`), todos valem. */
export function OpcoesDeStatus({
  tipo,
  atual,
  lista,
  filtro = false,
}: {
  tipo: TipoStatus
  atual?: string
  /** Só estes (ex.: os do faturamento), em vez da lista toda. */
  lista?: string[]
  filtro?: boolean
}) {
  const base = lista ?? statusDe(tipo)
  const ids = atual && !base.includes(atual) ? [atual, ...base] : base
  return (
    <>
      {ids.map((id) => {
        const pode = filtro || id === atual || podeMudarStatusPara(tipo, id)
        return (
          <option key={id} value={id} disabled={!pode}>
            {nomeDoStatus(id, tipo)}
            {pode ? '' : ' (sem permissão)'}
          </option>
        )
      })}
    </>
  )
}
