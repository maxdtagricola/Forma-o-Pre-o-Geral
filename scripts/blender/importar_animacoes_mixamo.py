"""
Monta as peças do xadrez do jogo no esqueleto e nas animações que vieram do Mixamo.

O peão foi riggado no Mixamo a partir da versão gerada pelo exportar_peao_mixamo.py (pose T, sem
chapéu nem bainha, remalhada numa peça só, em tamanho de gente). Do Mixamo vêm:
    peao_rpgrtp.fbx                    — o peão riggado (esqueleto "mixamorig", 25 ossos)
    sword and shield <nome>.fbx         — as animações (só esqueleto, sem malha)

Todas as peças usam o MESMO esqueleto e as mesmas animações de base: o corpo é o do peão (a malha de
baixo polígono do criar_peao_rpg.py) e cada tipo muda só os acessórios (ver ACESSORIOS) — elmo com
ameias da torre, mitra e cajado do bispo, coroa/capa/cetro da dama, coroa com cruz do rei. O cavalo
vira um cavaleiro com elmo de cavalo (orelhas e crina): um cavalo de verdade precisaria de outro
esqueleto. Cada peça tem os seus próprios golpes (ver GOLPES) — nenhum golpe se repete entre peças.

O que o script faz: monta cada peça na mesma pose T do arquivo do Mixamo, encaixa nela o esqueleto
do Mixamo (de volta ao tamanho do jogo), prende cada parte no osso correspondente e grava os clipes
com os nomes que o jogo usa (ver ChessBoard3D.tsx):
    Parado        — em pé normal, braços caídos (a pose original do peão)
    Gesto1/2      — movimentos que o jogo toca de vez em quando, sorteados
    Walk          — andar no lugar (quem leva a peça de casa em casa é o código)
    Attack1, 2…   — os golpes da peça, sorteados a cada captura
Também cria o osso "Hand_R" (filho da mão direita do Mixamo), onde o jogo pendura a espada no golpe.
Os modelos saem olhando pra +Z do Three.js, a frente de todas as peças do tabuleiro.

Roda sem abrir a interface:
    blender --background --python scripts/blender/importar_animacoes_mixamo.py

Grava public/models/<peça>_rpg.glb (ver PECAS) e uma imagem de conferência, peao_rpg_jogo.png,
nesta pasta.
"""

import json
import math
import os
import struct
import sys

import bmesh
import bpy
from bpy_extras import anim_utils
from mathutils import Matrix, Vector

PASTA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PASTA)
sys.dont_write_bytecode = True  # sem pasta __pycache__ no projeto
import criar_peao_rpg as base  # noqa: E402 — só as funções (o main() de lá não roda ao importar)
import exportar_peao_mixamo as mixamo  # noqa: E402 — idem

CAMINHO_RIG = os.path.join(PASTA, "peao_rpgrtp.fbx")
PASTA_MODELOS = os.path.join(PASTA, "..", "..", "public", "models")
CAMINHO_PNG = os.path.join(PASTA, "peao_rpg_jogo.png")
CAMINHO_PNG_MORTAL = os.path.join(PASTA, "peao_rpg_mortal.png")

# tipo da peça (letra do chess.js) → arquivo do modelo em public/models
PECAS = {
    "p": "peao_rpg.glb",
    "r": "torre_rpg.glb",
    "n": "cavalo_rpg.glb",
    "b": "bispo_rpg.glb",
    "q": "dama_rpg.glb",
    "k": "rei_rpg.glb",
}

# clipes comuns a todas as peças → arquivo do Mixamo. Parado o peão fica em pé normal (o clipe
# "Parado", montado aqui — ver criar_parado); os "Gesto…" são movimentos que o jogo toca de vez em
# quando, num intervalo sorteado pra cada peça (ver atualizarGestoRPG em ChessBoard3D.tsx)
ANIMACOES = {
    "Gesto1": "sword and shield idle.fbx",
    "Gesto2": "sword and shield idle (2).fbx",
    "Walk": "sword and shield walk.fbx",
}

# golpes de cada peça, sorteados pelo jogo a cada captura — nenhum se repete entre peças. Cada um:
# (arquivo, quadro de início, quadro do impacto, quadro do fim, anda?). O golpe do jogo
# (animarAtaqueEspada em ChessBoard3D.tsx) dura DURACAO_ATAQUE_MS = 520 ms, com o impacto em
# INSTANTE_IMPACTO = 0,55 dele (~0,29 s), e a espada some da mão no fim — então cada golpe é cortado
# entre o início e o fim escolhidos e acelerado/desacelerado pro impacto (mão ou pé mais rápido,
# medido quadro a quadro) cair nesse instante; depois do fim o jogo mistura de volta com o Parado.
# "anda?" = o golpe do Mixamo dá passos pra frente: o quadril perde o avanço, como no Walk (quem
# avança na direção da vítima é o próprio jogo).
GOLPES = {
    "p": [
        ("sword and shield slash.fbx", 1, 19, 34, False),  # corte diagonal
        ("sword and shield attack (4).fbx", 1, 14, 17, False),  # estocada curta
    ],
    "r": [
        ("sword and shield slash (2).fbx", 1, 21, 28, False),  # golpe de cima pra baixo
        ("sword and shield kick.fbx", 1, 13, 17, False),  # chute
    ],
    "n": [
        ("sword and shield attack (2).fbx", 1, 20, 22, True),  # investida
        ("sword and shield slash (3).fbx", 17, 26, 29, False),  # golpe de baixo pra cima
    ],
    "b": [
        ("sword and shield casting (2).fbx", 1, 7, 10, False),  # magia lançada com a mão
        ("sword and shield power up.fbx", 1, 16, 20, False),  # carga de energia
    ],
    "q": [
        ("sword and shield slash (4).fbx", 24, 41, 46, False),  # golpe giratório de cima
    ],
    "k": [
        ("sword and shield attack (3).fbx", 8, 24, 28, True),  # estocada com passo
    ],
}
FPS = 30  # o Mixamo exporta a 30 quadros por segundo
DURACAO_GOLPE_JOGO = 0.52
INSTANTE_IMPACTO_JOGO = 0.55

# em pé: cada membro do Mixamo volta da pose T girando em volta da junta do peão original (o
# inverso do que o exportar_peao_mixamo.py fez pra montar a pose T) — osso do Mixamo, junta do
# peão original, ângulo em volta do eixo Y
VOLTA_DA_POSE_T = (
    ("mixamorig:LeftArm", "Arm_L", -mixamo.ANGULO_BRACOS),
    ("mixamorig:RightArm", "Arm_R", mixamo.ANGULO_BRACOS),
    ("mixamorig:LeftUpLeg", "Leg_L", -mixamo.ANGULO_PERNAS),
    ("mixamorig:RightUpLeg", "Leg_R", mixamo.ANGULO_PERNAS),
)

