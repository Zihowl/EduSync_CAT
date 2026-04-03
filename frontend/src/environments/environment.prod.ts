const resolveApiUrl = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }

  // En el navegador usamos el mismo origen del frontend para que Angular y
  // Cloudflare Tunnel reenvíen las rutas /graphql, /academic y /public al backend local.
  return '';
};

export const environment = {
  production: true,
  apiUrl: resolveApiUrl(),
};
