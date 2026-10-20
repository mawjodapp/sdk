import { describe, expect, it } from 'vitest'

import { categoryAncestors, categoryTree } from '../src/index.js'

const rows = [
  { id: 'formal', parent_id: 'shirts' },
  { id: 'clothing', parent_id: null },
  { id: 'shirts', parent_id: 'clothing' },
  { id: 'kitchen', parent_id: null },
  { id: 'jeans', parent_id: 'clothing' },
]

describe('categoryTree', () => {
  it('nests children under their parent and keeps the order the rows came in', () => {
    const tree = categoryTree(rows)

    expect(tree.map((node) => node.category.id)).toEqual(['clothing', 'kitchen'])
    expect(tree[0]!.children.map((node) => node.category.id)).toEqual(['shirts', 'jeans'])
    expect(tree[0]!.children[0]!.children.map((node) => node.category.id)).toEqual(['formal'])
  })

  it('treats a row whose parent is missing as top-level, so nothing disappears', () => {
    expect(categoryTree([{ id: 'formal', parent_id: 'shirts' }]).map((node) => node.category.id)).toEqual(['formal'])
  })
})

describe('categoryAncestors', () => {
  it('lists the categories above, top first, without the category itself', () => {
    expect(categoryAncestors(rows, 'formal').map((row) => row.id)).toEqual(['clothing', 'shirts'])
    expect(categoryAncestors(rows, 'clothing')).toEqual([])
  })

  it('stops at a loop instead of hanging', () => {
    const loop = [
      { id: 'a', parent_id: 'b' },
      { id: 'b', parent_id: 'a' },
    ]

    expect(categoryAncestors(loop, 'a').map((row) => row.id)).toEqual(['b'])
  })
})