# parte do corpo (criar_peao_rpg.py) → osso do Mixamo; peso 100% rígido, igual ao peão antigo. O
# tronco é o único dividido (ver pesar_por_altura): a base segue o quadril e o topo, o peito.
OSSO_DA_PARTE = {
    "Cabeca": "mixamorig:Head",
    "Chapeu": "mixamorig:Head",
    "Ombro_L": "mixamorig:LeftArm",
    "Ombro_R": "mixamorig:RightArm",
    "Braco_L": "mixamorig:LeftArm",
    "Braco_R": "mixamorig:RightArm",
    "Antebraco_L": "mixamorig:LeftForeArm",
    "Antebraco_R": "mixamorig:RightForeArm",
    "Perna_L": "mixamorig:LeftUpLeg",
    "Perna_R": "mixamorig:RightUpLeg",
    "Canela_L": "mixamorig:LeftLeg",
    "Canela_R": "mixamorig:RightLeg",
    "Bota_L": "mixamorig:LeftLeg",
    "Bota_R": "mixamorig:RightLeg",
    "Bainha": "mixamorig:Hips",
    "CaboBainha": "mixamorig:Hips",
}
OSSO_BASE_TRONCO = "mixamorig:Hips"
OSSO_TOPO_TRONCO = "mixamorig:Spine2"
MISTURA_TRONCO = "tronco"  # alvo das peças que dobram com a coluna (tronco, capa)

# osso do Mixamo → osso do peão original que leva a peça junto na pose T (os acessórios são
# montados com o peão em pé, igual ao corpo, e vão pra pose T pelo esqueleto antigo)
OSSO_ANTIGO = {
    "mixamorig:Head": "Head",
    "mixamorig:LeftForeArm": "Forearm_L",
    "mixamorig:RightForeArm": "Forearm_R",
    "mixamorig:LeftArm": "Arm_L",
    "mixamorig:RightArm": "Arm_R",
    "mixamorig:Spine2": "Spine",
    "mixamorig:Hips": "Spine",
    MISTURA_TRONCO: "Spine",
}

# materiais — o jogo troca cada um pela cor da facção pelo nome (ver buildPecaRPG): Corpo e Detalhe
# seguem a facção (branca/preta), Coroa é dourado e Brilho é a cor clara de destaque
MATERIAIS = {
    "Corpo": (0.75, 0.75, 0.78, 1.0),
    "Detalhe": (0.3, 0.35, 0.55, 1.0),
    "Coroa": (0.88, 0.73, 0.24, 1.0),
    "Brilho": (0.56, 0.89, 1.0, 1.0),
}
# peças de túnica: o tronco vai na cor de detalhe (como a batina/vestido das peças geométricas)
TRONCO_DETALHE = {"b", "q", "k"}

# Acessórios por peça, com o peão em pé (Z pra cima, frente em +Y, esquerda do peão em -X — a mão
# esquerda segura cajado/cetro, a direita fica livre pra espada). Cada um: (nome, forma, medidas,
# posição, giro, material, osso do Mixamo). Medidas: caixa (x, y, z), cilindro/cone (raio, raio do
# topo, altura), esfera (raio,), anel (raio, espessura). Os números seguem os acessórios das peças
# geométricas do tabuleiro (geometriasDoTipo em ChessBoard3D.tsx), no tamanho deste corpo (cabeça
# com centro em z=0,70 e raio 0,07; mãos em x=±0,11, z≈0,33).
ACESSORIOS = {
    "p": [],
    "r": [
        ("Ombreira_L", "caixa", (0.08, 0.09, 0.05), (-0.115, 0, 0.615), (0, 0, 0), "Detalhe", "mixamorig:LeftArm"),
        ("Ombreira_R", "caixa", (0.08, 0.09, 0.05), (0.115, 0, 0.615), (0, 0, 0), "Detalhe", "mixamorig:RightArm"),
        ("Elmo", "caixa", (0.15, 0.15, 0.06), (0, 0, 0.765), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Ameia_1", "caixa", (0.04, 0.04, 0.04), (-0.055, -0.055, 0.81), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Ameia_2", "caixa", (0.04, 0.04, 0.04), (0.055, -0.055, 0.81), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Ameia_3", "caixa", (0.04, 0.04, 0.04), (-0.055, 0.055, 0.81), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Ameia_4", "caixa", (0.04, 0.04, 0.04), (0.055, 0.055, 0.81), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Viseira", "caixa", (0.05, 0.015, 0.015), (0, 0.068, 0.705), (0, 0, 0), "Brilho", "mixamorig:Head"),
    ],
    "n": [
        ("Crina", "caixa", (0.025, 0.15, 0.06), (0, -0.01, 0.79), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Orelha_L", "cone", (0.016, 0.0, 0.05), (-0.035, 0.025, 0.78), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Orelha_R", "cone", (0.016, 0.0, 0.05), (0.035, 0.025, 0.78), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Focinho", "caixa", (0.045, 0.06, 0.035), (0, 0.075, 0.705), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Capa", "caixa", (0.09, 0.02, 0.18), (0, -0.105, 0.5), (0.2, 0, 0), "Detalhe", MISTURA_TRONCO),
    ],
    "b": [
        ("Mitra", "cone", (0.055, 0.0, 0.26), (0, 0, 0.88), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Cajado", "cilindro", (0.011, 0.011, 0.46), (-0.11, 0.04, 0.36), (0, 0, 0), "Corpo", "mixamorig:LeftForeArm"),
        ("Orbe", "esfera", (0.032,), (-0.11, 0.04, 0.61), (0, 0, 0), "Brilho", "mixamorig:LeftForeArm"),
    ],
    "q": [
        ("Coroa", "anel", (0.052, 0.014), (0, 0, 0.765), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Ponta_1", "cone", (0.012, 0.0, 0.04), (0.045, 0, 0.795), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Ponta_2", "cone", (0.012, 0.0, 0.04), (-0.045, 0, 0.795), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Ponta_3", "cone", (0.012, 0.0, 0.04), (0, 0.045, 0.795), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Joia", "esfera", (0.02,), (0, -0.045, 0.79), (0, 0, 0), "Brilho", "mixamorig:Head"),
        ("Colar", "anel", (0.045, 0.008), (0, 0, 0.615), (0, 0, 0), "Coroa", "mixamorig:Spine2"),
        ("Capa", "caixa", (0.15, 0.025, 0.44), (0, -0.115, 0.4), (0.08, 0, 0), "Detalhe", MISTURA_TRONCO),
        ("Cetro", "cilindro", (0.009, 0.009, 0.32), (-0.11, 0.04, 0.38), (0, 0, 0), "Coroa", "mixamorig:LeftForeArm"),
        ("JoiaCetro", "esfera", (0.025,), (-0.11, 0.04, 0.55), (0, 0, 0), "Brilho", "mixamorig:LeftForeArm"),
    ],
    "k": [
        ("Coroa", "anel", (0.055, 0.016), (0, 0, 0.765), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Cruz", "caixa", (0.02, 0.02, 0.11), (0, 0, 0.84), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("BracoCruz", "caixa", (0.06, 0.02, 0.02), (0, 0, 0.86), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Capa", "caixa", (0.16, 0.025, 0.48), (0, -0.115, 0.38), (0.1, 0, 0), "Detalhe", MISTURA_TRONCO),
        ("Emblema", "caixa", (0.03, 0.012, 0.03), (0, 0.095, 0.55), (0, math.pi / 4, 0), "Brilho", "mixamorig:Spine2"),
        ("Cajado", "cilindro", (0.011, 0.011, 0.48), (-0.11, 0.04, 0.37), (0, 0, 0), "Corpo", "mixamorig:LeftForeArm"),
        ("CruzCajado", "caixa", (0.018, 0.018, 0.07), (-0.11, 0.04, 0.64), (0, 0, 0), "Coroa", "mixamorig:LeftForeArm"),
        ("BracoCruzCajado", "caixa", (0.05, 0.018, 0.018), (-0.11, 0.04, 0.65), (0, 0, 0), "Coroa", "mixamorig:LeftForeArm"),
    ],
}
# o chapéu pontudo é só do peão (as outras peças têm o próprio elmo/coroa)
CHAPEU = "Chapeu"


def log(mensagem):
    print(f"[importar_animacoes_mixamo] {mensagem}")


def material(nome):
    """Um material de cada por arquivo, compartilhado entre as peças (o jogo procura pelo nome)."""
    existente = bpy.data.materials.get(nome)
    if existente:
        return existente
    novo = bpy.data.materials.new(nome)
    novo.diffuse_color = MATERIAIS[nome]
    return novo


def criar_acessorio(nome, forma, medidas, posicao, giro, nome_material, alvo):
    """Uma peça de acessório já com o grupo do osso antigo (pra ir junto pra pose T), o grupo
    "alvo:<osso do Mixamo>" (pra prender depois) e o material."""
    if forma == "caixa":
        bpy.ops.mesh.primitive_cube_add(size=1, location=posicao, rotation=giro)
        bpy.context.object.scale = medidas
    elif forma in ("cilindro", "cone"):
        raio, raio_topo, altura = medidas
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=raio, radius2=raio_topo, depth=altura, location=posicao, rotation=giro)
    elif forma == "esfera":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=medidas[0], segments=8, ring_count=5, location=posicao, rotation=giro)
    elif forma == "anel":
        raio, espessura = medidas
        bpy.ops.mesh.primitive_torus_add(major_radius=raio, minor_radius=espessura, major_segments=12, minor_segments=6, location=posicao, rotation=giro)
    objeto = bpy.context.object
    objeto.name = nome
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    todos = list(range(len(objeto.data.vertices)))
    objeto.vertex_groups.new(name=OSSO_ANTIGO[alvo]).add(todos, 1.0, "REPLACE")
    objeto.vertex_groups.new(name=f"alvo:{alvo}").add(todos, 1.0, "REPLACE")
    objeto.data.materials.append(material(nome_material))
    return objeto


