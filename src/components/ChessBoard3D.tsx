import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Chess, type Square } from 'chess.js'
import { Button } from './ui/Basics'
import { carregarLivroDeAberturas, type LivroDeAberturas } from '../chess/pgnBook'
import { escolherJogadaDaMaquina } from '../chess/engine'
import { listPartidasDoJogador, novaPartida, salvarPartida, type PartidaXadrez } from '../db/xadrezRepo'
import { registrarAprendizadoDaPartida, type ResultadoPartida as ResultadoPartidaXadrez } from '../db/xadrezAprendizadoRepo'

const COR_CASA_CLARA = 0xe8d9b8
const COR_CASA_ESCURA = 0x8a5a3b
const COR_BASE = 0x4a3323
const COR_SELECIONADA = 0x2a9d5f
const COR_DESTINO = 0x2a78d6

function squareToPos(square: string): { x: number; z: number } {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1
  return { x: file - 3.5, z: 3.5 - rank }
}

// mesma posição da câmera de baixo (ver camera.position.set, olhando pra origem) — replicada aqui
// só pra alimentar a compensação de perspectiva abaixo, sem dependência circular com o efeito que
// monta a cena
const CAMERA_Y = 9.5
const CAMERA_Z = 10
// altura do "centro visual" de uma peça acima do chão (a peça tem ~0,9 de altura, mas o volume
// visível se concentra um pouco acima da metade) — medido por diferença de pixels contra o
// tabuleiro vazio, não chutado
const ALTURA_VISUAL_PECA = 0.55

/**
 * Posição X/Z de uma peça na casa, com uma pequena correção de perspectiva no eixo X: a câmera vê o
 * tabuleiro de um ângulo e a peça tem altura, então toda peça alta (não só o peão — torre, cavalo,
 * o que for) parece "inclinada" pra fora do eixo central da câmera; quanto mais longe da coluna do
 * meio e mais perto da câmera, mais forte. A conta desloca a peça pra dentro, o suficiente pra que
 * o centro visual (ALTURA_VISUAL_PECA acima do chão) projete na mesma coluna da tela que o centro
 * da casa. Só o X muda — a profundidade (Z) fica exata, senão o pé da peça sairia da casa. Vale pra
 * câmera inicial; se o jogador girar o tabuleiro, o desvio volta a aparecer, só que pequeno.
 */
function squareToPosPeca(square: string): { x: number; z: number } {
  const { x, z } = squareToPos(square)
  const profundidadeCasa = CAMERA_Y * CAMERA_Y + CAMERA_Z * (CAMERA_Z - z)
  const fator = (CAMERA_Y * ALTURA_VISUAL_PECA) / profundidadeCasa
  return { x: x * (1 - fator), z }
}

// ---------------------------------------------------------------------------
// Visual estilo desenho animado (cel-shading): sombreamento em degraus via
// MeshToonMaterial + um "gradient map" de poucos tons, combinado com contorno
// preto nas peças (a técnica clássica do "casco invertido" — um clone da
// mesma peça, ligeiramente maior e renderizado só por dentro/atrás).
// ---------------------------------------------------------------------------
function criarGradienteToon(): THREE.DataTexture {
  const tons = new Uint8Array([70, 130, 190, 255])
  const textura = new THREE.DataTexture(tons, tons.length, 1, THREE.RedFormat)
  textura.needsUpdate = true
  textura.magFilter = THREE.NearestFilter
  textura.minFilter = THREE.NearestFilter
  return textura
}

const gradienteToon = criarGradienteToon()
const COR_CONTORNO = 0x1a1410
const materialContorno = new THREE.MeshBasicMaterial({ color: COR_CONTORNO, side: THREE.BackSide })

function criarContorno(geo: THREE.BufferGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, materialContorno)
  mesh.scale.setScalar(1.06)
  return mesh
}

/** Desenha um texto curto num canvas pra usar como textura — usado nas coordenadas (a-h, 1-8) ao redor do tabuleiro. */
function criarTexturaTexto(texto: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#3a2a1a'
  ctx.font = 'bold 42px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(texto, 32, 34)
  const textura = new THREE.CanvasTexture(canvas)
  textura.needsUpdate = true
  return textura
}

const LETRAS_COLUNAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

// ---------------------------------------------------------------------------
// Peças-personagem — dois exércitos com visual distinto (Reino, claro/azul, x
// Horda, escuro/vermelho), em vez das peças geométricas clássicas. Cada peça é
// montada com formas simples (corpo, cabeça, elmo/capuz, acessório) só que com
// um "papel" por parte (armadura / detalhe / coroa / brilho) que decide qual
// material usar — a geometria em si é montada uma única vez por tipo e
// reaproveitada pra sempre, então trocar de facção não recria nada.
// ---------------------------------------------------------------------------
type Papel = 'armadura' | 'detalhe' | 'coroa' | 'brilho'

interface ParteGeom {
  geo: THREE.BufferGeometry
  x?: number
  y: number
  z?: number
  rotX?: number
  rotY?: number
  rotZ?: number
  papel: Papel
}

const geometriasPorTipo = new Map<string, ParteGeom[]>()

function geometriasDoTipo(tipo: string): ParteGeom[] {
  const existente = geometriasPorTipo.get(tipo)
  if (existente) return existente

  // Corpos bem mais esguios que a geração anterior (que lembrava um robozinho robusto) — visual
  // de "boneco de madeira" articulado, tipo manequim de desenho: tronco/quadril bem mais finos e
  // membros finos (ver geoPerna/geoBraco), mas ainda montado só com primitivas geométricas simples
  // (caixa/cilindro/esfera/cone), não linhas literais — mantém o "formato geométrico" original só
  // que mais magro. As alturas (Y) ficam quase todas iguais às da versão anterior; só as larguras/
  // profundidades (X/Z) e os afastamentos do centro (onde fica ombro, cetro, cajado etc.) encolhem.
  let partes: ParteGeom[] = []
  switch (tipo) {
    // peão — soldado raso, elmo simples com ponta (tronco acima do quadril/pernas articulados)
    case 'p':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.08, 0.025, 0.08), y: 0.4, papel: 'detalhe' },
        { geo: new THREE.CylinderGeometry(0.055, 0.065, 0.2, 12), y: 0.48, papel: 'armadura' },
        // juntas esféricas nos ombros e quadris, bem mais largas que o membro fino que sai delas —
        // o visual de "boneco de brinquedo articulado" da foto de referência (bolinha grande na
        // dobradiça). Centralizadas exatamente no pivô do braço/perna (CONFIG_BRACO/PERNA_*), pra
        // o membro parecer emergir de dentro da esfera em vez de só encostar nela.
        { geo: new THREE.SphereGeometry(0.036, 12, 10), x: -0.085, y: 0.52, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.036, 12, 10), x: 0.085, y: 0.52, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.032, 12, 10), x: -0.04, y: 0.32, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.032, 12, 10), x: 0.04, y: 0.32, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.085, 16, 12), y: 0.68, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.048, 0.1, 12), y: 0.785, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.06, 0.018, 0.018), y: 0.685, z: 0.078, papel: 'brilho' },
      ]
      break
    // torre — guardião pesado, ombreiras largas e "ameia" no topo (lembrando torre) — continua a
    // mais robusta do grupo (guarda a mesma proporção relativa às outras), só que agora fina o
    // bastante pra também deixar ver um fiapo das pernas por baixo, como as demais peças
    case 'r':
      partes = [
        { geo: new THREE.BoxGeometry(0.13, 0.09, 0.09), y: 0.36, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.19, 0.22, 0.13), y: 0.5, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.195, 0.03, 0.135), y: 0.5, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.05, 0.13, 0.05), x: -0.11, y: 0.53, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.05, 0.13, 0.05), x: 0.11, y: 0.53, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.035, 0.035, 0.014), y: 0.56, z: 0.07, rotZ: Math.PI / 4, papel: 'brilho' },
        { geo: new THREE.SphereGeometry(0.075, 16, 12), y: 0.7, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.17, 0.07, 0.17), y: 0.8, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.05, 0.02, 0.02), y: 0.705, z: 0.058, papel: 'brilho' },
      ]
      break
    // cavalo — literalmente um peão montado em cima de um cavalo: corpo/pescoço/cabeça/orelhas/
    // crina/rabo do cavalo por baixo, e um cavaleiro pequeno (mesma cara do peão — corpo, cabeça,
    // capacete pontudo) sentado no lombo. O tronco do cavalo fica mais estreito que a distância das
    // "patas" (o mesmo par de pernas articuladas de toda peça), então elas ficam visíveis do lado
    // de fora do corpo em vez de escondidas por dentro. Corpo/pescoço/cabeça mais esguios que antes,
    // acompanhando o resto do time, mas o comprimento (focinho, rabo) fica como estava.
    case 'n':
      partes = [
        // corpo do cavalo
        { geo: new THREE.BoxGeometry(0.09, 0.12, 0.4), y: 0.42, papel: 'armadura' },
        // manta de sela, sob o cavaleiro
        { geo: new THREE.BoxGeometry(0.1, 0.03, 0.22), y: 0.505, z: 0.03, papel: 'detalhe' },
        // pescoço, inclinado pra frente e pra cima
        { geo: new THREE.BoxGeometry(0.065, 0.24, 0.08), y: 0.54, z: -0.2, rotX: -0.5, papel: 'armadura' },
        // cabeça — focinho alongado
        { geo: new THREE.BoxGeometry(0.06, 0.075, 0.2), y: 0.65, z: -0.35, rotX: -0.15, papel: 'armadura' },
        // orelhas
        { geo: new THREE.ConeGeometry(0.018, 0.06, 8), x: -0.018, y: 0.72, z: -0.27, papel: 'detalhe' },
        { geo: new THREE.ConeGeometry(0.018, 0.06, 8), x: 0.018, y: 0.72, z: -0.27, papel: 'detalhe' },
        // crina, ao longo do pescoço
        { geo: new THREE.BoxGeometry(0.02, 0.16, 0.12), y: 0.6, z: -0.13, rotX: -0.5, papel: 'detalhe' },
        // rabo
        { geo: new THREE.ConeGeometry(0.032, 0.22, 10), y: 0.42, z: 0.24, rotX: Math.PI * 0.55, papel: 'detalhe' },
        // cavaleiro — tronco pequeno sentado no lombo
        { geo: new THREE.CylinderGeometry(0.045, 0.052, 0.14, 10), y: 0.56, papel: 'armadura' },
        // capa curta do cavaleiro, esvoaçando pra trás
        { geo: new THREE.BoxGeometry(0.06, 0.16, 0.02), y: 0.58, z: 0.09, rotX: 0.25, papel: 'detalhe' },
        // cabeça do cavaleiro
        { geo: new THREE.SphereGeometry(0.055, 14, 10), y: 0.68, papel: 'armadura' },
        // capacete pontudo, igual ao do peão
        { geo: new THREE.ConeGeometry(0.032, 0.07, 12), y: 0.75, papel: 'detalhe' },
        // brilho dos olhos do cavaleiro
        { geo: new THREE.BoxGeometry(0.04, 0.013, 0.013), y: 0.685, z: 0.05, papel: 'brilho' },
      ]
      break
    // bispo — místico com chapéu pontudo e cajado
    case 'b':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.09, 0.26, 14), y: 0.5, papel: 'detalhe' },
        // faixa/cíngulo na cintura da batina
        { geo: new THREE.TorusGeometry(0.056, 0.01, 8, 20), y: 0.45, rotX: Math.PI / 2, papel: 'brilho' },
        { geo: new THREE.SphereGeometry(0.085, 16, 12), y: 0.7, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.06, 0.3, 14), y: 0.94, papel: 'detalhe' },
        // faixa diagonal no peito
        { geo: new THREE.BoxGeometry(0.02, 0.22, 0.014), x: 0.03, y: 0.68, z: 0.045, rotZ: 0.5, papel: 'detalhe' },
        { geo: new THREE.CylinderGeometry(0.013, 0.013, 0.46, 8), x: 0.1, y: 0.52, papel: 'armadura' },
        { geo: new THREE.SphereGeometry(0.04, 12, 12), x: 0.1, y: 0.77, papel: 'brilho' },
      ]
      break
    // dama — elegante, coroa dourada com joia
    case 'q':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.09, 0.28, 16), y: 0.5, papel: 'detalhe' },
        // capa — bem mais ampla, cobrindo quase toda a altura do corpo
        { geo: new THREE.BoxGeometry(0.16, 0.48, 0.03), y: 0.42, z: -0.08, rotX: 0.08, papel: 'detalhe' },
        // colar
        { geo: new THREE.TorusGeometry(0.05, 0.01, 8, 20), y: 0.63, rotX: Math.PI / 2, papel: 'coroa' },
        { geo: new THREE.SphereGeometry(0.085, 16, 12), y: 0.72, papel: 'armadura' },
        { geo: new THREE.TorusGeometry(0.06, 0.018, 10, 20), y: 0.85, rotX: Math.PI / 2, papel: 'coroa' },
        // pontas pequenas na coroa, além do topo com a joia
        { geo: new THREE.ConeGeometry(0.014, 0.045, 8), x: 0.045, y: 0.89, papel: 'coroa' },
        { geo: new THREE.ConeGeometry(0.014, 0.045, 8), x: -0.045, y: 0.89, papel: 'coroa' },
        { geo: new THREE.SphereGeometry(0.032, 12, 12), y: 0.915, papel: 'brilho' },
        // cetro — cabo com uma joia no topo, na mão
        { geo: new THREE.CylinderGeometry(0.011, 0.011, 0.36, 8), x: 0.1, y: 0.54, papel: 'armadura' },
        { geo: new THREE.SphereGeometry(0.032, 12, 12), x: 0.1, y: 0.735, papel: 'coroa' },
      ]
      break
    // rei — o mais alto, coroa + cruz, capa
    case 'k':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.095, 0.3, 16), y: 0.51, papel: 'detalhe' },
        // capa — bem mais ampla, cobrindo quase toda a altura do corpo
        { geo: new THREE.BoxGeometry(0.17, 0.52, 0.032), y: 0.42, z: -0.085, rotX: 0.1, papel: 'detalhe' },
        // emblema no peito
        { geo: new THREE.BoxGeometry(0.032, 0.032, 0.013), y: 0.58, z: 0.065, rotZ: Math.PI / 4, papel: 'brilho' },
        { geo: new THREE.SphereGeometry(0.088, 16, 12), y: 0.74, papel: 'armadura' },
        { geo: new THREE.TorusGeometry(0.065, 0.02, 10, 20), y: 0.88, rotX: Math.PI / 2, papel: 'coroa' },
        { geo: new THREE.BoxGeometry(0.025, 0.15, 0.025), y: 0.99, papel: 'coroa' },
        { geo: new THREE.BoxGeometry(0.075, 0.025, 0.025), y: 1.01, papel: 'coroa' },
        // cajado — cabo com uma cruz no topo, igual à da coroa, na mão
        { geo: new THREE.CylinderGeometry(0.014, 0.014, 0.48, 8), x: 0.1, y: 0.53, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.022, 0.09, 0.022), x: 0.1, y: 0.8, papel: 'coroa' },
        { geo: new THREE.BoxGeometry(0.055, 0.02, 0.02), x: 0.1, y: 0.815, papel: 'coroa' },
      ]
      break
  }
  geometriasPorTipo.set(tipo, partes)
  return partes
}

