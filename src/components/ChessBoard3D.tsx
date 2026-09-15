import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Chess, type Square } from 'chess.js'
import { Button } from './ui/Basics'
import { carregarLivroDeAberturas, type LivroDeAberturas } from '../chess/pgnBook'
import { escolherJogadaDaMaquina } from '../chess/engine'

const COR_CASA_CLARA = 0xe8d9b8
const COR_CASA_ESCURA = 0x8a5a3b
const COR_BASE = 0x4a3323
const COR_PECA_BRANCA = 0xf4f0e6
const COR_PECA_PRETA = 0x232323
const COR_SELECIONADA = 0x2a9d5f
const COR_DESTINO = 0x2a78d6

function squareToPos(square: string): { x: number; z: number } {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1
  return { x: file - 3.5, z: 3.5 - rank }
}

// ---------------------------------------------------------------------------
// Geometria das peças — montada uma única vez por tipo (não por peça) e
// reaproveitada pra sempre. Isso evita recriar ~30 buffers de geometria a
// cada lance, que é o que deixava o tabuleiro engasgado a cada movimento.
// ---------------------------------------------------------------------------
interface ParteGeom {
  geo: THREE.BufferGeometry
  x?: number
  y: number
  z?: number
  rotX?: number
}

const geometriasPorTipo = new Map<string, ParteGeom[]>()

function geometriasDoTipo(tipo: string): ParteGeom[] {
  const existente = geometriasPorTipo.get(tipo)
  if (existente) return existente

  let partes: ParteGeom[] = []
  switch (tipo) {
    case 'p':
      partes = [
        { geo: new THREE.CylinderGeometry(0.16, 0.2, 0.22, 24), y: 0.11 },
        { geo: new THREE.SphereGeometry(0.14, 24, 20), y: 0.3 },
      ]
      break
    case 'r':
      partes = [
        { geo: new THREE.CylinderGeometry(0.22, 0.24, 0.5, 24), y: 0.25 },
        { geo: new THREE.BoxGeometry(0.32, 0.12, 0.32), y: 0.56 },
      ]
      break
    case 'n':
      partes = [
        { geo: new THREE.CylinderGeometry(0.2, 0.24, 0.35, 24), y: 0.175 },
        { geo: new THREE.BoxGeometry(0.18, 0.3, 0.34), y: 0.5, z: 0.04, rotX: -0.3 },
      ]
      break
    case 'b':
      partes = [
        { geo: new THREE.CylinderGeometry(0.2, 0.22, 0.4, 24), y: 0.2 },
        { geo: new THREE.ConeGeometry(0.16, 0.35, 24), y: 0.58 },
        { geo: new THREE.SphereGeometry(0.06, 16, 16), y: 0.8 },
      ]
      break
    case 'q':
      partes = [
        { geo: new THREE.CylinderGeometry(0.24, 0.26, 0.5, 24), y: 0.25 },
        { geo: new THREE.SphereGeometry(0.22, 24, 20), y: 0.58 },
        { geo: new THREE.ConeGeometry(0.07, 0.16, 12), y: 0.85 },
      ]
      break
    case 'k':
      partes = [
        { geo: new THREE.CylinderGeometry(0.24, 0.26, 0.55, 24), y: 0.275 },
        { geo: new THREE.BoxGeometry(0.3, 0.3, 0.1), y: 0.65 },
        { geo: new THREE.BoxGeometry(0.06, 0.24, 0.06), y: 0.78 },
        { geo: new THREE.BoxGeometry(0.18, 0.06, 0.06), y: 0.78 },
      ]
      break
  }
  geometriasPorTipo.set(tipo, partes)
  return partes
}

const materialPorCor: Record<'w' | 'b', THREE.MeshStandardMaterial> = {
  w: new THREE.MeshStandardMaterial({ color: COR_PECA_BRANCA, roughness: 0.4, metalness: 0.12 }),
  b: new THREE.MeshStandardMaterial({ color: COR_PECA_PRETA, roughness: 0.4, metalness: 0.12 }),
}

