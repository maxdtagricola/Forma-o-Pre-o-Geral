import {
  deleteNotaFiscalGeral,
  listNotasFiscaisGerais,
  saveNotaFiscalGeral,
  updateNotaFiscalGeralStatus,
} from '../db/notasFiscaisGeraisRepo'
import { RegistroNotasPage, type ConfigRegistroNotas } from './RegistroNotasPage'

// Mesma tela da aba "Transferências Fiscais" (ver RegistroNotasPage), só que com uma lista de notas
// fiscais própria e independente — outra coleção no servidor (ver notasFiscaisGeraisRepo.ts).
const CONFIG_NOTAS_FISCAIS: ConfigRegistroNotas = {
  prefixoChave: 'notasGerais',
  tituloRegistro: 'Registro de Notas',
  tituloLista: 'Notas fiscais registradas',
  listar: listNotasFiscaisGerais,
  salvar: saveNotaFiscalGeral,
  atualizarStatus: updateNotaFiscalGeralStatus,
  excluir: deleteNotaFiscalGeral,
}

export function NotasFiscaisPage({ currentAdmin }: { currentAdmin: string }) {
  return <RegistroNotasPage currentAdmin={currentAdmin} config={CONFIG_NOTAS_FISCAIS} />
}
