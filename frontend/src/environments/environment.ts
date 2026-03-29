const resolveApiUrl = () => {
    if (typeof window === 'undefined') {
        return 'http://localhost:3000';
    }

    const host = window.location.hostname || 'localhost';
    return `http://${host}:3000`;
};

export const environment = {
    production: false,
    apiUrl: resolveApiUrl()
};
