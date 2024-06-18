import { type SessionConfig } from 'h3';

export const getSessionConfig = (): SessionConfig => {
    const config = useRuntimeConfig();

    return {
        password: config.brevia.session.secret,
        name: config.brevia.session.name,
    } as SessionConfig;
}
