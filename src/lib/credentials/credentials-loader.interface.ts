import { Credentials } from './credentials.interface';

export interface CredentialsLoader {
    loadCredentials(registryHost: string): Promise<Credentials | undefined>;
}
