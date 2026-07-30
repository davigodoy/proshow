import assert from 'node:assert/strict'
import test from 'node:test'
import { nextArtisticStack, pushStackOrder } from '../src/theme/resolve.ts'

test('promotes an on-screen phrase to the newest stack position', () => {
  assert.deepEqual(pushStackOrder([0, 1], 0), [1, 0])
  assert.deepEqual(pushStackOrder([0, 1, 2], 0), [1, 2, 0])
})

test('rebuilds the stack identity when the newest phrase is selected again', () => {
  const previous = [0, 1, 2]
  const next = pushStackOrder(previous, 2)

  assert.deepEqual(next, previous)
  assert.notEqual(next, previous)
})

test('keeps composition origin stable when promoting a reduced phrase', () => {
  const grown = nextArtisticStack([], 0, 0)
  assert.deepEqual(grown, { order: [0], origin: 0 })

  const second = nextArtisticStack(grown.order, grown.origin, 1)
  assert.deepEqual(second, { order: [0, 1], origin: 0 })

  const promoted = nextArtisticStack(second.order, second.origin, 0)
  assert.deepEqual(promoted, { order: [1, 0], origin: 0 })

  const fresh = nextArtisticStack([0, 1, 2], 0, 3)
  assert.deepEqual(fresh, { order: [3], origin: 3 })
})