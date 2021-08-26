import { Credentials, CredentialsLoader } from '../credentials';

export interface DockerConfigAuthInformation {
    readonly auth: string;
}

export interface DockerConfig {
    readonly auths: {
        [key: string]: DockerConfigAuthInformation;
    };
}

class DockerAuthCredentials implements Credentials {
    constructor(private dockerAuth: DockerConfigAuthInformation) {}

    public getToken(): string {
        return this.dockerAuth.auth;
    }
}

export class DockerConfigCredentialsLoader implements CredentialsLoader {
    private readonly configCredentialsMap = new Map<string, DockerAuthCredentials>();

    constructor(dockerConfig: DockerConfig) {
        for (const host of Object.keys(dockerConfig.auths)) {
            this.configCredentialsMap.set(host, new DockerAuthCredentials(dockerConfig.auths[host]));
        }
    }

    public async loadCredentials(registryHost: string): Promise<Credentials | undefined> {
        return this.configCredentialsMap.get(registryHost);
    }
}