def montar_peca(tipo):
    """O corpo do peão (malha + esqueleto antigo do criar_peao_rpg.py) com os acessórios da peça."""
    malha, contagens_vertices, contagens_faces = base.criar_malha()
    malha.name = f"Peca_{tipo}"
    base.criar_grupos_de_vertice(malha, contagens_vertices)
    for nome in MATERIAIS:
        malha.data.materials.append(material(nome))
    indices = {nome: i for i, nome in enumerate(MATERIAIS)}
    inicio = 0
    for parte, quantidade in contagens_faces:
        nome_material = "Detalhe" if parte in base.PARTES_DETALHE or (parte == "Torso" and tipo in TRONCO_DETALHE) else "Corpo"
        for i in range(inicio, inicio + quantidade):
            malha.data.polygons[i].material_index = indices[nome_material]
        inicio += quantidade

    acessorios = [criar_acessorio(*definicao) for definicao in ACESSORIOS[tipo]]
    if acessorios:
        # o join mantém a malha ativa (o corpo) no começo e põe os acessórios depois — as faixas
        # de vértices do corpo continuam valendo; materiais e grupos se juntam pelo nome
        bpy.ops.object.select_all(action="DESELECT")
        for objeto in acessorios:
            objeto.select_set(True)
        malha.select_set(True)
        bpy.context.view_layer.objects.active = malha
        bpy.ops.object.join()
        bpy.ops.object.shade_flat()

    esqueleto = base.criar_esqueleto()
    base.vincular_malha_ao_esqueleto(malha, esqueleto)
    return malha, esqueleto, contagens_vertices


def peca_em_pose_t(tipo):
    """A peça na mesma pose T do arquivo que foi pro Mixamo, sem esqueleto. Devolve a malha, as
    faixas de vértices de cada parte do corpo, o alvo de cada vértice de acessório, a posição/
    orientação do antigo osso Hand_R, as juntas (ombros e quadris) em volta das quais os membros
    giraram pra pose T e a posição de cada vértice com a peça em pé (antes da pose T) — as duas
    últimas montam e conferem o "Parado"."""
    malha, esqueleto, contagens_vertices = montar_peca(tipo)
    em_pe = [malha.matrix_world @ vertice.co for vertice in malha.data.vertices]
    juntas = {nome: esqueleto.matrix_world @ esqueleto.data.bones[nome].head_local for nome in ("Arm_L", "Arm_R", "Leg_L", "Leg_R")}
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = esqueleto
    esqueleto.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    for pose_osso in esqueleto.pose.bones:
        pose_osso.rotation_mode = "XYZ"
        pose_osso.location = (0, 0, 0)
        pose_osso.rotation_euler = (0, 0, 0)
        pose_osso.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    mixamo.girar_osso_no_mundo(esqueleto, "Arm_L", mixamo.ANGULO_BRACOS)
    mixamo.girar_osso_no_mundo(esqueleto, "Arm_R", -mixamo.ANGULO_BRACOS)
    mixamo.girar_osso_no_mundo(esqueleto, "Leg_L", mixamo.ANGULO_PERNAS)
    mixamo.girar_osso_no_mundo(esqueleto, "Leg_R", -mixamo.ANGULO_PERNAS)
    mao = esqueleto.pose.bones["Hand_R"]
    matriz_mao = esqueleto.matrix_world @ mao.matrix
    hand_r = {
        "cabeca": esqueleto.matrix_world @ mao.head,
        "ponta": esqueleto.matrix_world @ mao.tail,
        "eixo_z": matriz_mao.to_3x3() @ Vector((0, 0, 1)),
    }
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = malha
    malha.select_set(True)
    for modificador in list(malha.modifiers):
        if modificador.type == "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=modificador.name)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.data.objects.remove(esqueleto, do_unlink=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    alvos = {}
    for grupo in malha.vertex_groups:
        if grupo.name.startswith("alvo:"):
            for vertice in malha.data.vertices:
                if any(g.group == grupo.index for g in vertice.groups):
                    alvos[vertice.index] = grupo.name.removeprefix("alvo:")
    malha.vertex_groups.clear()

    faixas = {}
    inicio = 0
    for nome, quantidade in contagens_vertices:
        faixas[nome] = range(inicio, inicio + quantidade)
        inicio += quantidade
    assert inicio + len(alvos) == len(malha.data.vertices), "as faixas das partes não batem com a malha"
    return malha, faixas, alvos, hand_r, juntas, em_pe


