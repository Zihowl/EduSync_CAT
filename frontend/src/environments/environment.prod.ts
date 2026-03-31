const resolveApiUrl = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }

  const host = window.location.hostname || 'localhost';

  // En producción, se espera que el backend esté detrás del mismo dominio del frontend.
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  if (host.endsWith('.trycloudflare.com')) {
    return `https://${host}`;
  }

  return `http://${host}:3000`;
};

export const environment = {
  production: true,
  apiUrl: resolveApiUrl(),
};
