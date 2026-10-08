import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVisibilityAwarePoller } from './visibilityPoller.js'

function createEventTarget(initialState = {}) {
  const listeners = new Map()

  return {
    ...initialState,
    addEventListener(type, listener) {
      const current = listeners.get(type) || new Set()
      current.add(listener)
      listeners.set(type, current)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type) {
      listeners.get(type)?.forEach((listener) => listener())
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createVisibilityAwarePoller', () => {
  it('polls periodically and when the visible window receives focus', () => {
    vi.useFakeTimers()
    const poll = vi.fn()
    const windowTarget = createEventTarget()
    const documentTarget = createEventTarget({ visibilityState: 'visible' })
    const poller = createVisibilityAwarePoller({
      poll,
      intervalMs: 30000,
      windowTarget,
      documentTarget,
      timerApi: globalThis
    })

    poller.mount()
    vi.advanceTimersByTime(30000)
    windowTarget.dispatch('focus')

    expect(poll).toHaveBeenCalledTimes(2)
    poller.unmount()
  })

  it('pauses while hidden, refreshes on return and cleans up listeners', () => {
    vi.useFakeTimers()
    const poll = vi.fn()
    const windowTarget = createEventTarget()
    const documentTarget = createEventTarget({ visibilityState: 'visible' })
    const poller = createVisibilityAwarePoller({
      poll,
      intervalMs: 30000,
      windowTarget,
      documentTarget,
      timerApi: globalThis
    })

    poller.mount()
    documentTarget.visibilityState = 'hidden'
    documentTarget.dispatch('visibilitychange')
    vi.advanceTimersByTime(60000)
    expect(poll).not.toHaveBeenCalled()

    documentTarget.visibilityState = 'visible'
    documentTarget.dispatch('visibilitychange')
    vi.advanceTimersByTime(30000)
    expect(poll).toHaveBeenCalledTimes(2)

    poller.unmount()
    windowTarget.dispatch('focus')
    vi.advanceTimersByTime(30000)
    expect(poll).toHaveBeenCalledTimes(2)
  })
})

