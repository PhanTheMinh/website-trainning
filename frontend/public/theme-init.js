// Run before styles load to avoid flashing the wrong theme on refresh.
;(function () {
  var preference = null
  try { preference = localStorage.getItem('runstore.theme') } catch { /* Storage may be blocked. */ }
  var dark = preference === 'dark' || (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111815' : '#f6f7f5')
})()
