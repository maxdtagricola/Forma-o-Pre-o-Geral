import { calculateItem } from './calculator'
import type { MarginPoint, PricingConfig, ProductInput } from '../types'

/**
 * Gera a tabela de comparação de margens (por padrão 10% a 50%, em passos
 * de 1%) reaproveitando o mesmo motor de cálculo do dashboard — cada ponto
 * é matematicamente idêntico ao que se obteria alterando o campo "Lucro"
 * na tela principal.
 */
export function calculateMarginRange(
  product: ProductInput,
  pricing: PricingConfig,
  min = 0.1,
  max = 0.5,
  step = 0.01,
): MarginPoint[] {
  const pontos: MarginPoint[] = []
  const steps = Math.round((max - min) / step)
  for (let i = 0; i <= steps; i++) {
    const margemPct = Math.round((min + i * step) * 10000) / 10000
    const resultado = calculateItem(product, { ...pricing, lucroPct: margemPct })
    pontos.push({
      margemPct,
      precoVendaUnitario: resultado.precoVendaUnitario,
      precoVendaTotal: resultado.precoVendaTotal,
      lucroValor: resultado.breakdown.lucro,
      markup: resultado.markupMultiplicador,
      viavel: resultado.viavel,
    })
  }
  return pontos
}
