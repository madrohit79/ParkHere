const API_BASE = import.meta.env.VITE_API_URL || '';

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

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, config);
  } catch (networkErr) {
    throw new Error('Unable to reach the server. Please ensure the backend is running on http://localhost:5000.');
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    const isServerError = response.status >= 500;
    data = {
      success: false,
      error: isServerError
        ? `Backend server is unavailable (Status ${response.status}). Please make sure your backend server is running on http://localhost:5000.`
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
