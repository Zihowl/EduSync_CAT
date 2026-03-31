const resolveApiUrl = () => {
    if (typeof window === 'undefined') {
        return 'http://localhost:3000';
    }

    const host = window.location.hostname || 'localhost';

    // Al usar el proxy de Angular (proxy.conf.json), todas las peticiones en dev
    // deben ir al mismo origen (puerto 8100 o el túnel) y Angular las redirige al 3000.
    return '';
};

export const environment = {
    production: false,
    apiUrl: resolveApiUrl(),
};
