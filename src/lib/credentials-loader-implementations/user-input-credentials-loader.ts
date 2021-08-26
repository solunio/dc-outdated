import inquirer from 'inquirer';

import { Credentials } from '../credentials';
import { CredentialsLoader } from '../credentials/credentials-loader.interface';

export class LoginCredentials implements Credentials {
    constructor(private username: string, private password: string) {}

    public getToken(): string {
        return Buffer.from(`${this.username}:${this.password}`, 'utf8').toString('base64');
    }
}

export interface PromptCallbacks {
    onPromptStart(): void;
    onPromptStop(): void;
}

export class UserInputCredentialsLoader implements CredentialsLoader {
    constructor(private readonly progressInterruptor?: PromptCallbacks) {}

    public async loadCredentials(registryHost: string): Promise<Credentials | undefined> {
        this.progressInterruptor?.onPromptStart();

        const response = await inquirer.prompt<{ username: string; password: string }>([
            {
                type: 'input',
                name: 'username',
                message: `Username for docker registry '${registryHost}':`
            },
            {
                type: 'password',
                name: 'password',
                message: `Password:`
            }
        ]);

        this.progressInterruptor?.onPromptStop();

        return new LoginCredentials(response.username, response.password);
    }
}