def importar_fbx(caminho):
    """Importa um FBX e devolve os objetos novos que vieram nele."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=caminho)
    return [o for o in bpy.data.objects if o not in antes]


def esqueleto_do_mixamo():
    """O esqueleto do peão riggado, de volta ao tamanho e à direção do jogo (o arquivo do Mixamo
    foi feito com o peão dobrado de tamanho e virado 180°). Devolve o esqueleto, a conversão do
    mundo do FBX pro mundo do jogo e o comprimento de cada osso no FBX (pra conferir que as
    animações são do mesmo esqueleto)."""
    novos = importar_fbx(CAMINHO_RIG)
    esqueleto = next(o for o in novos if o.type == "ARMATURE")
    for objeto in novos:
        if objeto.type == "MESH":
            bpy.data.objects.remove(objeto, do_unlink=True)
    esqueleto.animation_data_clear()
    comprimentos = {osso.name: osso.length for osso in esqueleto.data.bones}

    conversao = Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Scale(1 / mixamo.ESCALA_MIXAMO, 4)
    esqueleto.matrix_world = conversao @ esqueleto.matrix_world
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = esqueleto
    esqueleto.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    esqueleto.name = "Esqueleto"

    # confere o encaixe: braço esquerdo do Mixamo do lado esquerdo do peão (-X), pulsos na ponta
    # dos antebraços (±0,33 m) e quadril na altura da base do tronco
    pulso_esq = esqueleto.data.bones["mixamorig:LeftHand"].head_local
    pulso_dir = esqueleto.data.bones["mixamorig:RightHand"].head_local
    quadril = esqueleto.data.bones["mixamorig:Hips"].head_local
    assert pulso_esq.x < -0.3 and pulso_dir.x > 0.3, f"lados trocados: pulsos {pulso_esq}, {pulso_dir}"
    assert abs(pulso_dir.z - 0.57) < 0.03, f"pulso fora da altura do ombro: {pulso_dir}"
    assert 0.3 < quadril.z < 0.45, f"quadril fora do lugar: {quadril}"
    return esqueleto, conversao, comprimentos


def pesar_por_altura(malha, indices):
    """Tronco/capa: os vértices de baixo seguem o quadril e os de cima o peito, misturando pela
    altura — assim acompanham a coluna quando o personagem se inclina."""
    alturas = [malha.data.vertices[i].co.z for i in indices]
    baixo, alto = min(alturas), max(alturas)
    grupo_base = malha.vertex_groups[OSSO_BASE_TRONCO]
    grupo_topo = malha.vertex_groups[OSSO_TOPO_TRONCO]
    for i in indices:
        t = (malha.data.vertices[i].co.z - baixo) / (alto - baixo)
        if t < 1:
            grupo_base.add([i], 1 - t, "REPLACE")
        if t > 0:
            grupo_topo.add([i], t, "REPLACE")


def prender_malha(malha, faixas, alvos, esqueleto, tipo):
    ossos = set(OSSO_DA_PARTE.values()) | {OSSO_BASE_TRONCO, OSSO_TOPO_TRONCO} | set(alvos.values())
    for osso in sorted(ossos - {MISTURA_TRONCO}):
        malha.vertex_groups.new(name=osso)
    for parte, faixa in faixas.items():
        if parte == "Torso":
            pesar_por_altura(malha, faixa)
        else:
            malha.vertex_groups[OSSO_DA_PARTE[parte]].add(list(faixa), 1.0, "REPLACE")
    # acessórios: cada peça inteira (grupo de vértices ligados) no seu alvo
    misturados = [i for i, alvo in alvos.items() if alvo == MISTURA_TRONCO]
    if misturados:
        pesar_por_altura(malha, misturados)
    for indice, alvo in alvos.items():
        if alvo != MISTURA_TRONCO:
            malha.vertex_groups[alvo].add([indice], 1.0, "REPLACE")
    for vertice in malha.data.vertices:
        total = sum(g.weight for g in vertice.groups)
        assert abs(total - 1) < 1e-4, f"{tipo}: vértice {vertice.index} com peso total {total}"

    modificador = malha.modifiers.new(name="Armature", type="ARMATURE")
    modificador.object = esqueleto
    malha.parent = esqueleto

    if tipo != "p":
        bm = bmesh.new()
        bm.from_mesh(malha.data)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in faixas[CHAPEU]], context="VERTS")
        bm.to_mesh(malha.data)
        bm.free()
        malha.data.update()


def criar_hand_r(esqueleto, hand_r):
    """O ponto onde o jogo pendura a espada: mesma posição e orientação do antigo osso Hand_R (com
    o peão em pose T), agora filho da mão direita do Mixamo."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = esqueleto
    esqueleto.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    osso = esqueleto.data.edit_bones.new("Hand_R")
    osso.head = hand_r["cabeca"]
    osso.tail = hand_r["ponta"]
    osso.align_roll(hand_r["eixo_z"])
    osso.parent = esqueleto.data.edit_bones["mixamorig:RightHand"]
    osso.use_connect = False
    osso.use_deform = False
    bpy.ops.object.mode_set(mode="OBJECT")


def curvas(acao):
    return anim_utils.action_get_channelbag_for_slot(acao, acao.slots[0]).fcurves


def usar_acao_nova(esqueleto, acao):
    """Ação ainda vazia: o slot dela nasce no primeiro keyframe."""
    esqueleto.animation_data_create()
    esqueleto.animation_data.action = acao


def usar_acao(esqueleto, acao):
    esqueleto.animation_data_create()
    esqueleto.animation_data.action = acao
    esqueleto.animation_data.action_slot = acao.slots[0]


def pontos(esqueleto, matriz=None):
    """Mão direita e cabeça em relação ao quadril, e a altura do quadril (no mundo)."""
    matriz = Matrix() if matriz is None else matriz

    def mundo(nome):
        return matriz @ (esqueleto.matrix_world @ esqueleto.pose.bones[nome].head)

    quadril = mundo("mixamorig:Hips")
    return mundo("mixamorig:RightHand") - quadril, mundo("mixamorig:Head") - quadril, quadril.z


def carregar_animacao(nome_clipe, arquivo, esqueleto, conversao, comprimentos):
    """Passa a animação do arquivo do Mixamo pro esqueleto da peça, quadro a quadro.

    O esqueleto das animações é o mesmo do peão (ossos do mesmo tamanho), mas o Mixamo grava as
    animações sobre outra pose de descanso (pernas retas, braços nivelados) — as rotações gravadas
    são relativas a essa pose, então copiar as curvas direto entortaria o peão. Em vez disso, em
    cada quadro, cada osso recebe a orientação de verdade (no espaço do esqueleto) do osso de mesmo
    nome no arquivo, que independe da pose de descanso; o quadril recebe também a posição."""
    novos = importar_fbx(os.path.join(PASTA, arquivo))
    origem = next(o for o in novos if o.type == "ARMATURE")
    diferenca = max(abs(osso.length - comprimentos[osso.name]) for osso in origem.data.bones)
    assert diferenca < 0.05, f"{arquivo}: o esqueleto não é o do peão (ossos com até {diferenca:.2f} de diferença)"
    acao_origem = origem.animation_data.action
    inicio, fim = (int(q) for q in acao_origem.frame_range)

    acao = bpy.data.actions.new(nome_clipe)
    acao.use_fake_user = True
    usar_acao_nova(esqueleto, acao)
    ossos = [pose_osso for pose_osso in esqueleto.pose.bones if pose_osso.name in origem.pose.bones]
    for pose_osso in esqueleto.pose.bones:
        pose_osso.rotation_mode = "QUATERNION"
    # do espaço do esqueleto do arquivo pro espaço do esqueleto da peça (que já está no mundo, sem
    # transformação): o próprio objeto do arquivo (escala do FBX, Z pra cima do Blender), depois
    # giro de 180° e metade do tamanho
    para_peca = conversao @ origem.matrix_world
    anteriores = {}
    for quadro in range(inicio, fim + 1):
        bpy.context.scene.frame_set(quadro)
        posados = {}
        for pose_osso in ossos:
            posicao, giro, _ = (para_peca @ origem.pose.bones[pose_osso.name].matrix).decompose()
            posados[pose_osso.name] = Matrix.LocRotScale(posicao, giro, None)
        for pose_osso in ossos:
            descanso = pose_osso.bone.matrix_local
            pai = pose_osso.parent
            if pai is None:
                local = descanso.inverted() @ posados[pose_osso.name]
            else:
                relativo_descanso = pai.bone.matrix_local.inverted() @ descanso
                local = relativo_descanso.inverted() @ posados[pai.name].inverted() @ posados[pose_osso.name]
            giro = local.to_quaternion()
            # mesma volta, sinal do quatérnio contínuo (senão a interpolação dá a volta longa)
            if pose_osso.name in anteriores and anteriores[pose_osso.name].dot(giro) < 0:
                giro.negate()
            anteriores[pose_osso.name] = giro
            pose_osso.rotation_quaternion = giro
            pose_osso.keyframe_insert("rotation_quaternion", frame=quadro)
            # posição com chave em todos os ossos (não só no quadril): o Parado desloca ombros e
            # quadris, e um osso sem chave aqui herdaria esse deslocamento (no Blender e na mistura
            # entre clipes do Three.js) — nos outros ossos ela dá zero (mesmo comprimento de osso)
            pose_osso.location = local.translation
            pose_osso.keyframe_insert("location", frame=quadro)

    # confere quadro a quadro que a peça faz o mesmo movimento do arquivo do Mixamo
    usar_acao(esqueleto, acao)
    pior = 0.0
    for quadro in range(inicio, fim + 1, 3):
        bpy.context.scene.frame_set(quadro)
        mao_o, cabeca_o, z_o = pontos(origem, conversao)
        mao, cabeca, z = pontos(esqueleto)
        pior = max(pior, (mao - mao_o).length, (cabeca - cabeca_o).length, abs(z - z_o))
    assert pior < 0.005, f"{arquivo}: movimento diferente do original ({pior:.4f} m)"

    for objeto in novos:
        bpy.data.objects.remove(objeto, do_unlink=True)
    log(f"{nome_clipe} ← {arquivo}: quadros {inicio}-{fim}, igual ao Mixamo (diferença máx. {pior * 1000:.1f} mm)")
    return acao