// ---------------------------------------------------------------------------
// Primeiro passo rumo ao visual "RPG": o peão pode vir de um modelo .glb externo (malha +
// esqueleto + animações, feito no Blender) em vez de só primitivas geométricas — carregado uma
// vez só, em segundo plano, e reaproveitado (clonado) pra cada peão no tabuleiro. Se o arquivo não
// existir ou falhar ao carregar, o peão cai de volta pro modelo geométrico de sempre — nunca quebra
// o tabuleiro por causa disso.
// ---------------------------------------------------------------------------
interface ModeloRPG {
  cena: THREE.Object3D
  clipes: THREE.AnimationClip[]
}
let modeloPeaoRPG: ModeloRPG | null | undefined // undefined = ainda não tentou, null = tentou e falhou
let carregamentoPeaoRPG: Promise<void> | null = null

/** Dispara (uma única vez) o carregamento do modelo RPG do peão; chama `aoResolver` quando
 * terminar (com sucesso ou falha) — usado pra re-sincronizar o tabuleiro e trocar os peões já
 * desenhados pelo modelo novo assim que ele chegar. */
function garantirModeloPeaoRPG(aoResolver: () => void) {
  if (modeloPeaoRPG !== undefined) {
    aoResolver()
    return
  }
  if (!carregamentoPeaoRPG) {
    const loader = new GLTFLoader()
    carregamentoPeaoRPG = new Promise<void>((resolve) => {
      loader.load(
        `${import.meta.env.BASE_URL}models/peao_rpg.glb`,
        (gltf) => {
          modeloPeaoRPG = { cena: gltf.scene, clipes: gltf.animations }
          resolve()
        },
        undefined,
        () => {
          // sem modelo ainda (ou falhou) — segue com o peão geométrico normal, sem quebrar nada
          modeloPeaoRPG = null
          resolve()
        },
      )
    })
  }
  carregamentoPeaoRPG.then(aoResolver)
}

/** Monta o grupo do peão a partir do modelo RPG carregado — mesmo "contrato" do peão geométrico
 * (posição/rotação/escala aplicadas por fora, em buildPieceMesh), mas com esqueleto de verdade em
 * vez de pivôs manuais: guarda o AnimationMixer em userData pro laço de render atualizar, e as
 * ações (clipes) nomeadas em userData.acoesRPG pra outras funções (ataque, etc.) poderem tocar.
 */
function buildPeaoRPG(modelo: ModeloRPG, cor: 'w' | 'b'): THREE.Group {
  const grupo = new THREE.Group()
  const clone = clonarComEsqueleto(modelo.cena) as THREE.Object3D

  // mesmo material toon (com o gradiente em degraus) das peças geométricas — reaproveitado, não
  // clonado, igual ao resto do tabuleiro — pra esse peão não destoar visualmente dos outros. Duas
  // cores, igual ao peão geométrico (corpo numa cor, capacete/ombreiras na cor de destaque): o
  // Blender exporta o chapéu/ombreiras num material "Detalhe" separado do resto ("Corpo") — o
  // glTF divide a malha em uma primitiva por material, então cada uma vira um SkinnedMesh próprio
  // aqui, e o nome do material original (antes de trocar) diz qual cor de destaque usar.
  const materialArmadura = materiaisPorFaccao[cor].armadura
  const materialDetalhe = materiaisPorFaccao[cor].detalhe
  clone.traverse((filho) => {
    if (filho instanceof THREE.SkinnedMesh) {
      const ehDetalhe = !Array.isArray(filho.material) && filho.material?.name === 'Detalhe'
      filho.material = ehDetalhe ? materialDetalhe : materialArmadura
      filho.castShadow = true
      filho.receiveShadow = true

      // contorno tipo desenho, igual ao resto das peças (casco invertido, maior, visto só por
      // dentro/atrás) — preso no MESMO esqueleto da malha visível (mesmo bind), então acompanha a
      // animação sozinho, sem precisar de outro mixer nem duplicar o cálculo de pose
      const contorno = new THREE.SkinnedMesh(filho.geometry, materialContorno)
      contorno.bind(filho.skeleton, filho.bindMatrix)
      contorno.scale.setScalar(1.06)
      contorno.castShadow = false
      clone.add(contorno)
    }
  })
  grupo.add(clone)

  const mixer = new THREE.AnimationMixer(clone)
  const acoes: Record<string, THREE.AnimationAction> = {}
  for (const clipe of modelo.clipes) {
    acoes[clipe.name] = mixer.clipAction(clipe)
  }
  acoes.Idle?.play()
  grupo.userData.mixer = mixer
  grupo.userData.acoesRPG = acoes
  // ponto de fixação da espada durante o golpe (ver animarAtaqueEspada) — osso sem malha própria,
  // só existe pra pendurar algo na mão direita
  grupo.userData.maoDireitaRPG = clone.getObjectByName('Hand_R')

  return grupo
}

/** Toca um clipe nomeado (ex.: "Attack") uma vez só e volta pro "Idle" em seguida — silencioso se
 * a peça não tiver esse clipe (peça geométrica, ou modelo sem essa animação). */
function tocarClipeRPGUmaVez(mesh: THREE.Object3D, nomeClipe: string) {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  const acao = acoes?.[nomeClipe]
  if (!acao) return
  const idle = acoes?.Idle
  acao.reset()
  acao.setLoop(THREE.LoopOnce, 1)
  acao.clampWhenFinished = true
  idle?.crossFadeTo(acao, 0.1, false)
  acao.play()
  const mixer = mesh.userData.mixer as THREE.AnimationMixer
  const aoTerminar = (evento: { action: THREE.AnimationAction }) => {
    if (evento.action !== acao) return
    mixer.removeEventListener('finished', aoTerminar)
    if (idle) acao.crossFadeTo(idle, 0.2, false)
  }
  mixer.addEventListener('finished', aoTerminar)
}

// ---------------------------------------------------------------------------
// Braços e pernas — mesma geometria pra todas as peças, com o pivô na
// articulação (quadril/ombro) em vez do centro da peça, pra poder balançar
// como uma caminhada de verdade durante a animação do lance. Bem mais finos que antes — é a peça
// central do visual "boneco de madeira": membros claramente mais estreitos que antes, ainda
// cilíndricos (não viram linha), pendurados de um corpo igualmente mais fino (ver geometriasDoTipo).
// ---------------------------------------------------------------------------
const geoPerna = new THREE.CylinderGeometry(0.024, 0.03, 0.32, 10)
const geoBraco = new THREE.CylinderGeometry(0.019, 0.024, 0.26, 10)

interface ConfigMembro {
  geo: THREE.BufferGeometry
  comprimento: number
  pivotX: number
  pivotY: number
  papel: Papel
}

const CONFIG_PERNA_ESQ: ConfigMembro = { geo: geoPerna, comprimento: 0.32, pivotX: -0.04, pivotY: 0.32, papel: 'armadura' }
const CONFIG_PERNA_DIR: ConfigMembro = { geo: geoPerna, comprimento: 0.32, pivotX: 0.04, pivotY: 0.32, papel: 'armadura' }
const CONFIG_BRACO_ESQ: ConfigMembro = { geo: geoBraco, comprimento: 0.26, pivotX: -0.085, pivotY: 0.52, papel: 'armadura' }
const CONFIG_BRACO_DIR: ConfigMembro = { geo: geoBraco, comprimento: 0.26, pivotX: 0.085, pivotY: 0.52, papel: 'armadura' }

/** Escala geral por tipo — só pra dar hierarquia de tamanho (rei/dama maiores, torre mais robusta). */
const ESCALA_POR_TIPO: Record<string, number> = { p: 1, n: 1, b: 1.05, r: 1.1, q: 1.08, k: 1.15 }

interface MembrosPersonagem {
  pernaEsq: THREE.Group
  pernaDir: THREE.Group
  bracoEsq: THREE.Group
  bracoDir: THREE.Group
}

/** Pose de descanso de cada membro (rotation.x) — todas as peças ficam com os braços caídos por
 * padrão (o peão só empunha a espada durante o ataque, ver animarAtaqueEspada). A caminhada soma o
 * balanço em cima dessa base, em vez de partir sempre de zero. */
interface PoseBaseMembros {
  pernaEsq: number
  pernaDir: number
  bracoEsq: number
  bracoDir: number
}
const POSE_BASE_NEUTRA: PoseBaseMembros = { pernaEsq: 0, pernaDir: 0, bracoEsq: 0, bracoDir: 0 }

