/** The two fields a category tree is built from. `CategoryListItem` has both. */
export interface CategoryTreeItem {
  id: string
  parent_id: string | null
}

export interface CategoryNode<T extends CategoryTreeItem> {
  category: T
  children: CategoryNode<T>[]
}

/**
 * Turns the flat `catalog.categories.list()` rows into a tree, keeping the order the rows came in.
 * A row whose parent is not in the list is treated as top-level, so a partial list still renders.
 */
export function categoryTree<T extends CategoryTreeItem>(items: readonly T[]): CategoryNode<T>[] {
  const nodes = new Map<string, CategoryNode<T>>()
  for (const category of items) nodes.set(category.id, { category, children: [] })

  const roots: CategoryNode<T>[] = []
  for (const node of nodes.values()) {
    const parentId = node.category.parent_id
    const parent = parentId === null ? undefined : nodes.get(parentId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}

/**
 * The categories above `id`, top first, for a breadcrumb. Excludes the category itself, and
 * stops at a parent missing from `items` or at a repeated id.
 */
export function categoryAncestors<T extends CategoryTreeItem>(items: readonly T[], id: string): T[] {
  const byId = new Map(items.map((category) => [category.id, category]))
  const ancestors: T[] = []
  const seen = new Set<string>([id])
  let parentId = byId.get(id)?.parent_id ?? null

  while (parentId !== null && !seen.has(parentId)) {
    const parent = byId.get(parentId)
    if (!parent) break
    ancestors.unshift(parent)
    seen.add(parentId)
    parentId = parent.parent_id
  }

  return ancestors
}
