import { useEffect, useMemo, useRef } from 'react'

// Vídeo de fundo (todas as abas menos o Xadrez), cobrindo a tela toda atrás do conteúdo, sem som. O
// original é 640×360; as versões em public/fundo foram ampliadas fora do site, quadro a quadro, por IA
// (Real-ESRGAN, modelo de vídeo em estilo desenho, 3×) pra 1920×1080 — reconstrói os contornos em vez
// de só esticar — e daí reduzidas pra 1280×720. Telas menores baixam a de 720 (metade do tamanho).

const BASE = `${import.meta.env.BASE_URL}fundo/`

export function FundoEmVideo({
  pausado,
  forte = false,
}: {
  pausado: boolean
  /** Película mais forte (abas de trabalho, com mais texto e tabela): o fundo fica mais discreto. */
  forte?: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  // quem pediu menos movimento no sistema fica só com a imagem parada
  const menosMovimento = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])
  const arquivo = useMemo(() => (window.innerWidth >= 1024 ? 'samurai-ia-1080.mp4' : 'samurai-ia-720.mp4'), [])

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
        <img src={`${BASE}samurai-ia-capa.jpg`} alt="" className="h-full w-full object-cover" />
      ) : (
        <video
          ref={ref}
          className="h-full w-full object-cover"
          src={`${BASE}${arquivo}`}
          poster={`${BASE}samurai-ia-capa.jpg`}
          muted
          loop
          playsInline
          autoPlay={!pausado}
          preload="auto"
          disablePictureInPicture
        />
      )}
      {/* película da cor do tema: o vídeo fica de fundo, sem brigar com o texto (clara no claro, escura no escuro) */}
      <div className={`absolute inset-0 transition-colors duration-500 ${forte ? 'bg-ink-50/75' : 'bg-ink-50/60'}`} />
    </div>
  )
}