interface MateriaisFaccao {
  armadura: THREE.MeshToonMaterial
  detalhe: THREE.MeshToonMaterial
  brilho: THREE.MeshBasicMaterial
}

// Reino (brancas) — armadura clara, detalhes em azul-real, olhos ciano
// Horda (pretas) — armadura escura, detalhes em vermelho-sangue, olhos vermelhos
const materiaisPorFaccao: Record<'w' | 'b', MateriaisFaccao> = {
  w: {
    armadura: new THREE.MeshToonMaterial({ color: 0xe6e6ea, gradientMap: gradienteToon }),
    detalhe: new THREE.MeshToonMaterial({ color: 0x2a4d8f, gradientMap: gradienteToon }),
    brilho: new THREE.MeshBasicMaterial({ color: 0x8fe3ff }),
  },
  b: {
    armadura: new THREE.MeshToonMaterial({ color: 0x3a3a42, gradientMap: gradienteToon }),
    detalhe: new THREE.MeshToonMaterial({ color: 0x8a2222, gradientMap: gradienteToon }),
    brilho: new THREE.MeshBasicMaterial({ color: 0xff7a5c }),
  },
}

const materialCoroa = new THREE.MeshToonMaterial({ color: 0xe0b93d, gradientMap: gradienteToon })

function materialDaParte(papel: Papel, cor: 'w' | 'b'): THREE.Material {
  return papel === 'coroa' ? materialCoroa : materiaisPorFaccao[cor][papel]
}

// ---------------------------------------------------------------------------
// Espada do peão — mesmo aço/cabo pras duas facções (não segue o material por
// papel/cor), parentada no pivô da mão direita, pra balançar junto do braço
// tanto na caminhada durante o lance quanto na pose parada.
// ---------------------------------------------------------------------------
const geoLaminaEspada = new THREE.BoxGeometry(0.032, 0.26, 0.065)
const geoGuardaEspada = new THREE.BoxGeometry(0.1, 0.022, 0.022)
const geoCaboEspada = new THREE.CylinderGeometry(0.014, 0.014, 0.075, 8)
const materialLaminaEspada = new THREE.MeshToonMaterial({ color: 0x8a94a3, gradientMap: gradienteToon })
// marrom-couro claro (não escuro) de propósito — precisa contrastar tanto com a armadura clara
// das brancas quanto com a armadura escura das pretas, senão some contra uma das duas facções
const materialCaboEspada = new THREE.MeshToonMaterial({ color: 0x8b5a2b, gradientMap: gradienteToon })

function criarEspadaDoPeao(): THREE.Group {
  const espada = new THREE.Group()
  const partes: { geo: THREE.BufferGeometry; y: number; material: THREE.Material }[] = [
    { geo: geoCaboEspada, y: -0.035, material: materialCaboEspada },
    { geo: geoGuardaEspada, y: -0.07, material: materialCaboEspada },
    { geo: geoLaminaEspada, y: -0.2, material: materialLaminaEspada },
  ]
  for (const parte of partes) {
    const mesh = new THREE.Mesh(parte.geo, parte.material)
    mesh.position.y = parte.y
    mesh.castShadow = true
    espada.add(mesh)

    const contorno = criarContorno(parte.geo)
    contorno.position.y = parte.y
    espada.add(contorno)
  }
  return espada
}

/** Monta um braço ou perna: um grupo-pivô na articulação, com o membro pendurado abaixo dele — girar o pivô move o membro inteiro, como uma dobradiça. */
function criarMembro(cfg: ConfigMembro, cor: 'w' | 'b'): THREE.Group {
  const pivot = new THREE.Group()
  pivot.position.set(cfg.pivotX, cfg.pivotY, 0)

  const mesh = new THREE.Mesh(cfg.geo, materialDaParte(cfg.papel, cor))
  mesh.position.y = -cfg.comprimento / 2
  mesh.castShadow = true
  pivot.add(mesh)

  const contorno = criarContorno(cfg.geo)
  contorno.position.y = -cfg.comprimento / 2
  pivot.add(contorno)

  return pivot
}

function buildPieceMesh(tipo: string, cor: 'w' | 'b'): THREE.Group {
  // peão com o modelo RPG carregado (malha + esqueleto + animações do Blender) em vez do
  // geométrico de sempre — mesmo "contrato" externo (userData.tipo/cor, rotação por cor, escala),
  // só a montagem interna que muda. Sem sheath/espada procedural aqui: esse modelo é autocontido.
  if (tipo === 'p' && modeloPeaoRPG) {
    const grupo = buildPeaoRPG(modeloPeaoRPG, cor)
    grupo.userData.tipo = tipo
    grupo.userData.cor = cor
    grupo.rotation.y = cor === 'w' ? Math.PI : 0
    grupo.scale.setScalar(ESCALA_POR_TIPO[tipo] ?? 1)
    return grupo
  }

  const grupo = new THREE.Group()
  grupo.userData.tipo = tipo
  grupo.userData.cor = cor
  for (const parte of geometriasDoTipo(tipo)) {
    const mesh = new THREE.Mesh(parte.geo, materialDaParte(parte.papel, cor))
    mesh.position.set(parte.x ?? 0, parte.y, parte.z ?? 0)
    if (parte.rotX) mesh.rotation.x = parte.rotX
    if (parte.rotY) mesh.rotation.y = parte.rotY
    if (parte.rotZ) mesh.rotation.z = parte.rotZ
    mesh.castShadow = true
    grupo.add(mesh)

    if (parte.papel !== 'brilho') {
      const contorno = criarContorno(parte.geo)
      contorno.position.copy(mesh.position)
      contorno.rotation.copy(mesh.rotation)
      grupo.add(contorno)
    }
  }

  const membros: MembrosPersonagem = {
    pernaEsq: criarMembro(CONFIG_PERNA_ESQ, cor),
    pernaDir: criarMembro(CONFIG_PERNA_DIR, cor),
    bracoEsq: criarMembro(CONFIG_BRACO_ESQ, cor),
    bracoDir: criarMembro(CONFIG_BRACO_DIR, cor),
  }
  grupo.add(membros.pernaEsq, membros.pernaDir, membros.bracoEsq, membros.bracoDir)
  grupo.userData.membros = membros

  const poseBase: PoseBaseMembros = { ...POSE_BASE_NEUTRA }
  if (tipo === 'p') {
    // bainha na cintura, do lado direito, em couro/madeira (cor fixa, não segue a facção —
    // por isso não usa 'detalhe' como o resto da armadura, senão ela sumiria misturada nos
    // outros acessórios azuis/vermelhos). Dois problemas descartaram as duas primeiras
    // tentativas: (1) o braço direito pendurado (CONFIG_BRACO_DIR) cobre boa parte da cintura em
    // x, então em z~0 a bainha ficava atrás/colada nele, invisível; (2) deslocar em Z (pra
    // frente do corpo) resolvia pro preto mas escondia nas brancas — as brancas giram 180°
    // (rotation.y = PI mais abaixo) então o mesmo +Z que fica de frente pra câmera no preto vira
    // de costas (escondido atrás do próprio corpo) no branco. A solução é ficar em z≈0
    // (puramente na lateral, sem comprometer frente/costas) e escapar do braço só em X, puxada
    // pra fora do quadril — os números aqui acompanham o braço bem mais fino do visual atual
    // (ver geoBraco/CONFIG_BRACO_DIR). A espada em si só existe presa na mão durante o ataque,
    // criada e destruída ali (ver animarAtaqueEspada) — o peão não anda por aí com ela
    // desembainhada, só o cabo espia pra fora da boca da bainha.
    const ANGULO_BAINHA = 0.174
    const geoBainha = new THREE.BoxGeometry(0.032, 0.2, 0.038)
    const bainha = new THREE.Mesh(geoBainha, materialCaboEspada)
    bainha.position.set(0.143, 0.34, 0)
    bainha.rotation.z = ANGULO_BAINHA
    bainha.castShadow = true
    grupo.add(bainha)

    const contornoBainha = criarContorno(geoBainha)
    contornoBainha.position.copy(bainha.position)
    contornoBainha.rotation.copy(bainha.rotation)
    grupo.add(contornoBainha)

    const caboNaBainha = new THREE.Mesh(geoCaboEspada, materialCaboEspada)
    caboNaBainha.position.set(0.125, 0.44, 0)
    caboNaBainha.rotation.z = ANGULO_BAINHA
    caboNaBainha.castShadow = true
    grupo.add(caboNaBainha)
  }
  grupo.userData.poseBase = poseBase

  // todo detalhe assimétrico (olhos, espada em guarda) foi desenhado virado pra +Z, que é "pra
  // frente" pras pretas (avançam de z negativo pra positivo) — as brancas avançam ao contrário
  // (de z positivo pra negativo), então giram 180° aqui pra também ficarem de frente pro
  // adversário em vez de de costas
  let rotacaoY = cor === 'w' ? Math.PI : 0
  // o cavalo é a exceção: foi desenhado com o pescoço/cabeça do cavalo virados pra -Z (o
  // contrário de toda outra peça), então precisa de mais 180° em cima da correção por cor —
  // pras pretas isso sozinho já vira a cabeça pra frente, e pras brancas os dois 180° se cancelam
  if (tipo === 'n') rotacaoY += Math.PI
  grupo.rotation.y = rotacaoY

  grupo.scale.setScalar(ESCALA_POR_TIPO[tipo] ?? 1)

  return grupo
}

const LARGURA_FULL_HD = 1920
const ALTURA_FULL_HD = 1080

// Velocidade de caminhada das peças: a duração do deslocamento e o número de passadas escalam
// com a distância percorrida (em casas do tabuleiro), então uma peça anda no mesmo ritmo humano
// constante tanto num lance curto quanto num lance longo — em vez de todo lance levar o mesmo
// tempo fixo, com as pernas balançando fixo desincronizadas da distância real percorrida.
const VELOCIDADE_CASAS_POR_SEGUNDO = 2.6
const DURACAO_LANCE_MIN_MS = 650
const DURACAO_LANCE_MAX_MS = 2400
const PASSADAS_POR_CASA = 1.6
/** Pausa "pensando" da máquina antes de mover, pro ritmo geral ficar mais compassado. */
const PAUSA_MAQUINA_MS = 700
/** Intervalo entre lances no modo demonstração (máquina x máquina) — de 10 a 15s por lance com o tabuleiro cheio. */
const DEMO_INTERVALO_MIN_MS = 10000
const DEMO_INTERVALO_MAX_MS = 15000
/** Nunca fica mais rápido que isso, nem com tabuleiro bem esvaziado e em xeque. */
const DEMO_INTERVALO_PISO_MS = 3000
/** Total de peças no início de uma partida — usado como referência pra "quão cheio" o tabuleiro está. */
const TOTAL_PECAS_INICIAL = 32

/** Acelera o ritmo conforme sobram menos peças (finais tendem a ser mais diretos) e ainda mais quando há um lance de xeque em andamento (padrão de ataque/mate). */
function atrasoDemoAleatorio(chess: Chess): number {
  const totalPecas = chess.board().flat().filter(Boolean).length
  const fatorPecas = Math.max(0.3, totalPecas / TOTAL_PECAS_INICIAL)
  const fatorCheque = chess.isCheck() ? 0.6 : 1
  const min = Math.max(DEMO_INTERVALO_PISO_MS, DEMO_INTERVALO_MIN_MS * fatorPecas * fatorCheque)
  const max = Math.max(min + 500, DEMO_INTERVALO_MAX_MS * fatorPecas * fatorCheque)
  return min + Math.random() * (max - min)
}

/** Calcula o pixel ratio necessário pra garantir que o canvas renderize em pelo menos Full HD (1920x1080), mesmo quando o card exibido na tela é menor — limitado a 3x pra não sobrecarregar a GPU em telas muito pequenas. */
function pixelRatioParaFullHD(larguraCss: number, alturaCss: number): number {
  const dpr = window.devicePixelRatio || 1
  const fatorParaFullHD = Math.max(LARGURA_FULL_HD / Math.max(larguraCss, 1), ALTURA_FULL_HD / Math.max(alturaCss, 1))
  return Math.min(Math.max(dpr, fatorParaFullHD), 3)
}

