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
const COR_PECA_PRETA = 0x2b2b2b
const COR_SELECIONADA = 0x2a9d5f
const COR_DESTINO = 0x2a78d6

function squareToPos(square: string): { x: number; z: number } {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1
  return { x: file - 3.5, z: 3.5 - rank }
}

function buildPieceMesh(tipo: string, cor: 'w' | 'b'): THREE.Group {
  const grupo = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({
    color: cor === 'w' ? COR_PECA_BRANCA : COR_PECA_PRETA,
    roughness: 0.45,
    metalness: 0.12,
  })

  function add(geo: THREE.BufferGeometry, y: number) {
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.y = y
    mesh.castShadow = true
    grupo.add(mesh)
    return mesh
  }

  switch (tipo) {
    case 'p':
      add(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 16), 0.11)
      add(new THREE.SphereGeometry(0.14, 16, 16), 0.3)
      break
    case 'r':
      add(new THREE.CylinderGeometry(0.22, 0.24, 0.5, 16), 0.25)
      add(new THREE.BoxGeometry(0.32, 0.12, 0.32), 0.56)
      break
    case 'n':
      add(new THREE.CylinderGeometry(0.2, 0.24, 0.35, 16), 0.175)
      {
        const cabeca = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.34), material)
        cabeca.position.set(0, 0.5, 0.04)
        cabeca.rotation.x = -0.3
        cabeca.castShadow = true
        grupo.add(cabeca)
      }
      break
    case 'b':
      add(new THREE.CylinderGeometry(0.2, 0.22, 0.4, 16), 0.2)
      add(new THREE.ConeGeometry(0.16, 0.35, 16), 0.58)
      add(new THREE.SphereGeometry(0.06, 12, 12), 0.8)
      break
    case 'q':
      add(new THREE.CylinderGeometry(0.24, 0.26, 0.5, 16), 0.25)
      add(new THREE.SphereGeometry(0.22, 16, 16), 0.58)
      add(new THREE.ConeGeometry(0.07, 0.16, 8), 0.85)
      break
    case 'k':
      add(new THREE.CylinderGeometry(0.24, 0.26, 0.55, 16), 0.275)
      add(new THREE.BoxGeometry(0.3, 0.3, 0.1), 0.65)
      {
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), material)
        crossV.position.y = 0.78
        crossV.castShadow = true
        grupo.add(crossV)
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), material)
        crossH.position.y = 0.78
        crossH.castShadow = true
        grupo.add(crossH)
      }
      break
  }

  return grupo
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

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf5f0e6)

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100)
    camera.position.set(0, 7.5, 6.5)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true
    controls.minDistance = 3.5
    controls.maxDistance = 14
    controls.maxPolarAngle = Math.PI / 2 - 0.05

    scene.add(new THREE.AmbientLight(0xffffff, 0.65))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85)
    dirLight.position.set(4, 10, 6)
    dirLight.castShadow = true
    scene.add(dirLight)

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.25, 8.6),
      new THREE.MeshStandardMaterial({ color: COR_BASE, roughness: 0.8 }),
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
        const mat = new THREE.MeshStandardMaterial({ color: clara ? COR_CASA_CLARA : COR_CASA_ESCURA })
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

    function sincronizarPecas() {
      descartarFilhos(piecesGroup)
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (!casa) continue
          const mesh = buildPieceMesh(casa.type, casa.color)
          const { x, z } = squareToPos(casa.square)
          mesh.position.set(x, 0.05, z)
          piecesGroup.add(mesh)
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

    function jogarLanceDaMaquina() {
      const chess = chessRef.current
      if (chess.isGameOver() || chess.turn() !== 'b') return
      vezDaMaquinaRef.current = true
      atualizarStatusTexto()
      window.setTimeout(() => {
        const lance = escolherJogadaDaMaquina(chess, livroRef.current)
        if (lance) chess.move(lance)
        vezDaMaquinaRef.current = false
        sincronizarPecas()
        limparDestaques()
        atualizarStatusTexto()
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
      chess.move({ from: origem, to: destino, promotion: 'q' })
      selecionadaRef.current = null
      destinosRef.current = []
      sincronizarPecas()
      limparDestaques()
      atualizarStatusTexto()
      if (!chess.isGameOver()) jogarLanceDaMaquina()
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
