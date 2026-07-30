import { MOTION_BANK } from './bank.ts'
import type { MotionRecipe } from './types.ts'

export function findRecipe(id: string): MotionRecipe | undefined {
  return MOTION_BANK.find((recipe) => recipe.id === id)
}

/** Classe CSS de entrada. Fallback: subida-suave (artistic-enter-soft-rise). */
export function motionEnterClass(recipeId: string): string {
  const recipe = findRecipe(recipeId)
  if (recipe && recipe.when.includes('enter')) return recipe.contract.className
  return 'artistic-enter-soft-rise'
}

/** Classe CSS de saída. Fallback: dispersar-fade (artistic-exit-fade). */
export function motionExitClass(recipeId: string): string {
  const recipe = findRecipe(recipeId)
  if (recipe && recipe.when.includes('exit')) return recipe.contract.className
  return 'artistic-exit-fade'
}

/** Classe CSS de reflow (growing/shrinking/pivoting). Fallback: '' (sem reflow). */
export function motionReflowClass(recipeId: string | undefined): string {
  if (!recipeId) return ''
  const recipe = findRecipe(recipeId)
  if (recipe && recipe.when.includes('reflow')) return recipe.contract.className
  return ''
}