/**
 * Anima a posição x/z (ease-in-out) e, se a peça tiver braços/pernas, balança os membros como uma
 * caminhada durante o trajeto — voltando à pose de descanso da peça (guarda, no caso do peão) ao
 * terminar. Duração e número de passadas escalam com a distância percorrida, então o ritmo do
 * "passo" fica igual não importa se a peça andou uma casa ou atravessou o tabuleiro inteiro.
 */
function animarPosicao(
  mesh: THREE.Object3D,
  de: { x: number; z: number },
  para: { x: number; z: number },
  aoTerminar: () => void,
) {
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA

  // peão RPG: em vez de balançar membros manualmente (isso é só pras peças geométricas, que não
  // têm esqueleto de verdade), troca pro clipe "Walk" do próprio modelo enquanto desliza — e volta
  // pro "Idle" ao chegar. Sem crossFadeTo aqui de propósito (não assume qual ação está tocando no
  // momento — numa captura o peão pode chegar direto de "Attack" — fadeIn/fadeOut mistura o peso a
  // partir do que já estiver rodando, sem precisar saber a origem).
  const acoesRPG = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  const caminhada = acoesRPG?.Walk
  const paradaRPG = acoesRPG?.Idle
  if (caminhada && paradaRPG) {
    caminhada.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.15).play()
    paradaRPG.fadeOut(0.15)
  }

  const distancia = Math.hypot(para.x - de.x, para.z - de.z)
  const duracaoMs = Math.min(
    DURACAO_LANCE_MAX_MS,
    Math.max(DURACAO_LANCE_MIN_MS, (distancia / VELOCIDADE_CASAS_POR_SEGUNDO) * 1000),
  )
  const passadas = Math.max(1, Math.round(distancia * PASSADAS_POR_CASA))
  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / duracaoMs)
    const suave = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    mesh.position.x = de.x + (para.x - de.x) * suave
    mesh.position.z = de.z + (para.z - de.z) * suave

    if (membros) {
      const envelope = Math.sin(t * Math.PI) // 0 no início/fim do trajeto, evita um "chute" seco na primeira/última passada
      const balanco = Math.sin(t * Math.PI * passadas) * 0.55 * envelope
      membros.pernaEsq.rotation.x = base.pernaEsq + balanco
      membros.pernaDir.rotation.x = base.pernaDir - balanco
      membros.bracoEsq.rotation.x = base.bracoEsq - balanco
      membros.bracoDir.rotation.x = base.bracoDir + balanco
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      if (membros) {
        membros.pernaEsq.rotation.x = base.pernaEsq
        membros.pernaDir.rotation.x = base.pernaDir
        membros.bracoEsq.rotation.x = base.bracoEsq
        membros.bracoDir.rotation.x = base.bracoDir
      }
      if (caminhada && paradaRPG) {
        paradaRPG.reset().fadeIn(0.15).play()
        caminhada.fadeOut(0.15)
      }
      aoTerminar()
    }
  }
  requestAnimationFrame(passo)
}

/** Duração da comemoração de xeque-mate — pulos com os braços levantados, cada peça começando num instante levemente diferente pra não ficarem todas sincronizadas feito robôs. */
const DURACAO_COMEMORACAO_MS = 2400

/**
 * Faz a peça pular com os braços erguidos, comemorando — usado tanto na comemoração grande de
 * xeque-mate quanto (com uma duração bem mais curta) quando peças aliadas próximas reagem a uma
 * captura de um companheiro de time.
 */
function animarComemoracao(mesh: THREE.Object3D, atraso: number, duracaoMs: number = DURACAO_COMEMORACAO_MS) {
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const yBase = mesh.position.y
  const rotYBase = mesh.rotation.y // brancas ficam viradas 180° (Math.PI) — não pode resetar pra 0
  const inicio = performance.now() + atraso
  function passo(agora: number) {
    if (agora < inicio) {
      requestAnimationFrame(passo)
      return
    }
    const t = Math.min(1, (agora - inicio) / duracaoMs)
    const amortecido = 1 - t // os pulos vão ficando mais baixos até parar
    const pulo = Math.abs(Math.sin(t * Math.PI * 7)) * 0.22 * amortecido
    mesh.position.y = yBase + pulo
    mesh.rotation.y = rotYBase + Math.sin(t * Math.PI * 3) * 0.5 * amortecido

    if (membros) {
      const braceje = Math.sin(t * Math.PI * 9) * 0.25
      membros.bracoEsq.rotation.z = (Math.PI * 0.65 + braceje) * amortecido
      membros.bracoDir.rotation.z = -(Math.PI * 0.65 - braceje) * amortecido
      membros.pernaEsq.rotation.x = pulo * 1.5
      membros.pernaDir.rotation.x = -pulo * 1.5
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      mesh.position.y = yBase
      mesh.rotation.y = rotYBase
      if (membros) {
        membros.bracoEsq.rotation.z = 0
        membros.bracoDir.rotation.z = 0
        membros.pernaEsq.rotation.x = 0
        membros.pernaDir.rotation.x = 0
      }
    }
  }
  requestAnimationFrame(passo)
}

/** Duração do gesto amigável entre peças aliadas — bem mais longa e cadenciada, pra ficar mais
 * natural (dá tempo de perceber o movimento) em vez de um giro-e-volta rápido demais. O mortal é
 * um pouco mais curto (senão fica devagar demais pra dar uma volta inteira). */
const DURACAO_GESTO_MS = 2800
const DURACAO_MORTAL_MS = 1800

/** Meshes com um gesto amigável em andamento agora — sincronizarPecas() confere esse conjunto
 * antes de recriar uma peça do zero, pra não cortar/acelerar a interação no meio caso um lance
 * (do jogador ou da máquina) aconteça enquanto ela ainda está rolando. */
const meshesEmGesto = new Set<THREE.Object3D>()

/** Pool de gestos possíveis nas interações entre peças aliadas — sorteado a cada interação, pra
 * não ser sempre o mesmo movimento. Mesmo sendo peças de formas geométricas simples, os gestos
 * imitam movimentos humanos de verdade. */
type TipoGesto = 'aceno' | 'braco_erguido' | 'inclinacao' | 'agachamento' | 'mortal'
const POOL_GESTOS: TipoGesto[] = ['aceno', 'braco_erguido', 'inclinacao', 'agachamento', 'mortal']

/**
 * Gesto amigável entre peças aliadas — vira na direção da outra (exceto no mortal, que já gira
 * sozinho) e faz um movimento de corpo inteiro: acenar, erguer o braço, se inclinar numa
 * reverência, se agachar, ou dar um mortal pra trás. Usado quando uma peça aliada é selecionada e
 * nas interações aleatórias entre peças do mesmo time que ficam paradas esperando a vez.
 */
function animarGestoAmigavel(
  mesh: THREE.Object3D,
  direcao: { x: number; z: number },
  tipo: TipoGesto = POOL_GESTOS[Math.floor(Math.random() * POOL_GESTOS.length)],
  atraso = 0,
) {
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA
  const rotYOriginal = mesh.rotation.y
  const rotXOriginal = mesh.rotation.x
  const yOriginal = mesh.position.y
  const anguloAlvo = Math.atan2(direcao.x, direcao.z)
  const duracao = tipo === 'mortal' ? DURACAO_MORTAL_MS : DURACAO_GESTO_MS
  const inicio = performance.now() + atraso

  function passo(agora: number) {
    if (agora < inicio) {
      requestAnimationFrame(passo)
      return
    }
    const t = Math.min(1, (agora - inicio) / duracao)
    const giro = t < 0.25 ? t / 0.25 : t > 0.8 ? (1 - t) / 0.2 : 1
    if (tipo !== 'mortal') {
      mesh.rotation.y = rotYOriginal + (anguloAlvo - rotYOriginal) * giro
    }

    switch (tipo) {
      case 'aceno': {
        if (membros) membros.bracoEsq.rotation.z = Math.sin(Math.min(1, t / 0.8) * Math.PI * 3) * 0.45 * giro
        break
      }
      case 'braco_erguido': {
        if (membros) {
          const envelope = t < 0.4 ? Math.min(1, t / 0.3) : Math.max(0, (1 - t) / 0.4)
          membros.bracoEsq.rotation.x = base.bracoEsq - Math.PI * 0.75 * envelope
        }
        break
      }
      case 'inclinacao': {
        // uma reverência — o corpo inteiro curva pra frente e volta
        mesh.rotation.x = rotXOriginal + Math.sin(t * Math.PI) * 0.5
        break
      }
      case 'agachamento': {
        const envelope = Math.sin(t * Math.PI)
        mesh.position.y = yOriginal - envelope * 0.14
        if (membros) {
          membros.pernaEsq.rotation.x = base.pernaEsq + envelope * 0.6
          membros.pernaDir.rotation.x = base.pernaDir - envelope * 0.6
        }
        break
      }
      case 'mortal': {
        // gira o corpo inteiro pra trás em torno do eixo X, com um salto em arco
        mesh.rotation.x = rotXOriginal - t * Math.PI * 2
        mesh.position.y = yOriginal + Math.sin(t * Math.PI) * 0.45
        break
      }
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      mesh.rotation.y = rotYOriginal
      mesh.rotation.x = rotXOriginal
      mesh.position.y = yOriginal
      if (membros) {
        membros.bracoEsq.rotation.z = 0
        membros.bracoEsq.rotation.x = base.bracoEsq
        membros.pernaEsq.rotation.x = base.pernaEsq
        membros.pernaDir.rotation.x = base.pernaDir
      }
      meshesEmGesto.delete(mesh)
    }
  }
  meshesEmGesto.add(mesh)
  requestAnimationFrame(passo)
}

/** Duração da recusa — rápida e seca (bem mais curta que o gesto amigável), pra ler como um "não,
 * não é sua vez" imediato e não deixar o tabuleiro travado esperando por ela. */
const DURACAO_RECUSA_MS = 900
/** Quanto a peça avança na direção da câmera durante a recusa, antes de voltar. */
const DISTANCIA_RECUSA = 0.16

/**
 * Reação de recusa: dispara quando o jogador clica numa peça do próprio time fora da sua vez (ou
 * com a máquina jogando). A peça vira de frente pra câmera — o "para quem está olhando" que o
 * jogador realmente vê, não uma direção fixa do tabuleiro —, dá um passo nessa direção, balança o
 * corpo de um lado pro outro como um "não" físico com os dois braços erguidos num gesto de "pera,
 * calma", e volta exatamente pra posição, rotação e pose que tinha antes.
 */
function animarRecusa(mesh: THREE.Object3D, direcaoCamera: { x: number; z: number }) {
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA
  const rotYOriginal = mesh.rotation.y
  const posOriginal = { x: mesh.position.x, z: mesh.position.z }
  const anguloAlvo = Math.atan2(direcaoCamera.x, direcaoCamera.z)
  const inicio = performance.now()

  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / DURACAO_RECUSA_MS)
    const giro = t < 0.18 ? t / 0.18 : t > 0.85 ? (1 - t) / 0.15 : 1
    // janela do balanço "não" — só depois que já virou de frente, e some antes da recuperação
    const janela = Math.min(1, Math.max(0, (t - 0.18) / 0.67))
    const balanco = Math.sin(janela * Math.PI * 4) * 0.2 * Math.sin(janela * Math.PI)
    mesh.rotation.y = rotYOriginal + (anguloAlvo - rotYOriginal) * giro + balanco

    const avanco = Math.sin(t * Math.PI) * DISTANCIA_RECUSA
    mesh.position.x = posOriginal.x + direcaoCamera.x * avanco
    mesh.position.z = posOriginal.z + direcaoCamera.z * avanco

    if (membros) {
      const bracos = t < 0.22 ? t / 0.22 : t > 0.8 ? (1 - t) / 0.2 : 1
      membros.bracoEsq.rotation.x = base.bracoEsq - Math.PI * 0.32 * bracos
      membros.bracoDir.rotation.x = base.bracoDir - Math.PI * 0.32 * bracos
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      mesh.rotation.y = rotYOriginal
      mesh.position.x = posOriginal.x
      mesh.position.z = posOriginal.z
      if (membros) {
        membros.bracoEsq.rotation.x = base.bracoEsq
        membros.bracoDir.rotation.x = base.bracoDir
      }
    }
  }
  requestAnimationFrame(passo)
}