def ficar_no_lugar(esqueleto, acao):
    """Tira o avanço do quadril (o Mixamo anda pra frente de verdade no walk e em alguns golpes;
    no jogo quem leva a peça é o código) — fica só o sobe-e-desce e o balanço do corpo. Só os eixos
    horizontais: o vertical do quadril (o eixo do osso que aponta pra cima) fica como está."""
    descanso = esqueleto.data.bones["mixamorig:Hips"].matrix_local
    vertical = max(range(3), key=lambda eixo: abs(descanso.col[eixo].z))
    for curva in curvas(acao):
        if curva.data_path != 'pose.bones["mixamorig:Hips"].location' or curva.array_index == vertical:
            continue
        pontos_curva = curva.keyframe_points
        q0, v0 = pontos_curva[0].co
        q1, v1 = pontos_curva[-1].co
        for ponto in pontos_curva:
            correcao = (v1 - v0) * (ponto.co.x - q0) / (q1 - q0)
            ponto.co.y -= correcao
            ponto.handle_left.y -= correcao
            ponto.handle_right.y -= correcao
    usar_acao(esqueleto, acao)
    posicoes = []
    # o golpe acelerado tem chaves em quadros fracionados: avalia exatamente no primeiro e no último
    for quadro in acao.frame_range:
        bpy.context.scene.frame_set(int(quadro), subframe=quadro - int(quadro))
        posicoes.append(esqueleto.matrix_world @ esqueleto.pose.bones["mixamorig:Hips"].head)
    deriva = (posicoes[1] - posicoes[0]).xy.length
    assert deriva < 0.005, f"{acao.name} ainda sai do lugar ({deriva:.3f} m)"


def ajustar_golpe(acao, inicio, impacto, fim):
    """Corta o golpe entre o início e o fim e muda a velocidade pro impacto cair no instante do
    impacto do jogo."""
    quadro_impacto_jogo = 1 + DURACAO_GOLPE_JOGO * INSTANTE_IMPACTO_JOGO * FPS
    escala = (quadro_impacto_jogo - 1) / (impacto - inicio)
    for curva in curvas(acao):
        pontos_curva = curva.keyframe_points
        for indice in reversed(range(len(pontos_curva))):
            quadro = pontos_curva[indice].co.x
            if quadro < inicio - 1e-3 or quadro > fim + 1e-3:
                pontos_curva.remove(pontos_curva[indice])
        for ponto in pontos_curva:
            for par in (ponto.co, ponto.handle_left, ponto.handle_right):
                par.x = 1 + (par.x - inicio) * escala
        curva.update()
    duracao = (acao.frame_range[1] - 1) / FPS
    log(f"{acao.name}: quadros {inicio}-{fim}, velocidade {1 / escala:.2f}x → {duracao:.2f} s, impacto em {(quadro_impacto_jogo - 1) / FPS:.2f} s")


def criar_parado(esqueleto, malha, juntas, em_pe):
    """Clipe "Parado": em pé normal (braços caídos, pernas retas, corpo ereto) — exatamente a pose
    original do peão. Cada membro volta da pose T girando em volta da MESMA junta do peão original
    (não da junta do Mixamo, que fica uns 3 cm pra fora — o braço sairia do ombro), então o osso
    ganha também um deslocamento além do giro. Todos os ossos têm chave (os não citados em
    VOLTA_DA_POSE_T ficam no descanso): ossos sem chave voltariam pra pose T no Three.js ao terminar
    um gesto."""
    acao = bpy.data.actions.new("Parado")
    acao.use_fake_user = True
    usar_acao_nova(esqueleto, acao)
    posados = {}
    for osso_mixamo, junta, angulo in VOLTA_DA_POSE_T:
        pivo = juntas[junta]
        giro = Matrix.Translation(pivo) @ Matrix.Rotation(angulo, 4, "Y") @ Matrix.Translation(-pivo)
        posados[osso_mixamo] = giro @ esqueleto.data.bones[osso_mixamo].matrix_local
    for pose_osso in esqueleto.pose.bones:
        pose_osso.rotation_mode = "QUATERNION"
        # pai sempre no descanso aqui (só ombros/quadris giram), então a base local é direta
        local = pose_osso.bone.matrix_local.inverted() @ posados[pose_osso.name] if pose_osso.name in posados else Matrix()
        pose_osso.rotation_quaternion = local.to_quaternion()
        pose_osso.location = local.translation
        # duas chaves iguais (1 s): clipe com duração zero dá problema no AnimationMixer do Three.js
        for quadro in (1, 1 + FPS):
            pose_osso.keyframe_insert("rotation_quaternion", frame=quadro)
            pose_osso.keyframe_insert("location", frame=quadro)

    # confere: com o Parado, cada vértice volta pro lugar em que estava no peão original em pé
    usar_acao(esqueleto, acao)
    bpy.context.scene.frame_set(1)
    avaliada = malha.evaluated_get(bpy.context.evaluated_depsgraph_get())
    pior = max((avaliada.matrix_world @ v.co - original).length for v, original in zip(avaliada.data.vertices, em_pe))
    assert pior < 0.002, f"o Parado não bate com o peão original em pé ({pior * 1000:.1f} mm)"
    log(f"Parado: em pé igual ao peão original (diferença máx. {pior * 1000:.2f} mm)")
    return acao


