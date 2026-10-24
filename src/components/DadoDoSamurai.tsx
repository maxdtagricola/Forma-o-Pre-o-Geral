import { useEffect, useState } from 'react'
import { FACES_QUE_ANDAM, MINUTOS_ENTRE_DADOS, proximoLancamento, ultimoLancamento } from '../samuraiAnimado'

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Configurações › Vídeo de fundo: o último dado do samurai e quando sai o próximo. */
export function DadoDoSamurai() {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const ultimo = ultimoLancamento(agora)
  const proximo = proximoLancamento(agora)
  const falta = Math.max(0, proximo - agora)
  const emQuanto = falta >= 60_000 ? `em ${Math.ceil(falta / 60_000)} min` : `em ${Math.ceil(falta / 1000)} s`
  return (
    <div className="mt-4 rounded-xl border border-ink-100 px-4 py-3" aria-label="Dado do samurai">
      <p className="text-sm font-medium text-ink-900">O dado do samurai</p>
      <p className="mt-0.5 text-xs text-ink-400">
        A cada {MINUTOS_ENTRE_DADOS} minutos ele joga um dado de 6 lados: com {FACES_QUE_ANDAM.join(' ou ')}, anda até a lua (e
        volta pela névoa); com outro número, fica no lugar até o próximo. O dado é o mesmo em todas as telas.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span aria-hidden className="text-4xl leading-none text-ink-800">
          {FACES[ultimo.dado - 1]}
        </span>
        <span className="text-sm text-ink-700">
          Último dado, às {hora(ultimo.quando)}: <strong className="font-semibold">{ultimo.dado}</strong> —{' '}
          {ultimo.anda ? 'foi até a lua' : 'ficou no lugar'}
          <span className="block text-xs text-ink-400">
            Próximo às {hora(proximo)} ({emQuanto})
          </span>
        </span>
      </div>
    </div>
  )
}
