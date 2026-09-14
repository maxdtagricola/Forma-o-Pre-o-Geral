import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/Basics'
import { PercentField, SelectField, TextField } from '../components/ui/Field'
import { PreviaImportacao } from '../components/PreviaImportacao'
import {
  getPlanilhaAtivaIds,
  getStatusColors,
  listPlanilhas,
  salvarPlanilha,
  setPlanilhaAtivaId,
  setStatusColor,
  type PlanilhaImportada,
} from '../db/configRepo'
import { deleteEmpresa, listEmpresas, saveEmpresa } from '../db/empresasRepo'
import { definirTabelasCustomizadas } from '../calc/calculator'
import { lerPlanilhaMarkup } from '../xlsxImport'
import { baixarWorkbookMarkup } from '../planilhaMarkupDownload'
import { corPadraoDoStatus } from '../statusColors'
import { aplicarTema, getTema, type Tema } from '../theme'
import { formatDate } from '../utils'
import { gerarPreviaPlanilha, type PreviaPlanilha } from '../xlsxSheetUtil'
import { ESTADOS } from '../data/estados'
import { DEFAULT_EMPRESA, ESTADOS_DESTINO, QUOTE_STATUSES } from '../types'
import type { Empresa, EstadoDestino } from '../types'
import type { PricingGlobal } from '../db/configRepo'

const estadoOptions = ESTADOS.map((e) => ({ value: e.uf, label: `${e.uf} — ${e.nome}` }))

const SENHA_IMPORTACAO = '11994044'