def mortal(tombo):
    """Chaves do mortal pra trás, quadro a quadro (30 por segundo) — cada chave dá o valor de
    alguns controles do corpo naquele quadro; entre as chaves cada controle segue uma curva suave.
    Controles (graus, ou metros no z/y):
        giro         corpo inteiro em volta do quadril (eixo X): + = pra trás; 360 = volta completa
        tronco       coluna (- = curva pra frente), cabeca (- = queixo no peito)
        cabeca_lado  cabeça balançando de lado (tontura)
        braco        os dois braços pra frente/cima (+) ou pra trás (-); cotovelo dobra o antebraço
        coxa         quadril dobrado (+ = coxa pra frente), joelho (- = dobra), pe (+ = ponta pra cima)
        plantar      1 = pés presos no chão (o quadril se ajusta sozinho); 0 = altura livre, dada por z
        z            altura do quadril acima da altura em pé (só vale quando não está plantado)
    O mortal de verdade: agacha (anticipação), estende o corpo jogando os braços pra cima
    (impulso), sobe grupado (joelhos no peito, mãos nas canelas — gira mais rápido), abre antes de
    chegar ao chão, aterrissa com os joelhos dobrados amortecendo e levanta. No tombo, gira demais:
    aterrissa inclinado pra trás, perde o equilíbrio agitando os braços, cai sentado, fica meio tonto
    e levanta."""
    chaves = {
        1: dict(giro=0, tronco=0, cabeca=0, cabeca_lado=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1, z=0),
        7: dict(tronco=-25, cabeca=10, braco=-45, cotovelo=10, coxa=65, joelho=-100, pe=30, plantar=1),
        12: dict(giro=15, tronco=8, cabeca=5, braco=165, cotovelo=5, coxa=5, joelho=-5, pe=-25, plantar=1),
        16: dict(giro=70, tronco=-10, braco=125, cotovelo=20, coxa=60, joelho=-80, pe=0),
        20: dict(giro=150, tronco=-35, cabeca=-20, braco=60, cotovelo=70, coxa=115, joelho=-140),
        25: dict(giro=250, tronco=-35, cabeca=-20, braco=60, cotovelo=70, coxa=115, joelho=-140),
        30: dict(giro=320, tronco=-15, cabeca=0, braco=90, cotovelo=20, coxa=70, joelho=-70),
    }
    # no ar o quadril faz um arco de salto (parábola) entre a saída (quadro 13) e a chegada
    saida, chegada = 13, 36
    altura_saida, altura_chegada, apice = 0.02, -0.12 if not tombo else -0.08, 0.42
    chaves[saida] = dict(plantar=0)
    for quadro in range(saida, chegada + 1, 3):
        s = (quadro - saida) / (chegada - saida)
        chaves.setdefault(quadro, {})["z"] = altura_saida + (altura_chegada - altura_saida) * s + 4 * apice * s * (1 - s)
    if not tombo:
        chaves.update(
            {
                34: dict(giro=355, tronco=-10, braco=70, cotovelo=15, coxa=35, joelho=-40, pe=10, z=-0.06, plantar=0),
                37: dict(giro=360, tronco=-25, cabeca=5, braco=45, cotovelo=10, coxa=65, joelho=-100, pe=30, plantar=1),
                42: dict(giro=360, tronco=-15, braco=30, coxa=45, joelho=-70, pe=20, plantar=1),
                50: dict(giro=360, tronco=0, cabeca=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1),
                56: dict(giro=360, tronco=0, cabeca=0, cabeca_lado=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1, z=0),
            }
        )
        return chaves
    chaves.update(
        {
            33: dict(giro=375, tronco=-5, braco=110, cotovelo=10, coxa=40, joelho=-40, pe=10, plantar=0),
            36: dict(giro=395, tronco=0, braco=140, cotovelo=20, coxa=55, joelho=-60, pe=20, plantar=1),
            # perdeu o equilíbrio: os braços agitam pra frente e o quadril cai
            40: dict(giro=405, braco=150, cotovelo=35, coxa=80, joelho=-40, pe=10, plantar=0, z=-0.2),
            # sentado no chão (tronco um pouco pra trás, pernas esticadas na horizontal: coxa =
            # 90 - inclinação), braços pra trás apoiando, cabeça chicoteia pra trás
            44: dict(giro=384, tronco=0, cabeca=25, braco=-50, cotovelo=10, coxa=68, joelho=-8, pe=0, plantar=0, z=-0.33),
            47: dict(giro=388, cabeca=10, coxa=66, z=-0.31),
            52: dict(giro=380, cabeca=-10, coxa=70, z=-0.33),
            # tontura: a cabeça balança de um lado pro outro
            56: dict(cabeca=-5, cabeca_lado=20),
            60: dict(cabeca_lado=-20),
            64: dict(cabeca_lado=15),
            68: dict(cabeca=0, cabeca_lado=0, giro=380, braco=-50, coxa=70, joelho=-8, z=-0.33, plantar=0),
            # levanta: inclina pra frente com os pés por baixo do corpo e empurra o chão
            75: dict(giro=345, tronco=-30, braco=60, cotovelo=20, coxa=125, joelho=-150, pe=35, z=-0.24, plantar=0),
            82: dict(giro=360, tronco=-25, braco=30, cotovelo=10, coxa=70, joelho=-100, pe=30, plantar=1),
            92: dict(giro=360, tronco=0, cabeca=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1),
            96: dict(giro=360, tronco=0, cabeca=0, cabeca_lado=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1, z=0),
        }
    )
    return chaves


def curva_suave(pontos, quadro):
    """Catmull-Rom entre as chaves (passa por todas, sem parar em cada uma); fora delas, constante."""
    quadros = sorted(pontos)
    if quadro <= quadros[0]:
        return pontos[quadros[0]]
    if quadro >= quadros[-1]:
        return pontos[quadros[-1]]
    i = max(k for k in range(len(quadros)) if quadros[k] <= quadro)
    q1, q2 = quadros[i], quadros[i + 1]
    q0 = quadros[i - 1] if i > 0 else q1
    q3 = quadros[i + 2] if i + 2 < len(quadros) else q2
    p0, p1, p2, p3 = pontos[q0], pontos[q1], pontos[q2], pontos[q3]
    t = (quadro - q1) / (q2 - q1)
    # tangentes com o espaçamento irregular das chaves levado em conta
    m1 = (p2 - p0) / (q2 - q0) * (q2 - q1) if q2 != q0 else 0
    m2 = (p3 - p1) / (q3 - q1) * (q2 - q1) if q3 != q1 else 0
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2


