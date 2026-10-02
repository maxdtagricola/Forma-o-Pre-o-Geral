import { deleteNotaFiscal, listNotasFiscais, saveNotaFiscal, updateNotaFiscalStatus } from '../db/notasFiscaisRepo'
import { RegistroNotasPage, type ConfigRegistroNotas } from './RegistroNotasPage'

// "Transferências Fiscais" — a tela em si é a mesma de Notas Fiscais (ver RegistroNotasPage), só
// muda a coleção no servidor e os títulos. O prefixo "notas" mantém os rascunhos já salvos.
const CONFIG_TRANSFERENCIAS: ConfigRegistroNotas = {
  prefixoChave: 'notas',
  tituloRegistro: 'Registro de Transferências',
  tituloLista: 'Transferências fiscais registradas',
  listar: listNotasFiscais,
  salvar: saveNotaFiscal,
  atualizarStatus: updateNotaFiscalStatus,
  excluir: deleteNotaFiscal,
}

export function AcompanhamentoNotasPage({ currentAdmin }: { currentAdmin: string }) {
  return <RegistroNotasPage currentAdmin={currentAdmin} config={CONFIG_TRANSFERENCIAS} />
}
