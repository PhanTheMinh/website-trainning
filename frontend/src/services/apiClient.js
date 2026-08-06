const runtimeApiBaseUrl = typeof window === 'undefined'
  ? 'http://localhost:3000'
  : `${window.location.protocol}//${window.location.hostname}:3000`

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || runtimeApiBaseUrl

async function request(path, options = {}) {
  const url = new URL(path, API_BASE_URL)
  const { body, headers = {}, ...requestOptions } = options
  const isFormData = body instanceof FormData

  const response = await fetch(url, {
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    credentials: 'include',
    ...requestOptions,
    body
  })

  const contentType = response.headers.get('content-type')
  const isJson = contentType?.includes('application/json')
  const data = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    throw new Error(
      typeof data === 'string'
        ? data || `Request failed with status ${response.status}`
        : data.message || `Request failed with status ${response.status}`
    )
  }

  return data
}

export const apiClient = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) =>
    request(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body)
    }),
  put: (path, body, options) =>
    request(path, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body)
    }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' })
}

export { API_BASE_URL }