def criar_mortal(esqueleto, parado, nome, chaves):
    """Monta o clipe do mortal quadro a quadro a partir das chaves de mortal(): cada controle vira
    um giro de osso em volta de um eixo do corpo (como se o peão estivesse em pé), aplicado por cima
    da pose Parado; o quadril é posto por último — nos quadros plantados, de modo que o pé mais baixo
    fique no chão e os pés não escorreguem pra frente/trás; no ar, na altura z."""
    controles = {}
    for quadro, valores in chaves.items():
        for controle, valor in valores.items():
            controles.setdefault(controle, {})[quadro] = valor
    ultimo = max(chaves)

    usar_acao(esqueleto, parado)
    bpy.context.scene.frame_set(1)
    ossos = esqueleto.pose.bones
    base_parado = {p.name: p.matrix_basis.copy() for p in ossos}
    giro_parado = {p.name: p.matrix.to_3x3().normalized() for p in ossos}
    pes_parado = [(esqueleto.matrix_world @ ossos[n].head).copy() for n in ("mixamorig:LeftFoot", "mixamorig:RightFoot")]
    descanso_quadril = ossos["mixamorig:Hips"].bone.matrix_local
    cabeca_quadril_parado = (esqueleto.matrix_world @ ossos["mixamorig:Hips"].head).copy()

    def no_corpo(nome_osso, eixo, graus):
        """Giro em volta de um eixo do corpo em pé, convertido pro espaço do osso."""
        giro = Matrix.Rotation(math.radians(graus), 3, eixo)
        frame = giro_parado[nome_osso]
        return (frame.inverted() @ giro @ frame).to_4x4()

    acao = bpy.data.actions.new(nome)
    acao.use_fake_user = True
    usar_acao_nova(esqueleto, acao)
    anteriores = {}
    for quadro in range(1, ultimo + 1):
        v = {controle: curva_suave(pontos, quadro) for controle, pontos in controles.items()}
        extra = {
            "mixamorig:Hips": no_corpo("mixamorig:Hips", "X", v["giro"]),
            # giro + em X leva o topo pra trás (-Y): curvar pra frente (tronco/cabeça negativos) é
            # giro negativo; num membro pendurado, giro + leva a ponta pra frente
            "mixamorig:Spine": no_corpo("mixamorig:Spine", "X", v["tronco"] / 3),
            "mixamorig:Spine1": no_corpo("mixamorig:Spine1", "X", v["tronco"] / 3),
            "mixamorig:Spine2": no_corpo("mixamorig:Spine2", "X", v["tronco"] / 3),
            "mixamorig:Head": no_corpo("mixamorig:Head", "X", v["cabeca"]) @ no_corpo("mixamorig:Head", "Z", v["cabeca_lado"]),
            "mixamorig:LeftArm": no_corpo("mixamorig:LeftArm", "X", v["braco"]),
            "mixamorig:RightArm": no_corpo("mixamorig:RightArm", "X", v["braco"]),
            "mixamorig:LeftForeArm": no_corpo("mixamorig:LeftForeArm", "X", v["cotovelo"]),
            "mixamorig:RightForeArm": no_corpo("mixamorig:RightForeArm", "X", v["cotovelo"]),
            "mixamorig:LeftUpLeg": no_corpo("mixamorig:LeftUpLeg", "X", v["coxa"]),
            "mixamorig:RightUpLeg": no_corpo("mixamorig:RightUpLeg", "X", v["coxa"]),
            "mixamorig:LeftLeg": no_corpo("mixamorig:LeftLeg", "X", v["joelho"]),
            "mixamorig:RightLeg": no_corpo("mixamorig:RightLeg", "X", v["joelho"]),
            "mixamorig:LeftFoot": no_corpo("mixamorig:LeftFoot", "X", v["pe"]),
            "mixamorig:RightFoot": no_corpo("mixamorig:RightFoot", "X", v["pe"]),
        }
        for pose_osso in ossos:
            pose_osso.rotation_mode = "QUATERNION"
            pose_osso.matrix_basis = base_parado[pose_osso.name] @ extra.get(pose_osso.name, Matrix())
        quadril = ossos["mixamorig:Hips"]
        quadril.location = base_parado["mixamorig:Hips"].translation
        bpy.context.view_layer.update()

        # onde o quadril tem que ficar: plantado (pé mais baixo no chão, pés no lugar) ou no ar
        atual = esqueleto.matrix_world @ quadril.head
        pes = [esqueleto.matrix_world @ ossos[n].head for n in ("mixamorig:LeftFoot", "mixamorig:RightFoot")]
        baixo = min(pes, key=lambda p: p.z)
        alvo_plantado = atual + Vector((0, (pes_parado[0].y - (pes[0].y + pes[1].y) / 2), pes_parado[0].z - baixo.z))
        alvo_livre = cabeca_quadril_parado + Vector((0, 0, v["z"]))
        peso = min(1.0, max(0.0, v["plantar"]))
        alvo = alvo_plantado * peso + alvo_livre * (1 - peso)
        quadril.location = base_parado["mixamorig:Hips"].translation + descanso_quadril.to_3x3().inverted() @ (alvo - atual)

        for pose_osso in ossos:
            giro = pose_osso.rotation_quaternion.copy()
            if pose_osso.name in anteriores and anteriores[pose_osso.name].dot(giro) < 0:
                giro.negate()
                pose_osso.rotation_quaternion = giro
            anteriores[pose_osso.name] = giro
            pose_osso.keyframe_insert("rotation_quaternion", frame=quadro)
            pose_osso.keyframe_insert("location", frame=quadro)
    log(f"{nome}: {ultimo} quadros ({(ultimo - 1) / FPS:.1f} s)")
    return acao


def clipes_da_peca(acoes, tipo):
    """Nome do clipe no jogo → ação: os comuns e os golpes desta peça (Attack1, Attack2…)."""
    clipes = {nome: acoes[nome] for nome in ("Parado", "Mortal", "MortalTombo", *ANIMACOES)}
    for numero in range(1, len(GOLPES[tipo]) + 1):
        clipes[f"Attack{numero}"] = acoes[f"Attack_{tipo}{numero}"]
    return clipes


def renderizar_conferencia(pecas, esqueleto, acoes):
    """Cada peça de frente: em pé (Parado) e no impacto do primeiro golpe dela."""
    cena = bpy.context.scene
    cena.render.engine = "BLENDER_WORKBENCH"
    cena.display.shading.light = "STUDIO"
    cena.display.shading.color_type = "MATERIAL"
    cena.render.resolution_x = 260
    cena.render.resolution_y = 380
    cena.world = cena.world or bpy.data.worlds.new("Mundo")
    camera_dados = bpy.data.cameras.new("CameraConferencia")
    camera_dados.type = "ORTHO"
    camera_dados.ortho_scale = 1.35
    camera = bpy.data.objects.new("CameraConferencia", camera_dados)
    cena.collection.objects.link(camera)
    cena.camera = camera
    # a peça olha pra +Y aqui (antes do giro final): a câmera fica em +Y olhando pra ela, de leve
    # de lado pra mostrar volume
    camera.location = (1.2, 4, 0.5)
    camera.rotation_euler = (math.radians(90), 0, math.radians(180 - 16.7))

    quadro_impacto = round(1 + DURACAO_GOLPE_JOGO * INSTANTE_IMPACTO_JOGO * FPS)
    imagens = []
    for quadro_nome, quadro in (("Parado", 1), (None, quadro_impacto)):
        for tipo, malha in pecas.items():
            for outra in pecas.values():
                outra.hide_render = outra is not malha
            usar_acao(esqueleto, acoes[quadro_nome or f"Attack_{tipo}1"])
            cena.frame_set(quadro)
            caminho = os.path.join(PASTA, f"_conferencia_{tipo}_{quadro}.png")
            cena.render.filepath = caminho
            bpy.ops.render.render(write_still=True)
            imagens.append(caminho)
    for malha in pecas.values():
        malha.hide_render = False

    juntar_imagens(imagens, len(pecas), CAMINHO_PNG)

    # o mortal e o tombo do peão, de lado, quadro a quadro (uma linha cada)
    for malha in pecas.values():
        malha.hide_render = malha is not pecas["p"]
    camera.location = (4, 0, 0.45)
    camera.rotation_euler = (math.radians(90), 0, math.radians(90))
    camera_dados.ortho_scale = 1.6
    cena.render.resolution_x = 200
    imagens = []
    for nome, quadros in QUADROS_CONFERENCIA_MORTAL.items():
        usar_acao(esqueleto, acoes[nome])
        for quadro in quadros:
            cena.frame_set(quadro)
            caminho = os.path.join(PASTA, f"_conferencia_{nome}_{quadro}.png")
            cena.render.filepath = caminho
            bpy.ops.render.render(write_still=True)
            imagens.append(caminho)
    juntar_imagens(imagens, max(len(q) for q in QUADROS_CONFERENCIA_MORTAL.values()), CAMINHO_PNG_MORTAL)
    for malha in pecas.values():
        malha.hide_render = False
    esqueleto.animation_data.action = None


