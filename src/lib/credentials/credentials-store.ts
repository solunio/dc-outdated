import { CredentialsLoader } from './credentials-loader.interface';
import { Credentials } from './credentials.interface';

export class CredentialsStore {
    private store = new Map<string, Credentials>();

    constructor(private readonly credentialsLoaders: CredentialsLoader[]) {}

    public async getCredentials(registryHost: string | undefined): Promise<Credentials | undefined> {
        if (!registryHost) return;

        const credentials = this.store.get(registryHost);
        if (credentials != null) return credentials;

        for (const loader of this.credentialsLoaders) {
            const loadedCredentials = await loader.loadCredentials(registryHost);
            if (loadedCredentials != null) {
                this.addCredentials(registryHost, loadedCredentials);
                return loadedCredentials;
            }
        }

        return undefined;
    }

    public addCredentials(registryHost: string, credentials: Credentials): void {
        this.store.set(registryHost, credentials);
    }
}