function buildPieceMesh(tipo: string, cor: 'w' | 'b'): THREE.Group {
  const grupo = new THREE.Group()
  const material = materialPorCor[cor]
  for (const parte of geometriasDoTipo(tipo)) {
    const mesh = new THREE.Mesh(parte.geo, material)
    mesh.position.set(parte.x ?? 0, parte.y, parte.z ?? 0)
    if (parte.rotX) mesh.rotation.x = parte.rotX
    mesh.castShadow = true
    grupo.add(mesh)
  }
  return grupo
}

const LARGURA_FULL_HD = 1920
const ALTURA_FULL_HD = 1080

/** Calcula o pixel ratio necessário pra garantir que o canvas renderize em pelo menos Full HD (1920x1080), mesmo quando o card exibido na tela é menor — limitado a 3x pra não sobrecarregar a GPU em telas muito pequenas. */
function pixelRatioParaFullHD(larguraCss: number, alturaCss: number): number {
  const dpr = window.devicePixelRatio || 1
  const fatorParaFullHD = Math.max(LARGURA_FULL_HD / Math.max(larguraCss, 1), ALTURA_FULL_HD / Math.max(alturaCss, 1))
  return Math.min(Math.max(dpr, fatorParaFullHD), 3)
}

/** Anima suavemente a posição (x/z) de um objeto, com ease-out cúbico. */
function animarPosicao(
  mesh: THREE.Object3D,
  de: { x: number; z: number },
  para: { x: number; z: number },
  duracaoMs: number,
  aoTerminar: () => void,
) {
  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / duracaoMs)
    const suave = 1 - Math.pow(1 - t, 3)
    mesh.position.x = de.x + (para.x - de.x) * suave
    mesh.position.z = de.z + (para.z - de.z) * suave
    if (t < 1) requestAnimationFrame(passo)
    else aoTerminar()
  }
  requestAnimationFrame(passo)
}

