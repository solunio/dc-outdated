import axios from 'axios';
import { last as _last, merge as _merge } from 'lodash';
import { resolve as resolvePath } from 'path';
import { compare as semverCompare, maxSatisfying as semverMaxSatisfying, valid as semverValid } from 'semver';

import { readFile } from './utils';

export const DOCKER_REGISTRY_HOST = 'docker.io';

export interface DockerImage {
    name: string;
    tag?: string;
    host?: string;
}

export interface Credentials {
    getToken(): string;
}

interface TokenChellange {
    realm: string;
    service: string;
    scope: string;
}

function parseRealm(authenticateHeader: string): { [key: string]: string } {
    const validationRegex = new RegExp('Bearer ((.*?)="(.*?)"(,(.*?)="(.*?)")*)');
    const realmMatch = validationRegex.exec(authenticateHeader);
    if (!realmMatch) throw new Error(`Invalid response header '${authenticateHeader}'`);

    const realmInfo = realmMatch[1];

    const extractionRegex = new RegExp(',?(.*?)="(.*?)"', 'g');

    let match = extractionRegex.exec(realmInfo);
    const chellange: any = {};
    while (match !== null) {
        const key = match[1];
        const value = match[2];
        chellange[key] = value;
        match = extractionRegex.exec(realmInfo);
    }

    return chellange;
}

async function requestNew<T>(url: string, credentials: Credentials | undefined): Promise<T> {
    const firstResponse = await axios.get(url, {
        validateStatus: statusCode => (statusCode >= 200 && statusCode < 300) || statusCode === 401,
        timeout: 60000
    });

    if (firstResponse.status === 401) {
        const attributes = parseRealm(firstResponse.headers['www-authenticate']);

        const realm = attributes.realm;
        if (!realm) throw new Error('Invalid "www-authenticate" headers: Realm not provided!');
        const service = attributes.service;
        if (!service) throw new Error('Invalid "www-authenticate" headers: Service not provided!');
        const scope = attributes.scope;
        if (!scope) throw new Error('Invalid "www-authenticate" headers: Scope not provided!');

        if (!credentials) throw new Error(`Credentials required but not provided for request "${url}"`);

        const token = await getBearerToken(credentials, { realm, service, scope });

        const secondResponse = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            validateStatus: statusCode => statusCode >= 200 && statusCode < 300,
            timeout: 60000
        });

        return secondResponse.data;
    } else {
        return firstResponse.data;
    }
}

async function getBearerToken(credentials: Credentials, chellange: TokenChellange): Promise<string> {
    const response = await axios.get<{ token: string; expires_in: number; issued_at: string }>(
        `${chellange.realm}?service=${chellange.service}&scope=${chellange.scope}`,
        {
            headers: {
                Authorization: `Basic ${credentials.getToken()}`
            },
            validateStatus: statusCode => statusCode >= 200 && statusCode < 300,
            timeout: 60000
        }
    );

    return response.data.token;
}

export function parseDockerImage(imageString: string): DockerImage {
    let host: string;
    let name: string;
    let tag: string | undefined;

    const f = imageString.split(':');
    if (f.length > 1) {
        tag = f[1];
    }

    const g = f[0].split('/');
    if (g.length > 1) {
        if (g[0].indexOf('.') >= 0 || g[0].indexOf(':') >= 0) {
            name = g.slice(1).join('/');
            host = g[0];
        } else {
            name = g.join('/');
            host = DOCKER_REGISTRY_HOST;
        }
    } else {
        name = `library/${g[0]}`;
        host = DOCKER_REGISTRY_HOST;
    }

    const res: DockerImage = { name };

    if (tag) res.tag = tag;
    if (host) res.host = host;

    return res;
}

export async function listTags(credentialsStore: CredentialsStore, dockerImage: DockerImage): Promise<string[]> {
    const credentials = credentialsStore.getCredentials(dockerImage.host);
    const result = await requestNew<{ tags: string[] }>(
        `https://${dockerImage.host}/v2/${dockerImage.name}/tags/list`,
        credentials
    );
    return result.tags;
}

export async function listRepositories(registryHost: string, credentialsStore: CredentialsStore): Promise<string[]> {
    const result = await requestNew<{ repositories: string[] }>(
        `https://${registryHost}/v2/_catalog`,
        credentialsStore.getCredentials(registryHost)
    );
    return result.repositories;
}

export async function getLatestImageVersion(
    credentialsStore: CredentialsStore,
    dockerImage: DockerImage
): Promise<string | undefined> {
    const { latest } = await getImageUpdateTags(credentialsStore, dockerImage);
    return latest;
}

export async function getImageUpdateTags(
    credentialsStore: CredentialsStore,
    dockerImage: DockerImage
): Promise<{ wanted: string | undefined; latest: string | undefined }> {
    let wanted: string | undefined;
    let latest: string | undefined;
    const tags = await listTags(credentialsStore, dockerImage);
    if (tags) {
        const validTags = tags.filter(tag => semverValid(tag));
        validTags.sort(semverCompare);
        latest = _last(validTags);

        if (dockerImage.tag && semverValid(dockerImage.tag)) {
            wanted = semverMaxSatisfying(validTags, `^${dockerImage.tag}`) ?? undefined;
            if (!wanted) {
                wanted = dockerImage.tag;
            }
        }
    }

    return { wanted, latest };
}

export async function readDockerConfig(dockerConfigPath: string): Promise<any> {
    const data = await readFile(resolvePath(dockerConfigPath));
    return JSON.parse(data);
}

class DockerAuthCredentials implements Credentials {
    constructor(private dockerAuth: any) {}

    public getToken(): string {
        return this.dockerAuth.auth;
    }
}

export class CredentialsStore {
    private store = new Map<string, Credentials>();

    constructor(dockerConfig: any) {
        for (const host of Object.keys(dockerConfig.auths)) {
            this.addCredentials(host, new DockerAuthCredentials(dockerConfig.auths[host]));
        }
    }

    public getCredentials(registryHost: string | undefined): Credentials | undefined {
        if (!registryHost) return;
        return this.store.get(registryHost);
    }

    public addCredentials(registryHost: string, credentials: Credentials): void {
        this.store.set(registryHost, credentials);
    }
}
