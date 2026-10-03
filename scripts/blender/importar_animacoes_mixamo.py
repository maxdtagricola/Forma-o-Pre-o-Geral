"""
Traz pro jogo o esqueleto e as animações que vieram do Mixamo, no peão original.

O peão foi riggado no Mixamo a partir da versão gerada pelo exportar_peao_mixamo.py (pose T, sem
chapéu nem bainha, remalhada numa peça só, em tamanho de gente). Do Mixamo vêm:
    peao_rpgrtp.fbx                    — o peão riggado (esqueleto "mixamorig", 25 ossos)
    sword and shield <nome>.fbx         — as animações (só esqueleto, sem malha)

O que este script faz: monta o peão ORIGINAL do jogo (com chapéu e bainha, a mesma malha de baixo
polígono do criar_peao_rpg.py) na mesma pose T, encaixa nele o esqueleto do Mixamo (de volta ao
tamanho e à direção do jogo), prende cada peça no osso correspondente e grava as animações
escolhidas com os nomes que o jogo usa (Idle, Walk, Attack — ver ChessBoard3D.tsx). Também cria o
osso "Hand_R" (filho da mão direita do Mixamo) com a mesma orientação do antigo, onde o jogo
pendura a espada no golpe.

Roda sem abrir a interface:
    blender --background --python scripts/blender/importar_animacoes_mixamo.py

Grava public/models/peao_rpg.glb (o modelo do jogo) e uma imagem de conferência,
peao_rpg_jogo.png, nesta pasta.
"""

import math
import os
import sys

import bpy
from bpy_extras import anim_utils
from mathutils import Matrix, Vector

PASTA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PASTA)
sys.dont_write_bytecode = True  # sem pasta __pycache__ no projeto
import exportar_peao_mixamo as mixamo  # noqa: E402 — só as funções (o main() de lá não roda ao importar)

CAMINHO_RIG = os.path.join(PASTA, "peao_rpgrtp.fbx")
CAMINHO_GLB = os.path.join(PASTA, "..", "..", "public", "models", "peao_rpg.glb")
CAMINHO_PNG = os.path.join(PASTA, "peao_rpg_jogo.png")

# clipe do jogo → arquivo do Mixamo
ANIMACOES = {
    "Idle": "sword and shield idle.fbx",
    "Walk": "sword and shield walk.fbx",
    "Attack": "sword and shield slash.fbx",
}
FPS = 30  # o Mixamo exporta a 30 quadros por segundo

# o golpe do jogo (animarAtaqueEspada em ChessBoard3D.tsx) dura DURACAO_ATAQUE_MS = 520 ms, com o
# impacto em INSTANTE_IMPACTO = 0,55 dele (~0,29 s) — e a espada some da mão no fim. O "slash" do
# Mixamo é mais lento (1,5 s): ergue a espada até o quadro 12, acerta no 19 (mão mais rápida) e
# termina o corte no 34; depois só volta à postura, o que o jogo já faz misturando com o Idle. Então
# o clipe é cortado no quadro 34 e acelerado pro quadro 19 cair no instante do impacto.
DURACAO_GOLPE_JOGO = 0.52
INSTANTE_IMPACTO_JOGO = 0.55
QUADRO_IMPACTO_GOLPE = 19
QUADRO_FIM_GOLPE = 34

# peça do peão (criar_peao_rpg.py) → osso do Mixamo; peso 100% rígido, igual ao peão antigo. O
# tronco é o único dividido (ver pesar_tronco): a base segue o quadril e o topo, o peito.
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


def log(mensagem):
    print(f"[importar_animacoes_mixamo] {mensagem}")


def peao_em_pose_t():
    """O peão original na mesma pose T do arquivo que foi pro Mixamo, sem esqueleto. Devolve a
    malha, as faixas de vértices de cada peça e a posição/orientação do antigo osso Hand_R."""
    malha, esqueleto, contagens_vertices = mixamo.montar_peao()
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
    malha.vertex_groups.clear()

    faixas = {}
    inicio = 0
    for nome, quantidade in contagens_vertices:
        faixas[nome] = range(inicio, inicio + quantidade)
        inicio += quantidade
    assert inicio == len(malha.data.vertices), "as faixas das peças não batem com a malha"
    return malha, faixas, hand_r


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


def pesar_tronco(malha, faixa):
    """Tronco: os vértices de baixo seguem o quadril e os de cima o peito, misturando pela altura —
    assim ele acompanha a coluna quando o personagem se inclina."""
    alturas = [malha.data.vertices[i].co.z for i in faixa]
    baixo, alto = min(alturas), max(alturas)
    grupo_base = malha.vertex_groups[OSSO_BASE_TRONCO]
    grupo_topo = malha.vertex_groups[OSSO_TOPO_TRONCO]
    for i in faixa:
        t = (malha.data.vertices[i].co.z - baixo) / (alto - baixo)
        if t < 1:
            grupo_base.add([i], 1 - t, "REPLACE")
        if t > 0:
            grupo_topo.add([i], t, "REPLACE")


