const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

async function request(path, options = {}) {
  const url = new URL(path, API_BASE_URL)

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },credentials: "include",
    ...options
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
      body: JSON.stringify(body)
    }),
  put: (path, body, options) =>
    request(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' })
}

export { API_BASE_URL }
