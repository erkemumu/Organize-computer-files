import { describe, it, expect } from 'vitest'
import { chooseStrategy } from '../src/exec/move.js'

describe('chooseStrategy', () => {
  it('renames on same volume, copies across volumes', () => {
    expect(chooseStrategy('C:/a/x.jpg', 'C:/b/y.jpg')).toBe('rename')
    expect(chooseStrategy('C:/a/x.jpg', 'D:/b/y.jpg')).toBe('copy-delete')
  })
})