def prender_malha(malha, faixas, esqueleto):
    for osso in sorted(set(OSSO_DA_PARTE.values()) | {OSSO_BASE_TRONCO, OSSO_TOPO_TRONCO}):
        malha.vertex_groups.new(name=osso)
    for parte, faixa in faixas.items():
        if parte == "Torso":
            pesar_tronco(malha, faixa)
        else:
            malha.vertex_groups[OSSO_DA_PARTE[parte]].add(list(faixa), 1.0, "REPLACE")
    for vertice in malha.data.vertices:
        total = sum(g.weight for g in vertice.groups)
        assert abs(total - 1) < 1e-4, f"vértice {vertice.index} com peso total {total}"

    modificador = malha.modifiers.new(name="Armature", type="ARMATURE")
    modificador.object = esqueleto
    malha.parent = esqueleto


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
    """Passa a animação do arquivo do Mixamo pro esqueleto do peão, quadro a quadro.

    O esqueleto das animações é o mesmo do peão (ossos do mesmo tamanho), mas o Mixamo grava as
    animações sobre outra pose de descanso (pernas retas, braços nivelados) — as rotações gravadas
    são relativas a essa pose, então copiar as curvas direto entortaria o peão. Em vez disso, em
    cada quadro, cada osso do peão recebe a orientação de verdade (no espaço do esqueleto) do osso
    de mesmo nome no arquivo, que independe da pose de descanso; o quadril recebe também a
    posição."""
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
    # do espaço do esqueleto do arquivo pro espaço do esqueleto do peão (que já está no mundo, sem
    # transformação): o próprio objeto do arquivo (escala do FBX, Z pra cima do Blender), depois
    # giro de 180° e metade do tamanho
    para_peao = conversao @ origem.matrix_world
    anteriores = {}
    for quadro in range(inicio, fim + 1):
        bpy.context.scene.frame_set(quadro)
        posados = {}
        for pose_osso in ossos:
            posicao, giro, _ = (para_peao @ origem.pose.bones[pose_osso.name].matrix).decompose()
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
            if pai is None:
                pose_osso.location = local.translation
                pose_osso.keyframe_insert("location", frame=quadro)

    # confere quadro a quadro que o peão faz o mesmo movimento do arquivo do Mixamo
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


def andar_no_lugar(esqueleto, acao):
    """O 'walk' do Mixamo anda pra frente de verdade; no jogo quem leva a peça de casa em casa é o
    código, então o quadril perde o avanço (fica só o sobe-e-desce e o balanço do passo)."""
    for curva in curvas(acao):
        if curva.data_path != 'pose.bones["mixamorig:Hips"].location':
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
    inicio, fim = (int(q) for q in acao.frame_range)
    posicoes = []
    for quadro in (inicio, fim):
        bpy.context.scene.frame_set(quadro)
        posicoes.append(esqueleto.matrix_world @ esqueleto.pose.bones["mixamorig:Hips"].head)
    deriva = (posicoes[1] - posicoes[0]).xy.length
    assert deriva < 0.005, f"o Walk ainda sai do lugar ({deriva:.3f} m por ciclo)"


def ajustar_golpe(acao):
    """Corta o 'slash' no fim do corte e acelera pro impacto cair no instante do jogo."""
    quadro_impacto_jogo = 1 + DURACAO_GOLPE_JOGO * INSTANTE_IMPACTO_JOGO * FPS
    escala = (quadro_impacto_jogo - 1) / (QUADRO_IMPACTO_GOLPE - 1)
    for curva in curvas(acao):
        pontos_curva = curva.keyframe_points
        for indice in reversed(range(len(pontos_curva))):
            if pontos_curva[indice].co.x > QUADRO_FIM_GOLPE + 1e-3:
                pontos_curva.remove(pontos_curva[indice])
        for ponto in pontos_curva:
            for par in (ponto.co, ponto.handle_left, ponto.handle_right):
                par.x = 1 + (par.x - 1) * escala
        curva.update()
    duracao = (acao.frame_range[1] - 1) / FPS
    log(f"Attack: cortado no quadro {QUADRO_FIM_GOLPE} e acelerado {1 / escala:.2f}x → {duracao:.2f} s, impacto em {(quadro_impacto_jogo - 1) / FPS:.2f} s")


def guardar_como_clipe(esqueleto, acao):
    """Uma trilha NLA por clipe — o exportador glTF transforma cada trilha num clipe com o nome dela."""
    trilha = esqueleto.animation_data.nla_tracks.new()
    trilha.name = acao.name
    faixa = trilha.strips.new(acao.name, 1, acao)
    faixa.action_slot = acao.slots[0]