QUADROS_CONFERENCIA_MORTAL = {
    "Mortal": (1, 7, 12, 16, 20, 25, 30, 34, 37, 42, 50),
    "MortalTombo": (30, 33, 36, 40, 44, 52, 60, 68, 75, 82, 92),
}


def juntar_imagens(imagens, colunas, destino_final):
    """Junta as imagens numa grade (na ordem, linha a linha, a primeira linha em cima) e apaga as soltas."""
    carregadas = [bpy.data.images.load(c) for c in imagens]
    w, h = carregadas[0].size
    linhas = math.ceil(len(carregadas) / colunas)
    final = bpy.data.images.new("Conferencia", width=w * colunas, height=h * linhas)
    pixels = [0.2, 0.2, 0.2, 1.0] * (w * colunas * h * linhas)
    for n, imagem in enumerate(carregadas):
        linha, coluna = divmod(n, colunas)
        linha = linhas - 1 - linha  # a imagem do Blender começa embaixo
        origem = list(imagem.pixels)
        for y in range(h):
            destino = ((linha * h + y) * w * colunas + coluna * w) * 4
            pixels[destino : destino + w * 4] = origem[y * w * 4 : (y + 1) * w * 4]
    final.pixels = pixels
    final.filepath_raw = destino_final
    final.file_format = "PNG"
    final.save()
    for caminho in imagens:
        os.remove(caminho)


def exportar(esqueleto, malha, clipes, caminho):
    """Só esta peça e o esqueleto, com uma trilha NLA por clipe — o exportador glTF transforma cada
    trilha num clipe com o nome dela."""
    dados = esqueleto.animation_data
    for trilha in list(dados.nla_tracks):
        dados.nla_tracks.remove(trilha)
    dados.action = None
    for nome, acao in clipes.items():
        trilha = dados.nla_tracks.new()
        trilha.name = nome
        faixa = trilha.strips.new(nome, 1, acao)
        faixa.action_slot = acao.slots[0]
    bpy.ops.object.select_all(action="DESELECT")
    esqueleto.select_set(True)
    malha.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=caminho,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_apply=True,
    )


def ler_json_glb(caminho):
    with open(caminho, "rb") as arquivo:
        dados = arquivo.read()
    tamanho = struct.unpack("<I", dados[12:16])[0]
    return json.loads(dados[20 : 20 + tamanho])


def conferir_glb(caminho, clipes_esperados):
    """Confere no próprio arquivo o que o jogo usa: os clipes, o osso Hand_R, os materiais e a
    frente da peça (+Z no Three.js: a mão direita fica em -X)."""
    gltf = ler_json_glb(caminho)
    clipes = sorted(animacao["name"] for animacao in gltf.get("animations", []))
    assert clipes == sorted(clipes_esperados), f"{os.path.basename(caminho)}: clipes {clipes}, esperava {sorted(clipes_esperados)}"
    nos = {no.get("name"): no for no in gltf["nodes"]}
    assert "Hand_R" in nos, f"{os.path.basename(caminho)} ficou sem o osso Hand_R"
    materiais = sorted(m["name"] for m in gltf.get("materials", []))
    assert set(materiais) <= set(MATERIAIS), f"materiais inesperados: {materiais}"

    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=caminho)
    esqueleto = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    mao_direita = esqueleto.matrix_world @ esqueleto.data.bones["mixamorig:RightHand"].head_local
    assert mao_direita.x < 0, f"{os.path.basename(caminho)} não está olhando pra +Z do Three.js"
    log(f"{os.path.basename(caminho)} conferido: clipes {clipes}, materiais {materiais}")


def main():
    if not bpy.app.background:
        raise SystemExit(
            "Rode este script pelo terminal, sem abrir a interface:\n"
            "    blender --background --python scripts/blender/importar_animacoes_mixamo.py\n"
            "(dentro da interface ele apagaria a cena que estiver aberta)"
        )
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.context.scene.render.fps = FPS

    # o peão primeiro: dele saem a posição do Hand_R, as juntas e a conferência do Parado
    malha_peao, faixas, alvos, hand_r, juntas, em_pe = peca_em_pose_t("p")
    esqueleto, conversao, comprimentos = esqueleto_do_mixamo()
    prender_malha(malha_peao, faixas, alvos, esqueleto, "p")
    criar_hand_r(esqueleto, hand_r)
    pecas = {"p": malha_peao}
    for tipo in PECAS:
        if tipo != "p":
            malha, faixas, alvos, *_ = peca_em_pose_t(tipo)
            prender_malha(malha, faixas, alvos, esqueleto, tipo)
            pecas[tipo] = malha

    acoes = {"Parado": criar_parado(esqueleto, malha_peao, juntas, em_pe)}
    acoes["Mortal"] = criar_mortal(esqueleto, acoes["Parado"], "Mortal", mortal(tombo=False))
    acoes["MortalTombo"] = criar_mortal(esqueleto, acoes["Parado"], "MortalTombo", mortal(tombo=True))
    for nome_clipe, arquivo in ANIMACOES.items():
        acoes[nome_clipe] = carregar_animacao(nome_clipe, arquivo, esqueleto, conversao, comprimentos)
    ficar_no_lugar(esqueleto, acoes["Walk"])
    usados = set()
    for tipo, golpes in GOLPES.items():
        for numero, (arquivo, inicio, impacto, fim, anda) in enumerate(golpes, start=1):
            assert arquivo not in usados, f"o golpe {arquivo} está em mais de uma peça"
            usados.add(arquivo)
            acao = carregar_animacao(f"Attack_{tipo}{numero}", arquivo, esqueleto, conversao, comprimentos)
            ajustar_golpe(acao, inicio, impacto, fim)
            if anda:
                ficar_no_lugar(esqueleto, acao)
            acoes[acao.name] = acao
    renderizar_conferencia(pecas, esqueleto, acoes)

    # as peças foram montadas olhando pra +Y do Blender, que vira -Z no Three.js; todas as peças do
    # tabuleiro são desenhadas olhando pra +Z (as brancas giram 180° pra encarar as pretas, e o
    # giro do ataque também conta com isso) — então o esqueleto inteiro gira 180°
    esqueleto.rotation_euler.z = math.pi
    exportados = {}
    for tipo, arquivo in PECAS.items():
        caminho = os.path.normpath(os.path.join(PASTA_MODELOS, arquivo))
        clipes = clipes_da_peca(acoes, tipo)
        exportar(esqueleto, pecas[tipo], clipes, caminho)
        exportados[caminho] = list(clipes)
        log(f"{arquivo} salvo ({len(pecas[tipo].data.vertices)} vértices, {len(clipes)} clipes)")
    log(f"imagem de conferência: {CAMINHO_PNG}")
    for caminho, clipes in exportados.items():
        conferir_glb(caminho, clipes)


main()
