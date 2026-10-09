import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// -----------------------------------------------------------------------
// Observação de um item, do jeito do comentário (nota) do Excel: a célula
// fica estreita, com o triângulo vermelho no canto quando tem observação;
// passando o mouse aparece o balão amarelo com o texto inteiro, e clicando
// (ou Enter) o balão abre pra escrever, crescendo conforme o texto.
//
// O balão é desenhado fora da tabela (portal no <body>, posição fixa na
// tela) — dentro dela, a área que rola de lado cortaria o balão nas
// últimas linhas e colunas.
// -----------------------------------------------------------------------

const LARGURA_BALAO = 272 // px
const MARGEM_TELA = 8

function posicionar(ancora: DOMRect, altura: number): { top: number; left: number } {
  // à direita da célula, como no Excel; sem espaço, do lado esquerdo
  let left = ancora.right + 6
  if (left + LARGURA_BALAO > window.innerWidth - MARGEM_TELA) left = Math.max(MARGEM_TELA, ancora.left - LARGURA_BALAO - 6)
  let top = ancora.top
  if (top + altura > window.innerHeight - MARGEM_TELA) top = Math.max(MARGEM_TELA, window.innerHeight - altura - MARGEM_TELA)
  return { top, left }
}

export function CelulaObservacao({
  valor,
  onChange,
  onFechar,
  idLinha,
  descricaoItem,
  placeholder = 'Escreva a observação desse produto…',
}: {
  valor: string
  onChange: (valor: string) => void
  /** Quando o balão de escrever fecha — pra quem grava no servidor só no fim, não a cada tecla. */
  onFechar?: () => void
  /** Marca o balão como parte da linha — o foco indo pro balão não conta como "saiu da linha". */
  idLinha: string
  /** Pra quem usa leitor de tela saber de qual item é a observação. */
  descricaoItem: string
  placeholder?: string
}) {
  const [editando, setEditando] = useState(false)
  const [espiando, setEspiando] = useState(false)
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null)
  const celulaRef = useRef<HTMLButtonElement>(null)
  const balaoRef = useRef<HTMLDivElement>(null)
  const textoRef = useRef<HTMLTextAreaElement>(null)
  const temTexto = valor.trim().length > 0
  const balaoVisivel = editando || (espiando && temTexto)

  // posição do balão: calculada ao abrir e refeita ao rolar/redimensionar a tela (e quando o texto
  // muda de tamanho), pra continuar grudado na célula
  useLayoutEffect(() => {
    if (!balaoVisivel) return
    const atualizar = () => {
      const ancora = celulaRef.current?.getBoundingClientRect()
      if (!ancora) return
      setPosicao(posicionar(ancora, balaoRef.current?.offsetHeight ?? 120))
    }
    atualizar()
    window.addEventListener('scroll', atualizar, true)
    window.addEventListener('resize', atualizar)
    return () => {
      window.removeEventListener('scroll', atualizar, true)
      window.removeEventListener('resize', atualizar)
    }
  }, [balaoVisivel, valor])

  // a caixa de texto cresce com o que foi escrito (até um limite — passando, rola por dentro)
  useLayoutEffect(() => {
    const t = textoRef.current
    if (!editando || !t) return
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 260)}px`
  }, [editando, valor])

  useEffect(() => {
    if (editando) {
      const t = textoRef.current
      t?.focus()
      // cursor no fim do texto, pra continuar escrevendo
      if (t) t.setSelectionRange(t.value.length, t.value.length)
    }
  }, [editando])

  function fechar(devolverFoco: boolean) {
    if (editando) onFechar?.()
    setEditando(false)
    setEspiando(false)
    if (devolverFoco) celulaRef.current?.focus()
  }

  return (
    <>
      <button
        ref={celulaRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setEditando(true)
        }}
        onMouseEnter={() => setEspiando(true)}
        onMouseLeave={() => setEspiando(false)}
        aria-label={temTexto ? `Observação de ${descricaoItem}: ${valor}` : `Adicionar observação em ${descricaoItem}`}
        aria-expanded={editando}
        className="relative block w-full min-h-[2.125rem] rounded px-1.5 py-1.5 text-left text-xs text-ink-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
      >
        {temTexto ? (
          <span className="block truncate">{valor.split('\n')[0]}</span>
        ) : (
          <span className="block truncate text-ink-300">+ obs.</span>
        )}
        {/* o triângulo vermelho do canto, igual ao do comentário do Excel */}
        {temTexto && (
          <span
            aria-hidden
            className="absolute right-0 top-0 h-0 w-0 border-l-[7px] border-t-[7px] border-l-transparent border-t-rose-600"
          />
        )}
      </button>

      {balaoVisivel &&
        createPortal(
          <div
            ref={balaoRef}
            data-linha-item={idLinha}
            role={editando ? 'dialog' : 'tooltip'}
            aria-label={editando ? `Observação de ${descricaoItem}` : undefined}
            className={`fixed z-[60] rounded-md border border-amber-300 bg-amber-50 p-2 text-ink-900 shadow-lg ${
              editando ? '' : 'pointer-events-none'
            }`}
            style={{
              width: LARGURA_BALAO,
              top: posicao?.top ?? -9999,
              left: posicao?.left ?? -9999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-[11px] font-bold text-ink-800">Observação</p>
            {editando ? (
              <>
                <textarea
                  ref={textoRef}
                  value={valor}
                  rows={3}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={() => fechar(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                      e.preventDefault()
                      fechar(true)
                    }
                  }}
                  placeholder={placeholder}
                  className="block w-full resize-none rounded border border-amber-200 bg-surface/70 px-1.5 py-1 text-xs leading-snug text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <p className="mt-1 text-[10px] text-ink-500">Esc ou clicar fora fecha · Enter pula linha</p>
              </>
            ) : (
              <p className="whitespace-pre-wrap break-words text-xs leading-snug">{valor}</p>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
