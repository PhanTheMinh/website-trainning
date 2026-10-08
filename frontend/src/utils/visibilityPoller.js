export function createVisibilityAwarePoller({
  poll,
  intervalMs = 30000,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  timerApi = globalThis
}) {
  let intervalId = null
  let mounted = false

  const isVisible = () => documentTarget?.visibilityState !== 'hidden'

  function stopTimer() {
    if (intervalId === null) return
    timerApi.clearInterval(intervalId)
    intervalId = null
  }

  function startTimer() {
    if (intervalId !== null || !isVisible()) return
    intervalId = timerApi.setInterval(() => {
      if (isVisible()) poll()
    }, intervalMs)
  }

  function pollIfVisible() {
    if (isVisible()) poll()
  }

  function handleVisibilityChange() {
    if (!isVisible()) {
      stopTimer()
      return
    }

    poll()
    startTimer()
  }

  function mount() {
    if (mounted) return
    mounted = true
    windowTarget?.addEventListener('focus', pollIfVisible)
    documentTarget?.addEventListener('visibilitychange', handleVisibilityChange)
    startTimer()
  }

  function unmount() {
    if (!mounted) return
    mounted = false
    windowTarget?.removeEventListener('focus', pollIfVisible)
    documentTarget?.removeEventListener('visibilitychange', handleVisibilityChange)
    stopTimer()
  }

  return { mount, unmount }
}