/** Duração do golpe de espada do peão ao capturar — preparação, corte e recuperação. */
const DURACAO_ATAQUE_MS = 520
/** Fração da duração em que o golpe atinge o alvo — é aí que o efeito de impacto dispara. */
const INSTANTE_IMPACTO = 0.55
/** Quanto a peça avança fisicamente na direção do alvo durante o golpe (lunge), voltando depois. */
const DISTANCIA_LUNGE = 0.14

/**
 * Curva do balanço do braço em 3 tempos — bem mais dramática que um simples vaivém: puxa o braço
 * pra trás (preparação), dispara num arco bem mais amplo que a guarda normal (corte) e só depois
 * assenta de volta na pose de guarda (recuperação). Valor 0 = pose de guarda; positivo = à frente.
 */
function curvaDoGolpe(t: number): number {
  if (t < 0.25) {
    const k = t / 0.25
    return -0.55 * k * k
  }
  if (t < INSTANTE_IMPACTO) {
    const k = (t - 0.25) / (INSTANTE_IMPACTO - 0.25)
    return -0.55 + 2.75 * (1 - Math.pow(1 - k, 3))
  }
  const k = (t - INSTANTE_IMPACTO) / (1 - INSTANTE_IMPACTO)
  return 2.2 * (1 - k * k)
}

/** Estilo do golpe do peão ao capturar — sorteado a cada captura, pra não repetir sempre a mesma animação. */
type EstiloAtaque = 'corte' | 'derrubada'

/**
 * Ataque de espada do peão ao capturar: vira de frente pro alvo, avança um passo (lunge) e desfere
 * um golpe bem mais amplo — preparação, corte e recuperação — antes de assentar de volta na guarda.
 * Dois estilos possíveis: "corte" é um golpe vertical de cima pra baixo; "derrubada" é uma
 * bordoada bem mais larga e horizontal, de baixo pra cima, feita pra jogar a peça atingida longe
 * (ver `direcaoNocauteDoEstilo`). `aoImpacto` dispara no instante exato em que o golpe atinge o
 * alvo (pro efeito de impacto e a queda da peça atingida ficarem sincronizados com a espada, não
 * só depois de tudo terminar).
 */
function animarAtaqueEspada(
  mesh: THREE.Object3D,
  direcao: { x: number; z: number },
  estilo: EstiloAtaque,
  aoImpacto: () => void,
  aoTerminar: () => void,
) {
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const maoDireitaRPG = mesh.userData.maoDireitaRPG as THREE.Object3D | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA
  const rotYOriginal = mesh.rotation.y
  const posOriginal = { x: mesh.position.x, z: mesh.position.z }
  const anguloAlvo = Math.atan2(direcao.x, direcao.z)
  const inicio = performance.now()
  let impactoDisparado = false

  // desembainha — a espada só existe presa na mão durante o golpe; o resto do tempo o peão só
  // tem o cabo na bainha (parte fixa do corpo, do lado esquerdo — ver criar_peao_rpg.py). Guardada
  // de volta ao fim do ataque. Peça geométrica pendura no pivô do braço (membros); peão RPG
  // pendura no osso da mão direita (Hand_R, ver buildPeaoRPG) — os dois nunca coexistem na mesma
  // peça, cada uma usa só o seu.
  const espadaDesembainhada = criarEspadaDoPeao()
  if (maoDireitaRPG) {
    espadaDesembainhada.rotation.x = Math.PI * 0.5
    espadaDesembainhada.position.y = -0.03
    espadaDesembainhada.scale.setScalar(0.55)
    maoDireitaRPG.add(espadaDesembainhada)
  } else {
    espadaDesembainhada.position.y = -CONFIG_BRACO_DIR.comprimento
    espadaDesembainhada.rotation.z = Math.PI * 0.15
    espadaDesembainhada.scale.setScalar(1.5)
    membros?.bracoDir.add(espadaDesembainhada)
  }

  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / DURACAO_ATAQUE_MS)
    // vira de frente rápido, segura o giro durante o golpe e desfaz na recuperação
    const giro = t < 0.2 ? t / 0.2 : t > 0.85 ? (1 - t) / 0.15 : 1
    mesh.rotation.y = rotYOriginal + (anguloAlvo - rotYOriginal) * giro

    // avança um passo físico na direção do golpe (lunge) e volta, acompanhando o corte
    const avanco = Math.max(0, Math.sin(Math.min(1, t / INSTANTE_IMPACTO) * Math.PI)) * DISTANCIA_LUNGE
    mesh.position.x = posOriginal.x + direcao.x * avanco
    mesh.position.z = posOriginal.z + direcao.z * avanco

    if (membros) {
      const golpe = curvaDoGolpe(t)
      if (estilo === 'derrubada') {
        // bordoada larga e horizontal — o braço varre de lado em vez de cortar de cima pra baixo
        membros.bracoDir.rotation.z = golpe * -1.3
        membros.bracoDir.rotation.x = base.bracoDir + golpe * 0.3
      } else {
        membros.bracoDir.rotation.x = base.bracoDir + golpe
        membros.bracoDir.rotation.z = golpe * -0.35
      }
    }

    if (!impactoDisparado && t >= INSTANTE_IMPACTO) {
      impactoDisparado = true
      aoImpacto()
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      mesh.rotation.y = rotYOriginal
      mesh.position.x = posOriginal.x
      mesh.position.z = posOriginal.z
      if (membros) {
        membros.bracoDir.rotation.x = base.bracoDir
        membros.bracoDir.rotation.z = 0
        membros.bracoDir.remove(espadaDesembainhada)
      }
      maoDireitaRPG?.remove(espadaDesembainhada)
      aoTerminar()
    }
  }
  requestAnimationFrame(passo)
}

/** Duração da queda (tomba) e do afundamento+desaparecimento da peça capturada, depois do golpe. */
const DURACAO_QUEDA_MS = 500
const DURACAO_SUMIR_MS = 650

/**
 * A peça capturada tomba pro chão e depois afunda no tabuleiro sumindo aos poucos — clona os
 * materiais antes (são compartilhados entre todas as peças da mesma facção/tipo) pra desvanecer só
 * essa peça sem afetar as outras que ainda estão em jogo. Quando `direcaoNocaute` é passado (golpe
 * de "derrubada"), a peça também desliza nessa direção enquanto cai, como se tivesse sido jogada
 * longe pelo golpe, em vez de só tombar no lugar.
 */
function animarQuedaEDesaparecimento(
  mesh: THREE.Object3D,
  aoTerminar: () => void,
  direcaoNocaute?: { x: number; z: number },
) {
  mesh.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const mat = obj.material
    if (Array.isArray(mat)) {
      obj.material = mat.map((m) => {
        const clone = m.clone()
        clone.transparent = true
        return clone
      })
    } else {
      const clone = mat.clone()
      clone.transparent = true
      obj.material = clone
    }
  })

  const yInicial = mesh.position.y
  const posOriginal = { x: mesh.position.x, z: mesh.position.z }
  const eixoQueda: 'x' | 'z' = Math.random() < 0.5 ? 'x' : 'z'
  const sinalQueda = Math.random() < 0.5 ? 1 : -1
  const duracaoTotal = DURACAO_QUEDA_MS + DURACAO_SUMIR_MS
  const inicio = performance.now()

  function definirOpacidade(valor: number) {
    mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const mat = obj.material
      if (Array.isArray(mat)) mat.forEach((m) => (m.opacity = valor))
      else mat.opacity = valor
    })
  }

  function passo(agora: number) {
    const decorrido = agora - inicio
    const tQueda = Math.min(1, decorrido / DURACAO_QUEDA_MS)
    const quedaSuave = 1 - Math.pow(1 - tQueda, 3)
    const anguloQueda = quedaSuave * (Math.PI / 2) * sinalQueda
    mesh.rotation[eixoQueda] = anguloQueda

    if (decorrido > DURACAO_QUEDA_MS) {
      const tSumir = Math.min(1, (decorrido - DURACAO_QUEDA_MS) / DURACAO_SUMIR_MS)
      mesh.position.y = yInicial - tSumir * 0.35
      definirOpacidade(1 - tSumir)
    }

    if (decorrido < duracaoTotal) {
      requestAnimationFrame(passo)
    } else {
      aoTerminar()
    }
  }
  requestAnimationFrame(passo)
}

// ---------------------------------------------------------------------------
// Efeito especial de acerto — um anel de luz se espalhando pelo chão mais um
// estilhaço de raios, no ponto exato do golpe. Some rápido, é só pra dar peso
// visual ao instante do impacto, antes da peça atingida cair. Material próprio
// (não-toon, sempre "aceso") clonado por instância pra cada cópia poder sumir
// (opacity) de forma independente sem afetar outros efeitos ainda em andamento.
// ---------------------------------------------------------------------------
const materialImpactoBase = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, depthWrite: false })
const geoAnelImpacto = new THREE.RingGeometry(0.05, 0.12, 32)
const geoRaioImpacto = new THREE.BoxGeometry(0.03, 0.02, 0.24)
const RAIOS_IMPACTO = 6
const DURACAO_IMPACTO_MS = 380

function criarEfeitoImpacto(): THREE.Group {
  const grupo = new THREE.Group()

  const anel = new THREE.Mesh(geoAnelImpacto, materialImpactoBase.clone())
  anel.rotation.x = -Math.PI / 2
  grupo.add(anel)

  for (let i = 0; i < RAIOS_IMPACTO; i++) {
    const raio = new THREE.Mesh(geoRaioImpacto, materialImpactoBase.clone())
    raio.position.y = 0.012
    raio.rotation.y = (i / RAIOS_IMPACTO) * Math.PI * 2
    raio.translateZ(0.14) // empurra pra fora ao longo do próprio eixo já girado — fica radial
    grupo.add(raio)
  }
  return grupo
}

/** Dispara o estouro de luz no ponto (x,z) do golpe — remove a si mesmo da cena ao terminar. */
function animarImpacto(scene: THREE.Object3D, x: number, z: number) {
  const efeito = criarEfeitoImpacto()
  efeito.position.set(x, 0.035, z)
  efeito.scale.setScalar(0.35)
  scene.add(efeito)

  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / DURACAO_IMPACTO_MS)
    const escala = 0.35 + t * 1.5
    efeito.scale.set(escala, 1, escala)
    const opacidade = 1 - t
    efeito.traverse((obj) => {
      if (obj instanceof THREE.Mesh) (obj.material as THREE.MeshBasicMaterial).opacity = opacidade
    })

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      scene.remove(efeito)
      efeito.traverse((obj) => {
        if (obj instanceof THREE.Mesh) (obj.material as THREE.Material).dispose()
      })
    }
  }
  requestAnimationFrame(passo)
}

