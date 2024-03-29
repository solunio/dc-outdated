import { load as loadYaml } from 'js-yaml';
import { resolve as resolvePath } from 'path';

import { DockerImage, parseDockerImage } from './docker-utils';
import { readFile } from './utils';

async function readComposeFile(composeFilePath: string): Promise<any> {
    const data = await readFile(resolvePath(composeFilePath));
    return loadYaml(data);
}

export async function getComposeImages(composeFilePath: string): Promise<DockerImage[]> {
    const composeFile = await readComposeFile(composeFilePath);

    const res: DockerImage[] = [];

    for (const serviceName of Object.keys(composeFile.services)) {
        const serviceConfig = composeFile.services[serviceName];

        //console.log(`${serviceName}: ${serviceConfig.image}`);
        res.push(parseDockerImage(serviceConfig.image));
    }
    return res;
}
