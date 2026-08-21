import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'

describe('research workbench locale copy', () => {
  it('labels the Chinese library tab as 文献', () => {
    expect(zh['tab.papers']).toBe('文献')
    expect(Object.values(zh)).not.toContain('文学')
  })

  it('keeps both dictionaries on the same key set', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})