export function ConfiguracoesPage({
  currentAdmin,
  pricingGlobal,
  onSavePricingGlobal,
}: {
  currentAdmin: string
  pricingGlobal: PricingGlobal
  onSavePricingGlobal: (valores: PricingGlobal) => Promise<void>
}) {
  // --- tema -----------------------------------------------------------------
  const [tema, setTema] = useState<Tema>(() => getTema())

  function handleTemaChange(novo: Tema) {
    setTema(novo)
    aplicarTema(novo)
  }

  // --- cores dos status -------------------------------------------------------
  const [coresStatus, setCoresStatus] = useState<Record<string, string>>({})

  useEffect(() => {
    getStatusColors()
      .then(setCoresStatus)
      .catch(() => {
        // cor customizada é só um extra visual — se falhar, usa a paleta padrão
      })
  }, [])

  async function handleCorStatusChange(status: string, cor: string) {
    setCoresStatus((prev) => ({ ...prev, [status]: cor }))
    try {
      await setStatusColor(status, cor)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar a cor no servidor.')
    }
  }

  // --- formação de preço global -----------------------------------------------
  const [rascunhoGlobal, setRascunhoGlobal] = useState<PricingGlobal>(pricingGlobal)
  const [salvandoGlobal, setSalvandoGlobal] = useState(false)

  useEffect(() => {
    setRascunhoGlobal(pricingGlobal)
  }, [pricingGlobal])

  async function handleSalvarGlobal() {
    setSalvandoGlobal(true)
    try {
      await onSavePricingGlobal(rascunhoGlobal)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
    } finally {
      setSalvandoGlobal(false)
    }
  }

  // --- empresas que recebem os materiais (destino do frete automático) --------
  const cardEmpresasRef = useRef<HTMLDivElement>(null)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true)
  const [formEmpresa, setFormEmpresa] = useState(DEFAULT_EMPRESA)
  const [editingEmpresaId, setEditingEmpresaId] = useState<string | undefined>(undefined)
  const [senhaEmpresa, setSenhaEmpresa] = useState('')
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false)

  async function refreshEmpresas() {
    setCarregandoEmpresas(true)
    try {
      setEmpresas(await listEmpresas())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar empresas do servidor.')
    } finally {
      setCarregandoEmpresas(false)
    }
  }

  useEffect(() => {
    refreshEmpresas()
  }, [])

  function patchEmpresa(p: Partial<typeof formEmpresa>) {
    setFormEmpresa((prev) => ({ ...prev, ...p }))
  }

  function handleCancelEditEmpresa() {
    setFormEmpresa(DEFAULT_EMPRESA)
    setEditingEmpresaId(undefined)
    setSenhaEmpresa('')
  }

  async function handleSubmitEmpresa() {
    if (!formEmpresa.nome.trim()) {
      alert('Informe pelo menos o nome da empresa.')
      return
    }
    if (senhaEmpresa !== SENHA_IMPORTACAO) {
      alert('Senha incorreta.')
      return
    }
    setSalvandoEmpresa(true)
    try {
      await saveEmpresa(formEmpresa, editingEmpresaId)
      handleCancelEditEmpresa()
      await refreshEmpresas()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar a empresa no servidor.')
    } finally {
      setSalvandoEmpresa(false)
    }
  }

  function handleEditEmpresa(e: Empresa) {
    setFormEmpresa({ nome: e.nome, cnpj: e.cnpj, endereco: e.endereco, bairro: e.bairro, cep: e.cep, municipio: e.municipio, uf: e.uf })
    setEditingEmpresaId(e.id)
    cardEmpresasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleDeleteEmpresa(id: string) {
    if (!confirm('Excluir esta empresa? Essa ação não pode ser desfeita.')) return
    try {
      await deleteEmpresa(id)
      if (editingEmpresaId === id) handleCancelEditEmpresa()
      await refreshEmpresas()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir a empresa no servidor.')
    }
  }

  // --- importação de planilha de markup ---------------------------------------
  const [habilitado, setHabilitado] = useState(false)
  const [perfilImportacao, setPerfilImportacao] = useState<EstadoDestino>('RO')
  const [senhaImportar, setSenhaImportar] = useState('')
  const [arquivo, setArquivo] = useState<File | undefined>(undefined)
  const [lendoPrevia, setLendoPrevia] = useState(false)
  const [previaArquivo, setPreviaArquivo] = useState<PreviaPlanilha | undefined>(undefined)
  const [arquivoConfirmado, setArquivoConfirmado] = useState(false)
  const [importando, setImportando] = useState(false)
  const [pendente, setPendente] = useState<{ nomeArquivo: string; rbc: PlanilhaImportada['rbc']; icmsSt: PlanilhaImportada['icmsSt']; totalNcmsRbc: number; totalNcmsIcmsSt: number } | undefined>(undefined)
  const [senhaSalvar, setSenhaSalvar] = useState('')
  const [salvandoPlanilha, setSalvandoPlanilha] = useState(false)

  const [planilhas, setPlanilhas] = useState<PlanilhaImportada[]>([])
  const [planilhaAtivaIds, setPlanilhaAtivaIds] = useState<Partial<Record<EstadoDestino, string>>>({})
  const [carregandoPlanilhas, setCarregandoPlanilhas] = useState(true)

  async function refreshPlanilhas() {
    setCarregandoPlanilhas(true)
    try {
      const [lista, ativas] = await Promise.all([listPlanilhas(), getPlanilhaAtivaIds()])
      setPlanilhas(lista)
      setPlanilhaAtivaIds(ativas)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar planilhas importadas do servidor.')
    } finally {
      setCarregandoPlanilhas(false)
    }
  }

  useEffect(() => {
    refreshPlanilhas()
  }, [])

  async function handleArquivoSelecionado(file: File | undefined) {
    setArquivo(file)
    setArquivoConfirmado(false)
    setPreviaArquivo(undefined)
    if (!file) return
    setLendoPrevia(true)
    try {
      setPreviaArquivo(await gerarPreviaPlanilha(file))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao ler a planilha.')
      setArquivo(undefined)
    } finally {
      setLendoPrevia(false)
    }
  }

  async function handleImportar() {
    if (!habilitado) return
    if (senhaImportar !== SENHA_IMPORTACAO) {
      alert('Senha incorreta.')
      return
    }
    if (!arquivo) {
      alert('Selecione o arquivo da planilha.')
      return
    }
    if (!arquivoConfirmado) {
      alert('Confirme que é a planilha certa antes de importar.')
      return
    }
    setImportando(true)
    try {
      const resultado = await lerPlanilhaMarkup(arquivo)
      setPendente({
        nomeArquivo: arquivo.name,
        rbc: resultado.rbc,
        icmsSt: resultado.icmsSt,
        totalNcmsRbc: resultado.totalNcmsRbc,
        totalNcmsIcmsSt: resultado.totalNcmsIcmsSt,
      })
      setSenhaImportar('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao ler a planilha.')
    } finally {
      setImportando(false)
    }
  }

  async function handleSalvarNovaPlanilha() {
    if (!pendente) return
    if (senhaSalvar !== SENHA_IMPORTACAO) {
      alert('Senha incorreta.')
      return
    }
    setSalvandoPlanilha(true)
    try {
      const registro = await salvarPlanilha({
        perfil: perfilImportacao,
        nomeArquivo: pendente.nomeArquivo,
        importadoPor: currentAdmin,
        rbc: pendente.rbc,
        icmsSt: pendente.icmsSt,
      })
      await setPlanilhaAtivaId(perfilImportacao, registro.id)
      definirTabelasCustomizadas(perfilImportacao, registro.rbc, registro.icmsSt)
      setPendente(undefined)
      setSenhaSalvar('')
      setArquivo(undefined)
      setPreviaArquivo(undefined)
      setArquivoConfirmado(false)
      setHabilitado(false)
      await refreshPlanilhas()
      alert('Planilha salva e aplicada com sucesso.')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar a planilha no servidor.')
    } finally {
      setSalvandoPlanilha(false)
    }
  }

  // --- trocar planilha ativa / baixar planilha — as duas pedem senha antes -----
  const [acaoPlanilhaPendente, setAcaoPlanilhaPendente] = useState<
    { tipo: 'usar' | 'baixar'; planilha: PlanilhaImportada } | undefined
  >(undefined)
  const [senhaAcaoPlanilha, setSenhaAcaoPlanilha] = useState('')
  const [executandoAcaoPlanilha, setExecutandoAcaoPlanilha] = useState(false)

  function handleCancelarAcaoPlanilha() {
    setAcaoPlanilhaPendente(undefined)
    setSenhaAcaoPlanilha('')
  }

  async function handleConfirmarAcaoPlanilha() {
    if (!acaoPlanilhaPendente) return
    if (senhaAcaoPlanilha !== SENHA_IMPORTACAO) {
      alert('Senha incorreta.')
      return
    }
    const { tipo, planilha } = acaoPlanilhaPendente
    setExecutandoAcaoPlanilha(true)
    try {
      if (tipo === 'usar') {
        await setPlanilhaAtivaId(planilha.perfil, planilha.id)
        definirTabelasCustomizadas(planilha.perfil, planilha.rbc, planilha.icmsSt)
        setPlanilhaAtivaIds((prev) => ({ ...prev, [planilha.perfil]: planilha.id }))
        alert(`Planilha "${planilha.nomeArquivo}" aplicada pro perfil ${planilha.perfil}.`)
      } else {
        baixarWorkbookMarkup(planilha)
      }
      handleCancelarAcaoPlanilha()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao concluir a ação.')
    } finally {
      setExecutandoAcaoPlanilha(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Configurações</h2>
        <p className="text-sm text-ink-400">Ajustes gerais do site, válidos pra todos os admins.</p>
      </div>

      <div className="card">
        <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Aparência</h3>
        <p className="text-xs text-ink-400 mb-4">Só nesse aparelho — cada admin escolhe o seu.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTemaChange('claro')}
            className={`pill-tab border ${tema === 'claro' ? 'bg-ink-950 border-ink-950 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-50'}`}
          >
            Claro
          </button>
          <button
            type="button"
            onClick={() => handleTemaChange('escuro')}
            className={`pill-tab border ${tema === 'escuro' ? 'bg-ink-950 border-ink-950 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-50'}`}
          >
            Escuro
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Cores dos status</h3>
        <p className="text-xs text-ink-400 mb-4">Usadas no Dashboard e na aba Cotações — vale pra todos os admins.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {QUOTE_STATUSES.map((status) => (
            <label
              key={status}
              className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2 text-xs text-ink-700"
            >
              <input
                type="color"
                value={coresStatus[status] || corPadraoDoStatus(status)}
                onChange={(e) => handleCorStatusChange(status, e.target.value)}
                className="h-6 w-8 shrink-0 cursor-pointer rounded border border-ink-200 p-0"
              />
              <span className="truncate">{status}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Formação de preço</h3>
        <p className="text-xs text-ink-400 mb-4">
          Imposto federal, comissão e custo fixo valem pra todas as cotações — não são mais definidos item a item.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <PercentField
            label="Imposto federal"
            value={rascunhoGlobal.impFedPct}
            onChange={(v) => setRascunhoGlobal((prev) => ({ ...prev, impFedPct: v }))}
          />
          <PercentField
            label="Comissão"
            value={rascunhoGlobal.comissaoPct}
            onChange={(v) => setRascunhoGlobal((prev) => ({ ...prev, comissaoPct: v }))}
          />
          <PercentField
            label="Custo fixo"
            value={rascunhoGlobal.custoFixoPct}
            onChange={(v) => setRascunhoGlobal((prev) => ({ ...prev, custoFixoPct: v }))}
          />
        </div>
        <Button variant="primary" onClick={handleSalvarGlobal} disabled={salvandoGlobal}>
          Salvar formação de preço
        </Button>
      </div>

      <div className="card" ref={cardEmpresasRef}>
        <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Empresas que recebem os materiais</h3>
        <p className="text-xs text-ink-400 mb-4">
          Dados completos de cada empresa do grupo — vão ser usados na aba Frete como destino, pra gerar o frete
          automático por transportadora.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Nome / Razão social" value={formEmpresa.nome} onChange={(v) => patchEmpresa({ nome: v })} />
          <TextField label="CNPJ / CPF" value={formEmpresa.cnpj} onChange={(v) => patchEmpresa({ cnpj: v })} placeholder="00.000.000/0000-00" />
          <TextField label="Endereço" value={formEmpresa.endereco} onChange={(v) => patchEmpresa({ endereco: v })} className="sm:col-span-2" />
          <TextField label="Bairro / Distrito" value={formEmpresa.bairro} onChange={(v) => patchEmpresa({ bairro: v })} />
          <TextField label="CEP" value={formEmpresa.cep} onChange={(v) => patchEmpresa({ cep: v })} placeholder="00000-000" />
          <TextField label="Município" value={formEmpresa.municipio} onChange={(v) => patchEmpresa({ municipio: v })} />
          <SelectField label="UF" value={formEmpresa.uf} onChange={(v) => patchEmpresa({ uf: v })} options={estadoOptions} />
        </div>

        <label className="block mt-4 max-w-[12rem]">
          <span className="field-label">Senha pra salvar</span>
          <input
            type="password"
            className="field-input"
            value={senhaEmpresa}
            onChange={(e) => setSenhaEmpresa(e.target.value)}
          />
        </label>

        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={handleSubmitEmpresa} disabled={salvandoEmpresa}>
            {editingEmpresaId ? 'Salvar alterações' : 'Adicionar empresa'}
          </Button>
          {editingEmpresaId && (
            <Button variant="secondary" onClick={handleCancelEditEmpresa}>
              Cancelar edição
            </Button>
          )}
        </div>

        {carregandoEmpresas ? (
          <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
        ) : empresas.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">Nenhuma empresa cadastrada ainda.</p>
        ) : (
          <div className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
            {empresas.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-3">
                <button type="button" onClick={() => handleEditEmpresa(e)} className="min-w-0 text-left flex-1 hover:opacity-80">
                  <p className="text-sm font-medium text-ink-900 truncate">{e.nome}</p>
                  <p className="text-xs text-ink-400 truncate">
                    CNPJ {e.cnpj || '—'} · {e.endereco || '—'} · {e.municipio || '—'}
                    {e.municipio && e.uf ? ' - ' : ''}
                    {e.uf || ''}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteEmpresa(e.id)}
                  className="shrink-0 text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Importar planilha de markup</h3>
        <p className="text-xs text-ink-400 mb-4">
          Se os impostos ou tabelas da planilha original (RBC, ICMS-ST) mudarem, importe a nova versão aqui em vez de
          alterar tudo manualmente. A importação só faz a leitura — nada muda até você clicar em "Salvar nova
          planilha" e confirmar a senha de novo.
        </p>

        <label className="flex items-center gap-2 mb-4 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={habilitado}
            onChange={(e) => setHabilitado(e.target.checked)}
            className="h-4 w-4"
          />
          Habilitar importação de planilha
        </label>

        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 ${habilitado ? '' : 'opacity-40 pointer-events-none'}`}>
          <SelectField
            label="Perfil (estado de destino)"
            value={perfilImportacao}
            onChange={(v) => setPerfilImportacao(v as EstadoDestino)}
            options={ESTADOS_DESTINO.map((e) => ({ value: e.value, label: e.label }))}
          />
          <label className="block">
            <span className="field-label">Senha</span>
            <input
              type="password"
              className="field-input"
              value={senhaImportar}
              onChange={(e) => setSenhaImportar(e.target.value)}
              disabled={!habilitado}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Arquivo (.xlsx)</span>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => handleArquivoSelecionado(e.target.files?.[0])}
              disabled={!habilitado}
              className="field-input"
            />
          </label>
        </div>

        {lendoPrevia && <p className="text-sm text-ink-400 mb-4">Lendo planilha…</p>}

        {habilitado && previaArquivo && arquivo && !arquivoConfirmado && (
          <div className="mb-4">
            <PreviaImportacao
              nomeArquivo={arquivo.name}
              previa={previaArquivo}
              onConfirmar={() => setArquivoConfirmado(true)}
              onCancelar={() => handleArquivoSelecionado(undefined)}
            />
          </div>
        )}

        <Button
          variant="secondary"
          onClick={handleImportar}
          disabled={!habilitado || !arquivoConfirmado || importando}
        >
          Importar (só leitura)
        </Button>

        {pendente && (
          <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="text-sm font-medium text-ink-900 mb-1">
              Planilha lida: {pendente.nomeArquivo} (perfil {perfilImportacao})
            </p>
            <p className="text-xs text-ink-600 mb-3">
              {pendente.totalNcmsRbc} NCMs na tabela RBC · {pendente.totalNcmsIcmsSt} NCMs na tabela ICMS-ST. Ainda não
              foi aplicada — confirme a senha de novo pra substituir a planilha atual desse perfil.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                className="field-input max-w-[10rem]"
                placeholder="Senha"
                value={senhaSalvar}
                onChange={(e) => setSenhaSalvar(e.target.value)}
              />
              <Button variant="primary" onClick={handleSalvarNovaPlanilha} disabled={salvandoPlanilha}>
                Salvar nova planilha
              </Button>
              <Button variant="ghost" onClick={() => setPendente(undefined)}>
                Descartar
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Planilhas importadas</h3>
        <p className="text-xs text-ink-400 mb-4">Histórico de todas as planilhas já salvas — dá pra voltar a usar uma anterior.</p>
        {carregandoPlanilhas ? (
          <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
        ) : planilhas.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">Nenhuma planilha importada ainda.</p>
        ) : (
          <div className="divide-y divide-ink-100">
            {planilhas.map((p) => {
              const ativa = planilhaAtivaIds[p.perfil] === p.id
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">
                      {p.nomeArquivo}
                      {ativa && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                          Ativa
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-400">
                      Perfil {p.perfil} · importado por {p.importadoPor || '—'} em {formatDate(p.importadoEm)}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      onClick={() => setAcaoPlanilhaPendente({ tipo: 'baixar', planilha: p })}
                    >
                      Baixar
                    </Button>
                    {!ativa && (
                      <Button
                        variant="secondary"
                        onClick={() => setAcaoPlanilhaPendente({ tipo: 'usar', planilha: p })}
                      >
                        Usar esta
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {acaoPlanilhaPendente && (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="text-sm text-ink-900 mb-3">
              {acaoPlanilhaPendente.tipo === 'usar'
                ? `Confirme a senha pra usar "${acaoPlanilhaPendente.planilha.nomeArquivo}" no perfil ${acaoPlanilhaPendente.planilha.perfil}.`
                : `Confirme a senha pra baixar "${acaoPlanilhaPendente.planilha.nomeArquivo}".`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                className="field-input max-w-[10rem]"
                placeholder="Senha"
                value={senhaAcaoPlanilha}
                onChange={(e) => setSenhaAcaoPlanilha(e.target.value)}
              />
              <Button variant="primary" onClick={handleConfirmarAcaoPlanilha} disabled={executandoAcaoPlanilha}>
                Confirmar
              </Button>
              <Button variant="ghost" onClick={handleCancelarAcaoPlanilha}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
