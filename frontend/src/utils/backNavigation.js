export function goBack(router, fallback, historyState = window.history.state) {
  const previous = historyState?.back
  if (typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('//')) {
    router.back()
  } else {
    router.replace(fallback)
  }
}
