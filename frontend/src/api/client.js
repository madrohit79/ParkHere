// Normalize base URL:
// 1. Trim whitespace
// 2. Remove any trailing slashes
// 3. Remove trailing '/api' if present so that endpoints starting with '/api' never create '/api/api'
const rawBase = (import.meta.env.VITE_API_URL || '').trim();
const API_BASE = rawBase.replace(/\/+$/, '').replace(/\/api$/, '');

/**
 * Universal API fetch wrapper with token attachment and friendly error handling.
 */
export async function apiRequest(endpoint, { method = 'GET', body = null, headers = {} } = {}) {
  const token = localStorage.getItem('parkhere_token');

  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers: requestHeaders
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const requestUrl = `${API_BASE}${cleanEndpoint}`;

  let response;
  try {
    response = await fetch(requestUrl, config);
  } catch (networkErr) {
    const isLocal = !API_BASE || API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1');
    const msg = isLocal
      ? 'Unable to reach the server. Please ensure the backend is running on http://localhost:5000.'
      : 'Unable to reach the server. Please check your network connection or verify that the backend service is running.';
    throw new Error(msg);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    const isServerError = response.status >= 500;
    const isLocal = !API_BASE || API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1');
    data = {
      success: false,
      error: isServerError
        ? (isLocal
            ? `Backend server is unavailable (Status ${response.status}). Please make sure your backend server is running on http://localhost:5000.`
            : `Backend server error (Status ${response.status}). Please try again later.`)
        : 'Failed to parse server response'
    };
  }

  if (!response.ok) {
    const errorMsg = data.error || (data.message ? data.message : `Request failed with status ${response.status}`);
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export default apiRequest;
