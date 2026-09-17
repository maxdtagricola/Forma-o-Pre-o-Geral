"""
Cria o primeiro personagem-teste da pipeline RPG (Blender -> glTF -> Three.js): um peão simples,
com esqueleto (armature) de verdade e duas animações (Idle e Attack), exportado como .glb.

Roda sem abrir a interface gráfica:
    blender --background --python scripts/blender/criar_peao_rpg.py

Escopo proposital de "primeiro passo": malha simples (cilindros/esferas unidos, no mesmo espírito
geométrico das peças atuais do tabuleiro), esqueleto de 7 ossos, peso 100% rígido por parte (sem
mistura entre ossos vizinhos, pra não depender de pintura de peso visual que eu não consigo
conferir por aqui) — o objetivo é provar a pipeline inteira funcionando de ponta a ponta, não
entregar a arte final. Refinar a malha/rig depois é um trabalho pra fazer na interface do Blender.
"""

import math
import os

import bpy

CAMINHO_SAIDA = os.path.join(os.path.dirname(__file__), "..", "..", "public", "models", "peao_rpg.glb")
CAMINHO_BLEND = os.path.join(os.path.dirname(__file__), "peao_rpg.blend")


def limpar_cena():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for colecao in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials):
        for item in list(colecao):
            colecao.remove(item)


def criar_malha():
    """Monta o corpo com primitivas simples e junta tudo num mesh só, marcando de qual "parte"
    cada pedaço é (pra depois virar grupo de vértice/osso). Silhueta "robusta" de guerreiro: torso
    em leque (mais largo no ombro que na cintura), ombreiras, membros bem mais grossos e botas —
    contraste de cabeça pequena com corpo largo, o clássico visual "heroico" de RPG."""
    partes = []

    def add_parte(nome, criar_fn, **kwargs):
        criar_fn(**kwargs)
        obj = bpy.context.object
        obj.name = nome
        partes.append(obj)
        return obj

    # torso em leque: radius2 (topo/ombro) bem maior que radius1 (base/cintura)
    add_parte(
        "Torso",
        bpy.ops.mesh.primitive_cone_add,
        radius1=0.145,
        radius2=0.215,
        depth=0.52,
        location=(0, 0, 0.8),
    )
    add_parte("Cabeca", bpy.ops.mesh.primitive_uv_sphere_add, radius=0.15, location=(0, 0, 1.22), segments=16, ring_count=10)
    add_parte("Chapeu", bpy.ops.mesh.primitive_cone_add, radius1=0.095, depth=0.19, location=(0, 0, 1.45))
    # ombreiras — bulto extra por cima do encontro braço/torso, mapeadas pro osso do braço
    add_parte("Ombro_L", bpy.ops.mesh.primitive_uv_sphere_add, radius=0.09, location=(-0.235, 0, 1.0), segments=12, ring_count=8)
    add_parte("Ombro_R", bpy.ops.mesh.primitive_uv_sphere_add, radius=0.09, location=(0.235, 0, 1.0), segments=12, ring_count=8)
    add_parte("Braco_L", bpy.ops.mesh.primitive_cylinder_add, radius=0.062, depth=0.4, location=(-0.235, 0, 0.78))
    add_parte("Braco_R", bpy.ops.mesh.primitive_cylinder_add, radius=0.062, depth=0.4, location=(0.235, 0, 0.78))
    add_parte("Perna_L", bpy.ops.mesh.primitive_cylinder_add, radius=0.078, depth=0.56, location=(-0.09, 0, 0.32))
    add_parte("Perna_R", bpy.ops.mesh.primitive_cylinder_add, radius=0.078, depth=0.56, location=(0.09, 0, 0.32))
    # botas — cilindro curto e mais largo que a perna, na base
    add_parte("Bota_L", bpy.ops.mesh.primitive_cylinder_add, radius=0.095, depth=0.14, location=(-0.09, 0, 0.05))
    add_parte("Bota_R", bpy.ops.mesh.primitive_cylinder_add, radius=0.095, depth=0.14, location=(0.09, 0, 0.05))

    # guarda quais vértices (por índice local, antes do join) pertencem a cada parte —
    # usado depois do join pra criar os grupos de vértice por osso
    contagens = [(obj.name, len(obj.data.vertices)) for obj in partes]

    bpy.ops.object.select_all(action="DESELECT")
    for obj in partes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = partes[0]
    bpy.ops.object.join()
    personagem = bpy.context.object
    personagem.name = "PeaoRPG"
    bpy.ops.object.shade_smooth()

    return personagem, contagens


MAPA_PARTE_PARA_OSSO = {
    "Torso": "Spine",
    "Cabeca": "Head",
    "Chapeu": "Head",
    "Ombro_L": "Arm_L",
    "Ombro_R": "Arm_R",
    "Braco_L": "Arm_L",
    "Braco_R": "Arm_R",
    "Perna_L": "Leg_L",
    "Perna_R": "Leg_R",
    "Bota_L": "Leg_L",
    "Bota_R": "Leg_R",
}


def criar_grupos_de_vertice(personagem, contagens):
    """Peso 100% rígido por parte — cada vértice pertence inteiramente a um osso só, sem mistura.
    Como as partes foram unidas na ordem de `contagens`, dá pra recuperar os índices originais
    simplesmente somando as contagens anteriores (join preserva a ordem dos vértices)."""
    nomes_osso = sorted(set(MAPA_PARTE_PARA_OSSO.values()))
    grupos = {nome: personagem.vertex_groups.new(name=nome) for nome in nomes_osso}

    indice_atual = 0
    for nome_parte, qtd_vertices in contagens:
        osso = MAPA_PARTE_PARA_OSSO[nome_parte]
        indices = list(range(indice_atual, indice_atual + qtd_vertices))
        grupos[osso].add(indices, 1.0, "REPLACE")
        indice_atual += qtd_vertices


