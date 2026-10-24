import { useEffect, useRef } from 'react'
import {
  DURACAO_DA_JORNADA,
  POSE_NO_LUGAR,
  dadoDaRodada,
  desenharFigura,
  desenharNeblina,
  poseDaJornada,
  poseNoRelogio,
  unirCaixas,
  type Caixa,
  type Pose,
  type Tela,
} from '../samuraiAnimado'

/** O samurai por cima do vídeo de fundo (ver samuraiAnimado.ts), num canvas do tamanho da tela. Segue o
 * relógio: a cada 5 minutos o dado decide se ele faz a jornada até a lua. `animar` falso (fundo pausado
 * em Configurações): congela onde está. `noLugar` ("reduzir movimento" no sistema): parado no lugar dele. */
export function SamuraiNoFundo({ animar, noLugar = false }: { animar: boolean; noLugar?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  // pausado: o momento (ms) em que parou — fica desenhado assim até voltar a animar
  const congelado = useRef<number | null>(null)
  // só pros testes (em desenvolvimento): uma jornada começada à força, ou um dado fixo
  const jornadaForcada = useRef<number | null>(null)
  const dadoForcado = useRef<number | null>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (animar) congelado.current = null
    else congelado.current ??= Date.now()
    let tela: Tela = { largura: 0, altura: 0, dpr: 1 }
    let suja: Caixa | null = null
    // a figura é esmaecida inteira de uma vez (senão pés, manto e capim escurecem onde se cruzam)
    let camada: HTMLCanvasElement | null = null
    let raf = 0

    const agora = () => (noLugar ? 0 : (congelado.current ?? Date.now()))

    function poseEm(ms: number): Pose {
      if (noLugar) return POSE_NO_LUGAR
      if (jornadaForcada.current !== null) {
        const s = (ms - jornadaForcada.current) / 1000
        if (s < DURACAO_DA_JORNADA) return poseDaJornada(s)
        jornadaForcada.current = null
      }
      return poseNoRelogio(ms, dadoForcado.current ?? undefined)
    }

    function medir() {
      if (!canvas) return
      // até 2x: a silhueta é lisa, mais que isso só pesa (celular 3x)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      tela = { largura: canvas.clientWidth, altura: canvas.clientHeight, dpr }
      canvas.width = Math.max(1, Math.round(tela.largura * dpr))
      canvas.height = Math.max(1, Math.round(tela.altura * dpr))
      suja = null // mudar o tamanho já limpa o canvas
    }

    function recortar(c: Caixa): Caixa | null {
      if (!canvas) return null
      const x = Math.max(0, Math.floor(c.x))
      const y = Math.max(0, Math.floor(c.y))
      const w = Math.min(canvas.width, Math.ceil(c.x + c.w)) - x
      const h = Math.min(canvas.height, Math.ceil(c.y + c.h)) - y
      return w > 0 && h > 0 ? { x, y, w, h } : null
    }

    function desenhar() {
      if (!canvas || !ctx) return
      const ms = agora()
      const t = ms / 1000
      const pose = poseEm(ms)
      if (suja) ctx.clearRect(suja.x, suja.y, suja.w, suja.h)
      let figura: Caixa | null = null
      if (pose.opacidade >= 0.999) {
        figura = desenharFigura(ctx, tela, t, pose)
      } else if (pose.opacidade > 0.001) {
        camada ??= document.createElement('canvas')
        if (camada.width !== canvas.width || camada.height !== canvas.height) {
          camada.width = canvas.width
          camada.height = canvas.height
        }
        const c2 = camada.getContext('2d')
        const area = c2 && desenharFigura(c2, tela, t, pose)
        const r = area && recortar(area)
        if (c2 && r) {
          ctx.save()
          ctx.globalAlpha = pose.opacidade
          ctx.drawImage(camada, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h)
          ctx.restore()
          c2.clearRect(r.x, r.y, r.w, r.h)
        }
        figura = area
      }
      const caixa = unirCaixas(figura, desenharNeblina(ctx, tela, pose))
      suja = caixa && recortar(caixa)
    }

    function quadro() {
      desenhar()
      raf = requestAnimationFrame(quadro)
    }

    medir()
    desenhar()
    const observador = new ResizeObserver(() => {
      medir()
      desenhar()
    })
    observador.observe(canvas)
    if (animar && !noLugar) raf = requestAnimationFrame(quadro)
    if (import.meta.env.DEV) {
      ;(window as unknown as { __samurai?: unknown }).__samurai = {
        /** O relógio que o samurai está seguindo (segundos; parado quando pausado). */
        agora: () => agora() / 1000,
        /** Começa a jornada à força, como se o dado tivesse mandado andar `segundos` atrás. */
        jornada: (segundos: number) => {
          jornadaForcada.current = agora() - segundos * 1000
          desenhar()
        },
        /** Fixa o dado de todas as rodadas (null: volta ao dado de verdade). */
        forcarDado: (dado: number | null) => {
          dadoForcado.current = dado
          jornadaForcada.current = null
          desenhar()
        },
        dado: dadoDaRodada,
        poseNoRelogio: (ms: number) => {
          const p = poseNoRelogio(ms)
          return { z: p.z, opacidade: p.opacidade }
        },
      }
    }
    return () => {
      cancelAnimationFrame(raf)
      observador.disconnect()
    }
  }, [animar, noLugar])

  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />
}
