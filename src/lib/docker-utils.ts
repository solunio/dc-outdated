import * as _ from 'lodash';
import * as path from 'path';
import * as request from 'request';
import * as semver from 'semver';
import { readFile } from './utils';


export const DEFAULT_REGISTRY_HOST = 'registry-1.docker.io';

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

type StatusCodeValidator = (statusCode: number) => boolean;

const successStatusCodeValidator = (statusCode: number) => {
    return statusCode >= 200 && statusCode < 300;
}


async function sendRequest(options: any, statusCodeValidator?: StatusCodeValidator): Promise<{ response: any, body: any }> {
    const { body, response } = await new Promise<{ response: any, body: any }>((resolve, reject) => {
        request(options, (err, response, body) => {
            if (err) return reject(err);
            return resolve({ response, body });
        })
    });

    if (!response) throw new Error(`No response for request '${options.url}'!`);
    if (!response.statusCode) throw new Error(`No status-code in response for request '${options.url}'!`);
    if (statusCodeValidator && !statusCodeValidator(response.statusCode)) {
        throw new Error(`Got invalid status-code '${response.statusCode}' for request '${options.url}'!`);
    }

    return { body, response };
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

async function requestNew(options: any, credentials: Credentials): Promise<any> {
    const allowUnauthenticated = (statusCode: number) => (successStatusCodeValidator(statusCode) || statusCode === 401);

    const { response, body } = await sendRequest(options, allowUnauthenticated);

    if (response.statusCode === 401) {
        const attributes = parseRealm(response.headers['www-authenticate']);

        const realm = attributes.realm;
        if (!realm) throw new Error('Invalid "www-authenticate" headers: Realm not provided!');
        const service = attributes.service;
        if (!service) throw new Error('Invalid "www-authenticate" headers: Service not provided!');
        const scope = attributes.scope;
        if (!scope) throw new Error('Invalid "www-authenticate" headers: Scope not provided!');

        if (!credentials) throw new Error(`Credentials required but not provided for request "${options.url}"`);

        const token = await getBearerToken(credentials, { realm, service, scope });

        return sendRequest(_.merge({}, options, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }), successStatusCodeValidator);
    } else {
        return { response, body };
    }
}


async function getBearerToken(credentials: Credentials, chellange: TokenChellange): Promise<string> {

    const options = {
        method: 'GET',
        headers: {
            Authorization: `Basic ${credentials.getToken()}`
        },
        url: `${chellange.realm}?service=${chellange.service}&scope=${chellange.scope}`
    };

    const { body } = await sendRequest(options, successStatusCodeValidator);
    return JSON.parse(body).token;
}

export function parseDockerImage(imageString: string): DockerImage {

    let host: string;
    let name: string;
    let tag: string;

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
            host = DEFAULT_REGISTRY_HOST
        }
    } else {
        name = `library/${g[0]}`;
        host = DEFAULT_REGISTRY_HOST
    }

    const res: DockerImage = { name };

    if (tag) res.tag = tag;
    if (host) res.host = host;

    return res;
}


export async function listTags(credentialsStore: CredentialsStore, dockerImage: DockerImage): Promise<string[]> {
    const defaultOptions = {
        method: 'GET',
        url: `https://${dockerImage.host}/v2/${dockerImage.name}/tags/list`
    };


    const credentials = credentialsStore.getCredentials(dockerImage.host);
    const { body } = await requestNew(defaultOptions, credentials);
    return JSON.parse(body).tags;
}

export async function listRepositories(registryHost: string, credentialsStore: CredentialsStore): Promise<string[]> {
    const defaultOptions = {
        method: 'GET',
        url: `https://${registryHost}/v2/_catalog`
    };


    const { body } = await requestNew(defaultOptions, credentialsStore.getCredentials(registryHost));

    return JSON.parse(body).repositories;
}

export async function getLatestImageVersion(credentialsStore: CredentialsStore, dockerImage: DockerImage): Promise<string> {
    const {latest} = await getImageUpdateTags(credentialsStore, dockerImage);
    return latest;
}

export async function getImageUpdateTags(credentialsStore: CredentialsStore, dockerImage: DockerImage): Promise<{wanted: string, latest: string}> {
    let wanted;
    let latest;
    const tags = await listTags(credentialsStore, dockerImage);
    if(tags) {
        const validTags = tags.filter(semver.valid);
        validTags.sort(semver.compare);
        latest = _.last(validTags);

        if(dockerImage.tag && semver.valid(dockerImage.tag)) {
            wanted = semver.maxSatisfying(validTags, `^${dockerImage.tag}`);
        }
    }


    return {wanted, latest}
}

export async function readDockerConfig(dockerConfigPath: string): Promise<any> {
    const data = await readFile(path.resolve(dockerConfigPath));
    return JSON.parse(data);
}

class DockerAuthCredentials implements Credentials {
    constructor(private dockerAuth: any) { }

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

    public getCredentials(registryHost: string): Credentials {
        if (!registryHost) return;
        return this.store.get(registryHost);
    }

    public addCredentials(registryHost: string, credentials: Credentials): void {
        this.store.set(registryHost, credentials);
    }
}
