// Determine base URL:
// In production builds, default to the deployed Render backend if VITE_API_URL is not explicitly set.
// In local development, default to '' so Vite's proxy forwards /api calls to http://127.0.0.1:5000.
const rawBase = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://parkhere-api-addc.onrender.com' : '')).trim();

// Normalize base URL: strip trailing slashes, and strip trailing '/api' so endpoints starting with '/api' never create '/api/api'
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
    const isDev = import.meta.env.DEV;
    const msg = isDev
      ? 'Unable to reach the server. Please ensure the backend is running on http://localhost:5000.'
      : 'Unable to reach the server. Please check your network connection or verify that the backend service is running.';
    throw new Error(msg);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    const isServerError = response.status >= 500;
    const isDev = import.meta.env.DEV;
    data = {
      success: false,
      error: isServerError
        ? (isDev
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