def renderizar_conferencia(malha, esqueleto, acoes):
    """Três quadros (parado, meio do passo, impacto do golpe), vistos de frente e de lado."""
    cena = bpy.context.scene
    cena.render.engine = "BLENDER_WORKBENCH"
    cena.display.shading.light = "STUDIO"
    cena.display.shading.color_type = "MATERIAL"
    cena.render.resolution_x = 300
    cena.render.resolution_y = 380
    cena.world = cena.world or bpy.data.worlds.new("Mundo")
    camera_dados = bpy.data.cameras.new("CameraConferencia")
    camera_dados.type = "ORTHO"
    camera_dados.ortho_scale = 1.3
    camera = bpy.data.objects.new("CameraConferencia", camera_dados)
    cena.collection.objects.link(camera)
    cena.camera = camera

    quadros = (
        ("Idle", 1),
        ("Walk", 10),
        ("Attack", round(1 + DURACAO_GOLPE_JOGO * INSTANTE_IMPACTO_JOGO * FPS)),
    )
    imagens = []
    for nome, quadro in quadros:
        usar_acao(esqueleto, acoes[nome])
        cena.frame_set(quadro)
        for vista, posicao, rotacao in (
            # o peão olha pra +Y: a vista de frente fica do lado +Y olhando pra ele
            ("frente", (0, 4, 0.45), (math.radians(90), 0, math.radians(180))),
            ("lado", (4, 0, 0.45), (math.radians(90), 0, math.radians(90))),
        ):
            camera.location = posicao
            camera.rotation_euler = rotacao
            caminho = os.path.join(PASTA, f"_conferencia_{nome}_{vista}.png")
            cena.render.filepath = caminho
            bpy.ops.render.render(write_still=True)
            imagens.append(caminho)

    carregadas = [bpy.data.images.load(c) for c in imagens]
    w, h = carregadas[0].size
    final = bpy.data.images.new("Conferencia", width=w * len(carregadas), height=h)
    pixels = [0.0] * (w * len(carregadas) * h * 4)
    for n, imagem in enumerate(carregadas):
        origem = list(imagem.pixels)
        for y in range(h):
            destino = (y * w * len(carregadas) + n * w) * 4
            pixels[destino : destino + w * 4] = origem[y * w * 4 : (y + 1) * w * 4]
    final.pixels = pixels
    final.filepath_raw = CAMINHO_PNG
    final.file_format = "PNG"
    final.save()
    for caminho in imagens:
        os.remove(caminho)
    esqueleto.animation_data.action = None


def conferir_glb():
    """Reabre o .glb e confere o que o jogo usa: clipes Idle/Walk/Attack, osso Hand_R e os dois
    materiais (Corpo/Detalhe)."""
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=CAMINHO_GLB)
    esqueleto = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    assert "Hand_R" in esqueleto.data.bones, "o .glb ficou sem o osso Hand_R"
    materiais = {m.name for o in bpy.context.scene.objects if o.type == "MESH" for m in o.data.materials if m}
    assert {"Corpo", "Detalhe"} <= materiais, f"materiais no .glb: {materiais}"
    clipes = {a.name.split("_")[0]: round((a.frame_range[1] - a.frame_range[0]) / bpy.context.scene.render.fps, 2) for a in bpy.data.actions}
    log(f".glb conferido: {len(esqueleto.data.bones)} ossos (com Hand_R), materiais {sorted(materiais)}, clipes {clipes}")


def main():
    if not bpy.app.background:
        raise SystemExit(
            "Rode este script pelo terminal, sem abrir a interface:\n"
            "    blender --background --python scripts/blender/importar_animacoes_mixamo.py\n"
            "(dentro da interface ele apagaria a cena que estiver aberta)"
        )
    malha, faixas, hand_r = peao_em_pose_t()
    esqueleto, conversao, comprimentos = esqueleto_do_mixamo()
    prender_malha(malha, faixas, esqueleto)
    criar_hand_r(esqueleto, hand_r)

    bpy.context.scene.render.fps = FPS
    acoes = {}
    for nome_clipe, arquivo in ANIMACOES.items():
        acoes[nome_clipe] = carregar_animacao(nome_clipe, arquivo, esqueleto, conversao, comprimentos)
    andar_no_lugar(esqueleto, acoes["Walk"])
    ajustar_golpe(acoes["Attack"])
    renderizar_conferencia(malha, esqueleto, acoes)
    for acao in acoes.values():
        guardar_como_clipe(esqueleto, acao)
    esqueleto.animation_data.action = None

    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=CAMINHO_GLB,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_apply=True,
    )
    log(f"modelo do jogo salvo em: {os.path.normpath(CAMINHO_GLB)}")
    log(f"imagem de conferência: {CAMINHO_PNG}")
    conferir_glb()


main()
