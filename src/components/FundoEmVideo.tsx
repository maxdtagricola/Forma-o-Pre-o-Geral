import { useEffect, useMemo, useRef } from 'react'

// Vídeo de fundo da Tela Inicial, cobrindo a tela toda (atrás do conteúdo, sem som). O original é
// 640×360; as versões em public/fundo foram ampliadas fora do site (Lanczos, menos ruído de compressão
// e um pouco de nitidez) pra 1920×1080 e 1280×720 — o navegador não precisa esticar 3 vezes o vídeo
// pequeno. Telas menores baixam a de 720 (metade do tamanho).

const BASE = `${import.meta.env.BASE_URL}fundo/`

export function FundoEmVideo({ pausado }: { pausado: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  // quem pediu menos movimento no sistema fica só com a imagem parada
  const menosMovimento = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])
  const arquivo = useMemo(() => (window.innerWidth >= 1024 ? 'samurai-1080.mp4' : 'samurai-720.mp4'), [])

  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.muted = true
    if (pausado || menosMovimento) video.pause()
    else void video.play().catch(() => {
      // navegador que bloqueia o play automático: fica a imagem de capa
    })
  }, [pausado, menosMovimento])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {menosMovimento ? (
        <img src={`${BASE}samurai-capa.jpg`} alt="" className="h-full w-full object-cover" />
      ) : (
        <video
          ref={ref}
          className="h-full w-full object-cover"
          src={`${BASE}${arquivo}`}
          poster={`${BASE}samurai-capa.jpg`}
          muted
          loop
          playsInline
          autoPlay={!pausado}
          preload="auto"
          disablePictureInPicture
        />
      )}
      {/* película da cor do tema: o vídeo fica de fundo, sem brigar com o texto (clara no claro, escura no escuro) */}
      <div className="absolute inset-0 bg-ink-50/60" />
    </div>
  )
}