export function ChessBoard3D({ jogador }: { jogador: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chessRef = useRef(new Chess())
  const livroRef = useRef<LivroDeAberturas>(new Map())
  const partidaAtualRef = useRef<PartidaXadrez | null>(null)
  const corHumanoRef = useRef<'w' | 'b'>('w')
  const acoesRef = useRef<{
    carregarPgn: (pgn: string, corHumano: 'w' | 'b') => void
    entrarEmDemo: () => void
    pararDemo: () => void
    pausarDemo: () => void
    retomarDemo: () => void
  } | null>(null)

  const [statusTexto, setStatusTexto] = useState('Carregando o tabuleiro…')
  const [livroInfo, setLivroInfo] = useState<string | null>(null)
  const [historico, setHistorico] = useState<string[]>([])
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const listaLancesRef = useRef<HTMLDivElement>(null)
  const [partidasEmAndamento, setPartidasEmAndamento] = useState<PartidaXadrez[]>([])
  const [partidasAberto, setPartidasAberto] = useState(false)
  const [partidasFinalizadas, setPartidasFinalizadas] = useState<PartidaXadrez[]>([])
  const [partidasFinalizadasAberto, setPartidasFinalizadasAberto] = useState(false)
  // true quando ainda não há partida em andamento e o jogador precisa escolher a cor antes de
  // começar (tanto na primeira vez quanto em "Novo jogo") — o admin logado já é o jogador fixo
  const [escolhendoCor, setEscolhendoCor] = useState(false)
  const [emDemo, setEmDemo] = useState(false)
  const [demoPausado, setDemoPausado] = useState(false)
  const [resultadoOverlay, setResultadoOverlay] = useState<'venceu' | 'perdeu' | null>(null)

  // acompanha os lances conforme são registrados — rola a lista pro fim assim que um novo lance
  // entra, pra sempre mostrar o mais recente sem precisar rolar manualmente
  useEffect(() => {
    if (!historicoAberto) return
    const el = listaLancesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [historico, historicoAberto])

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

  // o jogador é sempre o admin logado (fixo, não muda por aqui) — retoma a partida em andamento
  // mais recente dele, ou pede a cor pra começar uma primeira partida se não houver nenhuma
  useEffect(() => {
    let cancelado = false
    listPartidasDoJogador(jogador)
      .then((partidas) => {
        if (cancelado) return
        const emAndamento = partidas.filter((p) => p.status === 'EM_ANDAMENTO')
        setPartidasFinalizadas(partidas.filter((p) => p.status === 'FINALIZADA'))
        if (emAndamento.length > 0) {
          partidaAtualRef.current = emAndamento[0]
          setPartidasEmAndamento(emAndamento)
          acoesRef.current?.carregarPgn(emAndamento[0].pgn, emAndamento[0].corJogador)
        } else {
          // sem partida salva — fica em modo demonstração (só olhando) até clicar em "Novo jogo"
          acoesRef.current?.entrarEmDemo()
        }
      })
      .catch(() => {
        acoesRef.current?.entrarEmDemo()
      })
    return () => {
      cancelado = true
    }
  }, [jogador])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const selecionadaRef: { current: Square | null } = { current: null }
    const destinosRef: { current: Square[] } = { current: [] }
    const vezDaMaquinaRef: { current: boolean } = { current: false }
    const demoPausadaRef: { current: boolean } = { current: false }
    const pieceMeshBySquare = new Map<string, THREE.Group>()
    // pra não disparar a comemoração de novo enquanto o xeque-mate continuar sendo a posição atual
    let comemoracaoDisparada = false

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf5f0e6)
    // "far" bem além do maxDistance do controle de órbita (20) — antes os dois coincidiam, então
    // no zoom mais distante o tabuleiro chegava a ficar 100% da cor da névoa (basicamente
    // invisível); agora ele só vai desbotando um pouco, nunca sumindo, não importa a distância
    scene.fog = new THREE.Fog(0xf5f0e6, 11, 55)

    // câmera mais afastada e com FOV mais fechado que o normal — bem próxima e com campo de visão
    // largo deixava o tabuleiro com uma perspectiva exagerada, quase "olhando de raspão"
    const camera = new THREE.PerspectiveCamera(38, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100)
    camera.position.set(0, 9.5, 10)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(pixelRatioParaFullHD(container.clientWidth, container.clientHeight))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // sem tone mapping cinematográfico — pro estilo desenho/toon as cores ficam mais
    // vivas e chapadas sem o ACES "esmaecer" os tons como faria num render realista
    renderer.toneMapping = THREE.NoToneMapping
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    // o alvo fica na altura do corpo das peças (torso), não no chão do tabuleiro — senão o zoom
    // aproxima em direção a um ponto na casca do tabuleiro, e a peça (que tem altura) acaba saindo
    // por cima da tela bem antes da câmera "chegar" nela. Com o alvo na altura das peças, dá pra
    // aproximar de verdade até ficar cara a cara com uma peça, em vez de mergulhar no tabuleiro.
    controls.target.set(0, 0.4, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 2.2
    controls.maxDistance = 20
    controls.maxPolarAngle = Math.PI / 2 - 0.05

    // luz mais direcional e menos ambiente do que num render realista — é o que faz o
    // sombreamento em degraus do toon material aparecer, em vez de ficar tudo "lavado"
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x3a2a1a, 0.35))
    const dirLight = new THREE.DirectionalLight(0xfff3e0, 1.15)
    dirLight.position.set(4, 10, 6)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(2048, 2048)
    dirLight.shadow.camera.left = -6
    dirLight.shadow.camera.right = 6
    dirLight.shadow.camera.top = 6
    dirLight.shadow.camera.bottom = -6
    dirLight.shadow.bias = -0.0015
    scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.15)
    fillLight.position.set(-5, 6, -4)
    scene.add(fillLight)

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.25, 8.6),
      new THREE.MeshToonMaterial({ color: COR_BASE, gradientMap: gradienteToon }),
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
        const mat = new THREE.MeshToonMaterial({
          color: clara ? COR_CASA_CLARA : COR_CASA_ESCURA,
          gradientMap: gradienteToon,
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

    // coordenadas padrão do xadrez — colunas a-h na borda de trás (lado das brancas) e
    // linhas 1-8 na borda esquerda, deitadas no tabuleiro como os destaques de destino
    const labelsGroup = new THREE.Group()
    const labelGeo = new THREE.PlaneGeometry(0.32, 0.32)
    for (let f = 0; f < 8; f++) {
      const mat = new THREE.MeshBasicMaterial({ map: criarTexturaTexto(LETRAS_COLUNAS[f]), transparent: true })
      const mesh = new THREE.Mesh(labelGeo, mat)
      mesh.rotation.x = -Math.PI / 2
      const { x } = squareToPos(`${LETRAS_COLUNAS[f]}1`)
      mesh.position.set(x, 0.011, 4.15)
      labelsGroup.add(mesh)
    }
    for (let r = 0; r < 8; r++) {
      const mat = new THREE.MeshBasicMaterial({ map: criarTexturaTexto(String(r + 1)), transparent: true })
      const mesh = new THREE.Mesh(labelGeo, mat)
      mesh.rotation.x = -Math.PI / 2
      const { z } = squareToPos(`a${r + 1}`)
      mesh.position.set(-4.15, 0.011, z)
      labelsGroup.add(mesh)
    }
    scene.add(labelsGroup)

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
      // reconstrói o tabuleiro inteiro a partir do estado do motor — mas se uma peça continua na
      // mesma casa com o mesmo tipo/cor E está com um gesto amigável em andamento (meshesEmGesto),
      // reaproveita o mesh como está em vez de recriar do zero: senão um lance acontecendo no meio
      // de uma interação entre peças aliadas cortava/reiniciava a animação na hora
      const meshesAntigos = new Map(pieceMeshBySquare)
      pieceMeshBySquare.clear()
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (!casa) continue
          const existente = meshesAntigos.get(casa.square)
          if (
            existente &&
            meshesEmGesto.has(existente) &&
            existente.userData.tipo === casa.type &&
            existente.userData.cor === casa.color
          ) {
            pieceMeshBySquare.set(casa.square, existente)
            meshesAntigos.delete(casa.square)
            continue
          }
          const mesh = buildPieceMesh(casa.type, casa.color)
          const { x, z } = squareToPosPeca(casa.square)
          mesh.position.set(x, 0.05, z)
          piecesGroup.add(mesh)
          pieceMeshBySquare.set(casa.square, mesh)
        }
      }
      for (const [, meshVelho] of meshesAntigos) {
        piecesGroup.remove(meshVelho)
      }
    }

    /** Peças aliadas (mesma cor) a até `raio` casas de distância de `square`, sem incluir ela mesma. */
    function pecasAliadasProximas(square: Square, cor: 'w' | 'b', raio: number): { square: Square; mesh: THREE.Group }[] {
      const origem = squareToPos(square)
      const resultado: { square: Square; mesh: THREE.Group }[] = []
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (!casa || casa.color !== cor || casa.square === square) continue
          const mesh = pieceMeshBySquare.get(casa.square)
          if (!mesh) continue
          const pos = squareToPos(casa.square)
          if (Math.hypot(pos.x - origem.x, pos.z - origem.z) <= raio) {
            resultado.push({ square: casa.square as Square, mesh })
          }
        }
      }
      return resultado
    }

    // true enquanto a aura pulsante da peça selecionada (abaixo) deve continuar rodando — vira
    // false assim que os destaques são limpos, pra parar o loop de animação na próxima checagem
    let auraSelecaoAtiva = false

    function limparDestaques() {
      auraSelecaoAtiva = false
      descartarFilhos(highlightGroup)
    }

    function destacarSelecao(square: Square, destinos: Square[]) {
      limparDestaques()
      const posSel = squareToPos(square)

      // anel na casa atual (de onde a peça está saindo)
      const selMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.38, 32),
        new THREE.MeshBasicMaterial({ color: COR_SELECIONADA, side: THREE.DoubleSide }),
      )
      selMesh.rotation.x = -Math.PI / 2
      selMesh.position.set(posSel.x, 0.02, posSel.z)
      highlightGroup.add(selMesh)

      // círculos nas casas de destino (pra onde a peça pode ir)
      const destGeo = new THREE.CircleGeometry(0.14, 24)
      const destMat = new THREE.MeshBasicMaterial({ color: COR_DESTINO })
      for (const dest of destinos) {
        const destMesh = new THREE.Mesh(destGeo, destMat)
        destMesh.rotation.x = -Math.PI / 2
        const pos = squareToPos(dest)
        destMesh.position.set(pos.x, 0.02, pos.z)
        highlightGroup.add(destMesh)
      }

      // aura pulsante bem junto da própria peça — destaca a peça selecionada em si, não só a casa
      const auraGeo = new THREE.RingGeometry(0.15, 0.2, 28)
      const auraMat = new THREE.MeshBasicMaterial({ color: COR_SELECIONADA, side: THREE.DoubleSide, transparent: true })
      const auraMesh = new THREE.Mesh(auraGeo, auraMat)
      auraMesh.rotation.x = -Math.PI / 2
      auraMesh.position.set(posSel.x, 0.045, posSel.z)
      highlightGroup.add(auraMesh)

      auraSelecaoAtiva = true
      const inicioAura = performance.now()
      function pulsar(agora: number) {
        if (!auraSelecaoAtiva) return
        const onda = (Math.sin(((agora - inicioAura) / 850) * Math.PI * 2) + 1) / 2
        auraMesh.scale.setScalar(1 + onda * 0.22)
        auraMat.opacity = 0.5 + onda * 0.5
        requestAnimationFrame(pulsar)
      }
      requestAnimationFrame(pulsar)
    }

    // BRANCAS/PRETAS venceram, ou EMPATE — só chamar quando chess.isGameOver() for true
    function resultadoAtual(chess: Chess): ResultadoPartidaXadrez {
      if (chess.isCheckmate()) return chess.turn() === 'w' ? 'PRETAS' : 'BRANCAS'
      return 'EMPATE'
    }

    // salva o progresso da partida atual (PGN + status) depois de cada lance — assim o jogo
    // nunca se perde, mesmo fechando a aba no meio de uma partida. Quando a partida termina,
    // também alimenta o aprendizado da máquina com o que ela jogou nessa partida.
    function salvarProgresso() {
      const partida = partidaAtualRef.current
      if (!partida) return
      const chess = chessRef.current
      partida.pgn = chess.pgn()
      partida.atualizadaEm = Date.now()
      if (chess.isCheckmate()) {
        partida.status = 'FINALIZADA'
        partida.resultado =
          chess.turn() === corHumanoRef.current ? 'A máquina venceu (xeque-mate)' : 'Você venceu (xeque-mate)'
      } else if (chess.isStalemate()) {
        partida.status = 'FINALIZADA'
        partida.resultado = 'Empate por afogamento'
      } else if (chess.isDraw()) {
        partida.status = 'FINALIZADA'
        partida.resultado = 'Empate'
      }
      const finalizouAgora = partida.status === 'FINALIZADA'
      salvarPartida(partida)
        .then(() => {
          if (finalizouAgora) {
            setPartidasEmAndamento((prev) => prev.filter((p) => p.id !== partida.id))
            setPartidasFinalizadas((prev) => [partida, ...prev])
          }
        })
        .catch(() => {
          // sem servidor no momento — a partida segue salva só localmente até o próximo lance
        })
      if (finalizouAgora) {
        const corMaquina: 'w' | 'b' = corHumanoRef.current === 'w' ? 'b' : 'w'
        registrarAprendizadoDaPartida(chess.history({ verbose: true }), resultadoAtual(chess), [corMaquina])
      }
    }

    // xeque-mate: faz as peças do lado vencedor comemorarem (pulando, com os braços erguidos) e
    // mostra "Você venceu"/"Você perdeu" em destaque — só uma vez por mate (comemoracaoDisparada
    // só volta a false quando uma partida nova é carregada, em carregarPgn)
    function dispararComemoracaoDeXequeMate(chess: Chess) {
      if (comemoracaoDisparada) return
      comemoracaoDisparada = true

      const corVencedora: 'w' | 'b' = chess.turn() === 'w' ? 'b' : 'w'
      let atraso = 0
      for (const linha of chess.board()) {
        for (const casa of linha) {
          if (!casa || casa.color !== corVencedora) continue
          const mesh = pieceMeshBySquare.get(casa.square)
          if (mesh) animarComemoracao(mesh, atraso)
          atraso += 60
        }
      }
      setResultadoOverlay(corVencedora === corHumanoRef.current ? 'venceu' : 'perdeu')
    }

    function atualizarStatusTexto() {
      const chess = chessRef.current
      setHistorico(chess.history())
      const corHumano = corHumanoRef.current
      const labelCor = (c: 'w' | 'b') => (c === 'w' ? 'brancas' : 'pretas')
      if (!partidaAtualRef.current) {
        setStatusTexto(
          demoPausadaRef.current
            ? 'Modo demonstração pausado.'
            : 'Modo demonstração — partida entre máquinas. Clique em "Novo jogo" pra jogar.',
        )
      } else if (chess.isCheckmate()) {
        const vencedor =
          chess.turn() === corHumano
            ? `A máquina (${labelCor(corHumano === 'w' ? 'b' : 'w')})`
            : `Você (${labelCor(corHumano)})`
        setStatusTexto(`Xeque-mate — ${vencedor} venceu!`)
        dispararComemoracaoDeXequeMate(chess)
      } else if (chess.isStalemate()) {
        setStatusTexto('Empate por afogamento.')
      } else if (chess.isDraw()) {
        setStatusTexto('Empate.')
      } else if (chess.turn() !== corHumano) {
        setStatusTexto(chess.isCheck() ? 'Xeque! A máquina está pensando…' : 'A máquina está pensando…')
      } else {
        setStatusTexto(
          chess.isCheck() ? `Xeque! Sua vez (${labelCor(corHumano)}).` : `Sua vez — você joga com as ${labelCor(corHumano)}.`,
        )
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

      // chess.js (v1.x) lança exceção pra um lance que não é mais válido na posição atual (ex: um
      // lance calculado antes de outro já ter sido aplicado nesse meio-tempo) — sem isso, essa
      // exceção ficava sem tratamento dentro do setTimeout assíncrono e travava a tela pra sempre
      // em "a máquina está pensando…", já que aoTerminar() nunca era chamado.
      let resultado: ReturnType<typeof chess.move> | null
      try {
        resultado =
          typeof entrada === 'string' ? chess.move(entrada) : chess.move({ ...entrada, promotion: entrada.promotion ?? 'q' })
      } catch {
        resultado = null
      }
      if (!resultado) {
        aoTerminar()
        return
      }

      // registra o lance assim que é aplicado no motor — atualiza a lista de "Lances" e salva no
      // servidor na hora, sem esperar a animação (que numa captura leva vários segundos) terminar.
      // Antes só acontecia no fim da animação: fechar a aba nesse meio-tempo perdia o último lance,
      // e a lista de lances ficava visivelmente atrasada em relação ao que já tinha acontecido.
      setHistorico(chess.history())
      salvarProgresso()

      function seguirParaDestino() {
        if (meshMovendo && origem && destino) {
          const de = squareToPosPeca(origem)
          const para = squareToPosPeca(destino)
          animarPosicao(meshMovendo, de, para, () => {
            sincronizarPecas()
            aoTerminar()
          })
        } else {
          sincronizarPecas()
          aoTerminar()
        }
      }

      // peão capturando: golpe de espada primeiro, só depois a vítima cai e some — pra qualquer
      // outro tipo de peça capturando, mantém a remoção direta de antes
      const vitima = meshCapturada ?? (resultado.isEnPassant() && origem && destino
        ? pieceMeshBySquare.get(`${destino[0]}${origem[1]}` as Square)
        : undefined)

      if (vitima && resultado.piece === 'p' && meshMovendo && origem && destino) {
        const deAtaque = squareToPosPeca(origem)
        const paraAtaque = squareToPosPeca(destino)
        const direcao = { x: paraAtaque.x - deAtaque.x, z: paraAtaque.z - deAtaque.z }
        // sorteia o estilo do golpe a cada captura, pra não ser sempre a mesma animação
        const estilo: EstiloAtaque = Math.random() < 0.5 ? 'corte' : 'derrubada'
        tocarClipeRPGUmaVez(meshMovendo, 'Attack')
        animarAtaqueEspada(
          meshMovendo,
          direcao,
          estilo,
          () => {
            // no instante exato do impacto — não espera a espada voltar pra guarda pra já cair
            animarImpacto(scene, vitima.position.x, vitima.position.z)
            const nocaute = estilo === 'derrubada' ? direcao : undefined
            animarQuedaEDesaparecimento(
              vitima,
              () => {
                piecesGroup.remove(vitima)
                seguirParaDestino()
              },
              nocaute,
            )

            // peças aliadas da atacante que estejam por perto comemoram junto, numa versão
            // curta da comemoração de xeque-mate
            const corAtacante = resultado.color
            let atraso = 0
            for (const aliada of pecasAliadasProximas(destino, corAtacante, 2.2)) {
              animarComemoracao(aliada.mesh, atraso, 900)
              atraso += 80
            }
          },
          () => {},
        )
        return
      }

      if (meshCapturada) {
        piecesGroup.remove(meshCapturada)
      } else if (resultado.isEnPassant() && origem && destino) {
        const casaCapturada = `${destino[0]}${origem[1]}` as Square
        const meshEnPassant = pieceMeshBySquare.get(casaCapturada)
        if (meshEnPassant) piecesGroup.remove(meshEnPassant)
      }

      seguirParaDestino()
    }

    function jogarLanceDaMaquina() {
      const chess = chessRef.current
      // vezDaMaquinaRef.current já true = já tem um cálculo de lance em andamento — chamar de
      // novo nesse meio-tempo (ex: efeito remontado em dev) faria duas buscas concorrentes brigando
      // pelo mesmo tabuleiro, e a segunda a terminar tentaria aplicar um lance já ilegal
      if (chess.isGameOver() || chess.turn() === corHumanoRef.current || vezDaMaquinaRef.current) return
      vezDaMaquinaRef.current = true
      atualizarStatusTexto()
      window.setTimeout(async () => {
        const lance = await escolherJogadaDaMaquina(chess, livroRef.current)
        if (!lance) {
          vezDaMaquinaRef.current = false
          atualizarStatusTexto()
          return
        }
        executarLanceComAnimacao(lance, () => {
          vezDaMaquinaRef.current = false
          atualizarStatusTexto()
        })
      }, PAUSA_MAQUINA_MS)
    }

    // ---------------------------------------------------------------------
    // Modo demonstração — sem partida do jogador ativa, o tabuleiro fica
    // jogando sozinho (máquina x máquina), um lance a cada 15-30s, só pra
    // exibição/aprendizado. Para assim que uma partida de verdade começa.
    // ---------------------------------------------------------------------
    let demoTimeoutId: number | undefined

    function pararDemo() {
      if (demoTimeoutId !== undefined) {
        window.clearTimeout(demoTimeoutId)
        demoTimeoutId = undefined
      }
    }

    function agendarProximoLanceDemo() {
      pararDemo()
      demoTimeoutId = window.setTimeout(jogarLanceDemo, atrasoDemoAleatorio(chessRef.current))
    }

    async function jogarLanceDemo() {
      if (partidaAtualRef.current) return // uma partida de verdade começou nesse meio-tempo
      const chess = chessRef.current
      if (chess.isGameOver()) {
        // partida demonstrativa terminou — as duas cores aprendem com ela, já que as duas são a máquina
        registrarAprendizadoDaPartida(chess.history({ verbose: true }), resultadoAtual(chess), ['w', 'b'])
        demoTimeoutId = window.setTimeout(() => {
          if (partidaAtualRef.current) return
          chess.reset()
          sincronizarPecas()
          limparDestaques()
          atualizarStatusTexto()
          agendarProximoLanceDemo()
        }, 3000)
        return
      }
      const lance = await escolherJogadaDaMaquina(chess, livroRef.current)
      if (!lance) {
        agendarProximoLanceDemo()
        return
      }
      executarLanceComAnimacao(lance, () => {
        atualizarStatusTexto()
        agendarProximoLanceDemo()
      })
    }

    function tentarSelecionar(square: Square) {
      if (!partidaAtualRef.current) return
      const chess = chessRef.current
      if (chess.isGameOver()) return
      if (chess.turn() !== corHumanoRef.current || vezDaMaquinaRef.current) {
        // clicou numa peça do próprio time fora da vez — ela reage em vez de simplesmente ignorar
        const pecaClicada = chess.get(square)
        const mesh = pieceMeshBySquare.get(square)
        if (pecaClicada && pecaClicada.color === corHumanoRef.current && mesh) {
          const dx = camera.position.x - mesh.position.x
          const dz = camera.position.z - mesh.position.z
          const dist = Math.hypot(dx, dz) || 1
          animarRecusa(mesh, { x: dx / dist, z: dz / dist })
        }
        return
      }
      const peca = chess.get(square)
      if (!peca || peca.color !== corHumanoRef.current) {
        selecionadaRef.current = null
        limparDestaques()
        return
      }
      const jogadas = chess.moves({ square, verbose: true })
      const destinos = jogadas.map((j) => j.to as Square)
      selecionadaRef.current = square
      destinosRef.current = destinos
      destacarSelecao(square, destinos)

      // peças aliadas por perto reagem (gesto sorteado) na direção da peça que acabou de ser
      // selecionada, cada uma com um pequeno atraso pra não ficarem todas sincronizadas
      const posSel = squareToPos(square)
      let atrasoReacao = 0
      for (const aliada of pecasAliadasProximas(square, peca.color, 2.2)) {
        const pos = squareToPos(aliada.square)
        animarGestoAmigavel(aliada.mesh, { x: posSel.x - pos.x, z: posSel.z - pos.z }, undefined, atrasoReacao)
        atrasoReacao += 120
      }
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
      // carrega uma partida salva (PGN) ou começa uma nova (pgn vazio) — usado tanto pra
      // retomar a partida em andamento ao abrir quanto pra começar uma partida nova depois
      carregarPgn(pgn: string, corHumano: 'w' | 'b') {
        pararDemo()
        demoPausadaRef.current = false
        setEmDemo(false)
        setDemoPausado(false)
        comemoracaoDisparada = false
        setResultadoOverlay(null)
        const chess = chessRef.current
        corHumanoRef.current = corHumano
        if (pgn) {
          try {
            chess.loadPgn(pgn)
          } catch {
            chess.reset()
          }
        } else {
          chess.reset()
        }
        selecionadaRef.current = null
        destinosRef.current = []
        vezDaMaquinaRef.current = false
        sincronizarPecas()
        limparDestaques()
        atualizarStatusTexto()
        if (!chess.isGameOver() && chess.turn() !== corHumanoRef.current) jogarLanceDaMaquina()
      },
      // sem partida do jogador ativa — o tabuleiro joga sozinho (máquina x máquina) até
      // clicar em "Novo jogo"
      entrarEmDemo() {
        partidaAtualRef.current = null
        demoPausadaRef.current = false
        setEmDemo(true)
        setDemoPausado(false)
        chessRef.current.reset()
        selecionadaRef.current = null
        destinosRef.current = []
        vezDaMaquinaRef.current = false
        sincronizarPecas()
        limparDestaques()
        atualizarStatusTexto()
        agendarProximoLanceDemo()
      },
      pararDemo,
      pausarDemo() {
        if (partidaAtualRef.current || demoPausadaRef.current) return
        pararDemo()
        demoPausadaRef.current = true
        setDemoPausado(true)
        atualizarStatusTexto()
      },
      retomarDemo() {
        if (partidaAtualRef.current || !demoPausadaRef.current) return
        demoPausadaRef.current = false
        setDemoPausado(false)
        atualizarStatusTexto()
        agendarProximoLanceDemo()
      },
    }

    sincronizarPecas()
    atualizarStatusTexto()

    // o modelo RPG do peão carrega em segundo plano — quando (e se) chegar, re-sincroniza pra
    // trocar os peões já desenhados (geométricos) pelo modelo novo, sem precisar recarregar a página
    let montado = true
    garantirModeloPeaoRPG(() => {
      if (montado) sincronizarPecas()
    })

    const relogio = new THREE.Clock()
    let frameId = 0
    function animate() {
      frameId = requestAnimationFrame(animate)
      const delta = relogio.getDelta()
      for (const peca of piecesGroup.children) {
        ;(peca.userData.mixer as THREE.AnimationMixer | undefined)?.update(delta)
      }
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

    // interações casuais entre peças aliadas — de vez em quando (não depende de nenhuma ação do
    // jogador), duas peças do mesmo time que estejam próximas viram uma pra outra e acenam, só pra
    // dar uma sensação de vida no tabuleiro enquanto esperam a vez. Roda tanto em modo demonstração
    // quanto numa partida de verdade.
    let interacaoTimeoutId: number | undefined
    function agendarProximaInteracaoAmigavel() {
      interacaoTimeoutId = window.setTimeout(tentarInteracaoAmigavel, 6000 + Math.random() * 7000)
    }
    function tentarInteracaoAmigavel() {
      const casasComPeca: { square: Square; color: 'w' | 'b' }[] = []
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (casa) casasComPeca.push({ square: casa.square as Square, color: casa.color })
        }
      }
      const origem = casasComPeca[Math.floor(Math.random() * casasComPeca.length)]
      const meshOrigem = origem ? pieceMeshBySquare.get(origem.square) : undefined
      if (origem && meshOrigem) {
        const aliadas = pecasAliadasProximas(origem.square, origem.color, 1.6)
        if (aliadas.length > 0) {
          const alvo = aliadas[Math.floor(Math.random() * aliadas.length)]
          const posOrigem = squareToPos(origem.square)
          const posAlvo = squareToPos(alvo.square)
          // as duas fazem o mesmo gesto sorteado, uma respondendo a outra com um pequeno atraso —
          // fica mais com cara de "interação" do que dois gestos aleatórios sem relação
          const gesto = POOL_GESTOS[Math.floor(Math.random() * POOL_GESTOS.length)]
          animarGestoAmigavel(meshOrigem, { x: posAlvo.x - posOrigem.x, z: posAlvo.z - posOrigem.z }, gesto)
          animarGestoAmigavel(alvo.mesh, { x: posOrigem.x - posAlvo.x, z: posOrigem.z - posAlvo.z }, gesto, 400)
        }
      }
      agendarProximaInteracaoAmigavel()
    }
    agendarProximaInteracaoAmigavel()

    return () => {
      montado = false
      pararDemo()
      window.clearTimeout(interacaoTimeoutId)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('click', onClick)
      cancelAnimationFrame(frameId)
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  const paresLances = useMemo(() => {
    const pares: { numero: number; branco: string; preto?: string }[] = []
    for (let i = 0; i < historico.length; i += 2) {
      pares.push({ numero: i / 2 + 1, branco: historico[i], preto: historico[i + 1] })
    }
    return pares
  }, [historico])

  function handleNovoJogo() {
    acoesRef.current?.pararDemo()
    setEscolhendoCor(true)
  }

  async function handleEscolherCor(cor: 'w' | 'b') {
    setEscolhendoCor(false)
    const nova = novaPartida(jogador, cor)
    try {
      await salvarPartida(nova)
    } catch {
      // sem servidor — segue mesmo assim, só não fica persistido até a conexão voltar
    }
    partidaAtualRef.current = nova
    setPartidasEmAndamento((prev) => [nova, ...prev])
    acoesRef.current?.carregarPgn('', cor)
  }

  // recarrega o PGN igual a retomar uma partida em andamento — como o jogo já terminou (xeque-mate,
  // afogamento ou empate), não sobra nenhum lance legal pro chess.js aceitar, então o tabuleiro fica
  // naturalmente travado só de olhar, sem precisar de nenhuma trava extra
  function handleVerPartidaFinalizada(partida: PartidaXadrez) {
    handleRetomarPartida(partida)
  }

  function resultadoPartida(partida: PartidaXadrez): 'venceu' | 'perdeu' | 'empate' {
    if (partida.resultado?.startsWith('Você venceu')) return 'venceu'
    if (partida.resultado?.startsWith('A máquina venceu')) return 'perdeu'
    return 'empate'
  }

  function handleRetomarPartida(partida: PartidaXadrez) {
    partidaAtualRef.current = partida
    acoesRef.current?.carregarPgn(partida.pgn, partida.corJogador)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!emDemo && (
          <div>
            <p className="text-sm font-medium text-ink-700">{statusTexto}</p>
            <p className="text-xs text-ink-400">
              Jogando como <span className="font-medium text-ink-600">{jogador}</span>
            </p>
          </div>
        )}
        <div className="flex gap-2">
          {emDemo && (
            <Button
              variant="ghost"
              onClick={() =>
                demoPausado ? acoesRef.current?.retomarDemo() : acoesRef.current?.pausarDemo()
              }
              disabled={escolhendoCor}
            >
              {demoPausado ? 'Retomar demonstração' : 'Pausar demonstração'}
            </Button>
          )}
          <Button variant="secondary" onClick={handleNovoJogo} disabled={escolhendoCor}>
            Novo jogo
          </Button>
        </div>
      </div>

      {resultadoOverlay && (
        // banner fora do tabuleiro (não é um overlay por cima dele) — assim a comemoração das
        // peças no tabuleiro continua totalmente visível, em vez de escondida atrás de um fundo
        // escurecido/borrado
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
            resultadoOverlay === 'venceu' ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>
              {resultadoOverlay === 'venceu' ? '🏆' : '💀'}
            </span>
            <div>
              <p
                className={`font-display text-lg font-bold ${
                  resultadoOverlay === 'venceu' ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {resultadoOverlay === 'venceu' ? 'Você venceu!' : 'Você perdeu'}
              </p>
              <p className="text-xs text-ink-400">Xeque-mate — veja as peças comemorando no tabuleiro.</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" onClick={() => setResultadoOverlay(null)}>
              Fechar
            </Button>
            <Button variant="primary" onClick={handleNovoJogo}>
              Novo jogo
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        <div
          ref={containerRef}
          className="w-full aspect-[4/3] sm:aspect-video rounded-xl overflow-hidden border border-ink-100 touch-none"
        />

        {escolhendoCor && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm rounded-xl p-4">
            <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-xl text-center">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Com qual peça você quer jogar?</h3>
              <p className="text-xs text-ink-400 mb-4">Escolha antes de começar essa partida.</p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => handleEscolherCor('w')}
                  className="flex flex-col items-center gap-2 rounded-xl border border-ink-200 hover:border-ink-400 hover:bg-ink-50 transition px-5 py-4"
                >
                  <span className="h-10 w-10 rounded-full bg-white border-2 border-ink-300 shadow-inner" />
                  <span className="text-sm font-medium text-ink-800">Brancas</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleEscolherCor('b')}
                  className="flex flex-col items-center gap-2 rounded-xl border border-ink-200 hover:border-ink-400 hover:bg-ink-50 transition px-5 py-4"
                >
                  <span className="h-10 w-10 rounded-full bg-ink-900 border-2 border-ink-900 shadow-inner" />
                  <span className="text-sm font-medium text-ink-800">Pretas</span>
                </button>
              </div>
              {partidaAtualRef.current && (
                <button
                  type="button"
                  onClick={() => setEscolhendoCor(false)}
                  className="mt-4 text-xs text-ink-400 underline hover:text-ink-600"
                >
                  Cancelar e voltar pra partida atual
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-ink-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoricoAberto((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
        >
          Lances
          <span aria-hidden className={`transition-transform ${historicoAberto ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
        {historicoAberto && (
          <div
            ref={listaLancesRef}
            className="max-h-48 overflow-y-auto px-3 pb-2 text-xs text-ink-600 space-y-0.5 border-t border-ink-100 pt-2"
          >
            {paresLances.length === 0 ? (
              <p className="text-ink-400">Nenhum lance ainda.</p>
            ) : (
              paresLances.map((p) => (
                <div key={p.numero} className="flex gap-2 tabular-nums">
                  <span className="w-4 text-ink-400">{p.numero}.</span>
                  <span className="flex-1 font-mono">{p.branco.toUpperCase()}</span>
                  <span className="flex-1 font-mono">{p.preto?.toUpperCase() ?? ''}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {partidasEmAndamento.length > 1 && (
        <div className="rounded-xl border border-ink-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setPartidasAberto((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
          >
            Partidas
            <span aria-hidden className={`transition-transform ${partidasAberto ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </button>
          {partidasAberto && (
            <div className="flex flex-wrap gap-2 px-3 pb-3 pt-1 border-t border-ink-100">
              {partidasEmAndamento.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleRetomarPartida(p)}
                  className={`pill-tab border ${
                    partidaAtualRef.current?.id === p.id
                      ? 'bg-ink-950 border-ink-950 text-white'
                      : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  Partida de {new Date(p.criadaEm).toLocaleDateString('pt-BR')}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {partidasFinalizadas.length > 0 && (
        <div className="rounded-xl border border-ink-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setPartidasFinalizadasAberto((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
          >
            Partidas finalizadas
            <span aria-hidden className={`transition-transform ${partidasFinalizadasAberto ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </button>
          {partidasFinalizadasAberto && (
            <div className="flex flex-wrap gap-2 px-3 pb-3 pt-1 border-t border-ink-100">
              {partidasFinalizadas.map((p) => {
                const resultado = resultadoPartida(p)
                const ativa = partidaAtualRef.current?.id === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleVerPartidaFinalizada(p)}
                    title={p.resultado}
                    className={`pill-tab border ${
                      ativa
                        ? 'bg-ink-950 border-ink-950 text-white'
                        : resultado === 'venceu'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : resultado === 'perdeu'
                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                    }`}
                  >
                    Partida de {new Date(p.criadaEm).toLocaleDateString('pt-BR')}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-ink-400">{livroInfo ?? 'Carregando arquivo de referência…'}</p>
    </div>
  )
}