export function ChessBoard3D() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chessRef = useRef(new Chess())
  const livroRef = useRef<LivroDeAberturas>(new Map())
  const acoesRef = useRef<{ novoJogo: () => void } | null>(null)

  const [statusTexto, setStatusTexto] = useState('Carregando o tabuleiro…')
  const [livroInfo, setLivroInfo] = useState<string | null>(null)

  useEffect(() => {
    carregarLivroDeAberturas().then((livro) => {
      livroRef.current = livro
      setLivroInfo(
        livro.size > 0
          ? `Usando ${livro.size} posições do arquivo de referência (public/chess/games.pgn) pras jogadas da máquina.`
          : 'Nenhum arquivo de referência encontrado ainda — a máquina está jogando só com busca própria. Coloque o PGN em public/chess/games.pgn.',
      )
    })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const selecionadaRef: { current: Square | null } = { current: null }
    const destinosRef: { current: Square[] } = { current: [] }
    const vezDaMaquinaRef: { current: boolean } = { current: false }
    const pieceMeshBySquare = new Map<string, THREE.Group>()

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf5f0e6)
    scene.fog = new THREE.Fog(0xf5f0e6, 11, 20)

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100)
    camera.position.set(0, 7.5, 6.5)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(pixelRatioParaFullHD(container.clientWidth, container.clientHeight))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 3.5
    controls.maxDistance = 14
    controls.maxPolarAngle = Math.PI / 2 - 0.05

    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x3a2a1a, 0.55))
    const dirLight = new THREE.DirectionalLight(0xfff3e0, 0.95)
    dirLight.position.set(4, 10, 6)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(2048, 2048)
    dirLight.shadow.camera.left = -6
    dirLight.shadow.camera.right = 6
    dirLight.shadow.camera.top = 6
    dirLight.shadow.camera.bottom = -6
    dirLight.shadow.bias = -0.0015
    scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.25)
    fillLight.position.set(-5, 6, -4)
    scene.add(fillLight)

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.25, 8.6),
      new THREE.MeshStandardMaterial({ color: COR_BASE, roughness: 0.75 }),
    )
    base.position.y = -0.22
    base.receiveShadow = true
    scene.add(base)

    const boardGroup = new THREE.Group()
    const squareMeshes: THREE.Mesh[] = []
    const squareGeo = new THREE.BoxGeometry(1, 0.1, 1)
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const square = `${String.fromCharCode(97 + f)}${r + 1}`
        const clara = (f + r) % 2 === 1
        const mat = new THREE.MeshStandardMaterial({
          color: clara ? COR_CASA_CLARA : COR_CASA_ESCURA,
          roughness: 0.7,
        })
        const mesh = new THREE.Mesh(squareGeo, mat)
        const { x, z } = squareToPos(square)
        mesh.position.set(x, -0.05, z)
        mesh.receiveShadow = true
        mesh.userData.square = square
        boardGroup.add(mesh)
        squareMeshes.push(mesh)
      }
    }
    scene.add(boardGroup)

    const piecesGroup = new THREE.Group()
    scene.add(piecesGroup)
    const highlightGroup = new THREE.Group()
    scene.add(highlightGroup)

    function descartarFilhos(grupo: THREE.Group) {
      for (const filho of grupo.children) {
        filho.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            for (const mat of mats) mat.dispose()
          }
        })
      }
      grupo.clear()
    }

    // as peças usam geometria/material compartilhados (cache por tipo/cor), então aqui só
    // desmonta o grupo — nunca chama dispose(), senão quebraria as peças que ainda usam o cache
    function sincronizarPecas() {
      piecesGroup.clear()
      pieceMeshBySquare.clear()
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (!casa) continue
          const mesh = buildPieceMesh(casa.type, casa.color)
          const { x, z } = squareToPos(casa.square)
          mesh.position.set(x, 0.05, z)
          piecesGroup.add(mesh)
          pieceMeshBySquare.set(casa.square, mesh)
        }
      }
    }

    function limparDestaques() {
      descartarFilhos(highlightGroup)
    }

    function destacarSelecao(square: Square, destinos: Square[]) {
      limparDestaques()
      const selMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.38, 32),
        new THREE.MeshBasicMaterial({ color: COR_SELECIONADA, side: THREE.DoubleSide }),
      )
      selMesh.rotation.x = -Math.PI / 2
      const posSel = squareToPos(square)
      selMesh.position.set(posSel.x, 0.02, posSel.z)
      highlightGroup.add(selMesh)

      const destGeo = new THREE.CircleGeometry(0.14, 24)
      const destMat = new THREE.MeshBasicMaterial({ color: COR_DESTINO })
      for (const dest of destinos) {
        const destMesh = new THREE.Mesh(destGeo, destMat)
        destMesh.rotation.x = -Math.PI / 2
        const pos = squareToPos(dest)
        destMesh.position.set(pos.x, 0.02, pos.z)
        highlightGroup.add(destMesh)
      }
    }

    function atualizarStatusTexto() {
      const chess = chessRef.current
      if (chess.isCheckmate()) {
        const vencedor = chess.turn() === 'w' ? 'A máquina (pretas)' : 'Você (brancas)'
        setStatusTexto(`Xeque-mate — ${vencedor} venceu!`)
      } else if (chess.isStalemate()) {
        setStatusTexto('Empate por afogamento.')
      } else if (chess.isDraw()) {
        setStatusTexto('Empate.')
      } else if (chess.turn() === 'b') {
        setStatusTexto(chess.isCheck() ? 'Xeque! A máquina está pensando…' : 'A máquina está pensando…')
      } else {
        setStatusTexto(chess.isCheck() ? 'Xeque! Sua vez (brancas).' : 'Sua vez — você joga com as brancas.')
      }
    }

    /**
     * Aplica um lance (SAN da máquina, ou {from,to} do clique do jogador) já animando a peça da
     * posição de origem até o destino, removendo na hora quem for capturado (inclusive en passant).
     * Peças de roque (a torre) e promoções só assumem a posição/forma final ao ressincronizar no
     * fim da animação — não são animadas separadamente.
     */
    function executarLanceComAnimacao(
      entrada: string | { from: Square; to: Square; promotion?: string },
      aoTerminar: () => void,
    ) {
      const chess = chessRef.current
      let origem: Square | undefined
      let destino: Square | undefined

      if (typeof entrada === 'string') {
        const candidato = chess.moves({ verbose: true }).find((m) => m.san === entrada)
        if (candidato) {
          origem = candidato.from as Square
          destino = candidato.to as Square
        }
      } else {
        origem = entrada.from
        destino = entrada.to
      }

      const meshMovendo = origem ? pieceMeshBySquare.get(origem) : undefined
      const meshCapturada = destino ? pieceMeshBySquare.get(destino) : undefined

      const resultado =
        typeof entrada === 'string' ? chess.move(entrada) : chess.move({ ...entrada, promotion: entrada.promotion ?? 'q' })
      if (!resultado) {
        aoTerminar()
        return
      }

      if (meshCapturada) {
        piecesGroup.remove(meshCapturada)
      } else if (resultado.isEnPassant() && origem && destino) {
        const casaCapturada = `${destino[0]}${origem[1]}` as Square
        const meshEnPassant = pieceMeshBySquare.get(casaCapturada)
        if (meshEnPassant) piecesGroup.remove(meshEnPassant)
      }

      if (meshMovendo && origem && destino) {
        const de = squareToPos(origem)
        const para = squareToPos(destino)
        animarPosicao(meshMovendo, de, para, 260, () => {
          sincronizarPecas()
          aoTerminar()
        })
      } else {
        sincronizarPecas()
        aoTerminar()
      }
    }

    function jogarLanceDaMaquina() {
      const chess = chessRef.current
      if (chess.isGameOver() || chess.turn() !== 'b') return
      vezDaMaquinaRef.current = true
      atualizarStatusTexto()
      window.setTimeout(() => {
        const lance = escolherJogadaDaMaquina(chess, livroRef.current)
        if (!lance) {
          vezDaMaquinaRef.current = false
          atualizarStatusTexto()
          return
        }
        executarLanceComAnimacao(lance, () => {
          vezDaMaquinaRef.current = false
          atualizarStatusTexto()
        })
      }, 450)
    }

    function tentarSelecionar(square: Square) {
      const chess = chessRef.current
      if (chess.turn() !== 'w' || vezDaMaquinaRef.current || chess.isGameOver()) return
      const peca = chess.get(square)
      if (!peca || peca.color !== 'w') {
        selecionadaRef.current = null
        limparDestaques()
        return
      }
      const jogadas = chess.moves({ square, verbose: true })
      const destinos = jogadas.map((j) => j.to as Square)
      selecionadaRef.current = square
      destinosRef.current = destinos
      destacarSelecao(square, destinos)
    }

    function tentarMover(destino: Square) {
      const chess = chessRef.current
      const origem = selecionadaRef.current
      if (!origem) return
      if (!destinosRef.current.includes(destino)) {
        selecionadaRef.current = null
        limparDestaques()
        tentarSelecionar(destino)
        return
      }
      selecionadaRef.current = null
      destinosRef.current = []
      limparDestaques()
      executarLanceComAnimacao({ from: origem, to: destino, promotion: 'q' }, () => {
        atualizarStatusTexto()
        if (!chess.isGameOver()) jogarLanceDaMaquina()
      })
    }

    function onClick(event: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(squareMeshes)
      if (hits.length === 0) return
      const square = hits[0].object.userData.square as Square
      if (selecionadaRef.current) {
        tentarMover(square)
      } else {
        tentarSelecionar(square)
      }
    }
    renderer.domElement.addEventListener('click', onClick)

    acoesRef.current = {
      novoJogo() {
        chessRef.current.reset()
        selecionadaRef.current = null
        destinosRef.current = []
        vezDaMaquinaRef.current = false
        sincronizarPecas()
        limparDestaques()
        atualizarStatusTexto()
      },
    }

    sincronizarPecas()
    atualizarStatusTexto()

    let frameId = 0
    function animate() {
      frameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    function onResize() {
      const el = containerRef.current
      if (!el) return
      camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1)
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(pixelRatioParaFullHD(el.clientWidth, el.clientHeight))
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('click', onClick)
      cancelAnimationFrame(frameId)
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-700">{statusTexto}</p>
        <Button variant="secondary" onClick={() => acoesRef.current?.novoJogo()}>
          Novo jogo
        </Button>
      </div>
      <div
        ref={containerRef}
        className="w-full aspect-[4/3] sm:aspect-video rounded-xl overflow-hidden border border-ink-100 touch-none"
      />
      <p className="text-xs text-ink-400">{livroInfo ?? 'Carregando arquivo de referência…'}</p>
    </div>
  )
}