def criar_esqueleto():
    bpy.ops.object.armature_add(location=(0, 0, 0))
    armature_obj = bpy.context.object
    armature_obj.name = "Esqueleto"
    dados = armature_obj.data
    dados.name = "EsqueletoDados"

    bpy.ops.object.mode_set(mode="EDIT")
    ossos = dados.edit_bones
    # remove o osso padrão criado pelo armature_add
    for osso in list(ossos):
        ossos.remove(osso)

    def novo_osso(nome, cabeca, cauda, pai=None):
        osso = ossos.new(nome)
        osso.head = cabeca
        osso.tail = cauda
        if pai:
            osso.parent = ossos[pai]
            osso.use_connect = False
        return osso

    novo_osso("Root", (0, 0, 0), (0, 0, 0.15))
    novo_osso("Spine", (0, 0, 0.15), (0, 0, 1.0), pai="Root")
    novo_osso("Head", (0, 0, 1.0), (0, 0, 1.5), pai="Spine")
    novo_osso("Arm_L", (-0.235, 0, 1.0), (-0.235, 0, 0.58), pai="Spine")
    novo_osso("Arm_R", (0.235, 0, 1.0), (0.235, 0, 0.58), pai="Spine")
    novo_osso("Leg_L", (-0.09, 0, 0.6), (-0.09, 0, 0.0), pai="Root")
    novo_osso("Leg_R", (0.09, 0, 0.6), (0.09, 0, 0.0), pai="Root")

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature_obj


def vincular_malha_ao_esqueleto(personagem, armature_obj):
    modificador = personagem.modifiers.new(name="Armature", type="ARMATURE")
    modificador.object = armature_obj
    personagem.parent = armature_obj


def criar_animacao(armature_obj, nome, quadros_por_osso, fps_total):
    """`quadros_por_osso`: {osso: [(frame, (rx,ry,rz)), ...]} em radianos."""
    acao = bpy.data.actions.new(name=nome)
    acao.use_fake_user = True
    if armature_obj.animation_data is None:
        armature_obj.animation_data_create()
    armature_obj.animation_data.action = acao

    bpy.ops.object.mode_set(mode="POSE")
    for pose_osso in armature_obj.pose.bones:
        pose_osso.rotation_mode = "XYZ"

    for osso, quadros in quadros_por_osso.items():
        pose_osso = armature_obj.pose.bones[osso]
        for frame, rot in quadros:
            pose_osso.rotation_euler = rot
            pose_osso.keyframe_insert(data_path="rotation_euler", frame=frame)

    bpy.ops.object.mode_set(mode="OBJECT")

    # empurra a ação pra uma trilha NLA — sem isso, o exportador glTF só pega a ação ativa no
    # final do script (a última criada), e as outras não viram clipe nenhum no arquivo exportado
    if armature_obj.animation_data.nla_tracks.get(nome) is None:
        trilha = armature_obj.animation_data.nla_tracks.new()
        trilha.name = nome
        trilha.strips.new(nome, int(quadros_por_osso[list(quadros_por_osso)[0]][0][0]), acao)
    armature_obj.animation_data.action = None
    return acao


def main():
    limpar_cena()
    personagem, contagens = criar_malha()
    criar_grupos_de_vertice(personagem, contagens)
    armature_obj = criar_esqueleto()
    vincular_malha_ao_esqueleto(personagem, armature_obj)

    # material único, trocado por cor via código no Three.js (branco/preto por facção) —
    # cinza neutro aqui só pra não ficar preto-puro sem luz nenhuma
    material = bpy.data.materials.new("Corpo")
    material.diffuse_color = (0.75, 0.75, 0.78, 1.0)
    personagem.data.materials.append(material)

    # Idle: balanço sutil de respiração nos braços e leve inclinação da cabeça, em loop (quadro 1 e
    # o último precisam ser idênticos pra não dar um "pulo" quando o loop reinicia)
    criar_animacao(
        armature_obj,
        "Idle",
        {
            "Arm_L": [(1, (0.05, 0, 0)), (30, (-0.05, 0, 0)), (60, (0.05, 0, 0))],
            "Arm_R": [(1, (-0.05, 0, 0)), (30, (0.05, 0, 0)), (60, (-0.05, 0, 0))],
            "Head": [(1, (0, 0, 0)), (30, (0.02, 0, 0)), (60, (0, 0, 0))],
        },
        60,
    )

    # Attack: braço direito ergue e desce num golpe rápido (referência pro futuro golpe de espada)
    criar_animacao(
        armature_obj,
        "Attack",
        {
            "Arm_R": [
                (1, (0, 0, 0)),
                (8, (-1.9, 0, 0.3)),
                (14, (1.1, 0, -0.2)),
                (24, (0, 0, 0)),
            ],
            "Spine": [
                (1, (0, 0, 0)),
                (8, (-0.15, 0, 0)),
                (14, (0.1, 0, 0)),
                (24, (0, 0, 0)),
            ],
        },
        24,
    )

    os.makedirs(os.path.dirname(CAMINHO_SAIDA), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=CAMINHO_SAIDA,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_apply=True,
    )
    print(f"[criar_peao_rpg] exportado com sucesso em: {CAMINHO_SAIDA}")

    # salva também um .blend com a cena pronta (malha + esqueleto + as duas animações) — abrir
    # esse arquivo direto na interface já cai com tudo montado, sem precisar reimportar o glTF
    bpy.ops.wm.save_as_mainfile(filepath=CAMINHO_BLEND)
    print(f"[criar_peao_rpg] projeto salvo em: {CAMINHO_BLEND}")


main()
