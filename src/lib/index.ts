import { Bar as CliProgressBar, Presets as CliProgressBarPresets } from 'cli-progress';
import EasyTable from 'easy-table';
import { diff as semverDiff, valid as semverValid } from 'semver';

import { getComposeImages } from './compose-utils';
import {
    Credentials,
    CredentialsStore,
    DEFAULT_REGISTRY_HOST,
    DockerImage,
    getImageUpdateTags,
    getLatestImageVersion,
    listRepositories,
    readDockerConfig
} from './docker-utils';

// only for testing purposes
class LoginCredentials implements Credentials {
    constructor(private username: string, private password: string) {}

    public getToken(): string {
        return Buffer.from(`${this.username}:${this.password}`, 'utf8').toString('base64');
    }
}

async function listLatestImageVersions(
    registryHost: string,
    credentials: CredentialsStore,
    filter?: string
): Promise<DockerImage[]> {
    const repos = await listRepositories(registryHost, credentials);
    console.log(`Loaded ${repos.length} repos from registry`);
    const res: DockerImage[] = [];

    const filteredRepos = filter ? repos.filter(r => r.indexOf(filter) >= 0) : [...repos];

    console.log(`Fetching latest tag for ${filteredRepos.length} respositories`);
    for (const repo of filteredRepos) {
        const latest = await getLatestImageVersion(credentials, {
            name: repo,
            host: registryHost
        });
        res.push({
            host: registryHost,
            name: repo,
            tag: latest
        });
    }
    return res;
}

export interface Options {
    composeFilePath: string;
    dockerConfigPath: string;
    imagesFilter?: string;
    excludeOfficalsAndInvalids?: boolean;
}

export interface OutdatedImage {
    image: DockerImage;
    wantedVersion: string;
    latestVersion: string;
}

export async function listOutdated(options: Options): Promise<OutdatedImage[]> {
    const config = await readDockerConfig(options.dockerConfigPath);
    const credentials = new CredentialsStore(config);
    // const res = await listLatestImageVersions('docker.solunio.com', credentials, 'common')
    // console.log('res: ', res);

    const composeImages = await getComposeImages(options.composeFilePath);
    // console.log('composeFile', composeFile);

    const filteredImages: DockerImage[] = [];

    for (const composeImage of composeImages) {
        if (!composeImage.tag) continue;
        if (options.imagesFilter) {
            let fullImageName = composeImage.name;
            if (composeImage.host) fullImageName = `${composeImage.host}/${fullImageName}`;
            if (!fullImageName.includes(options.imagesFilter)) continue;
        }
        if (options.excludeOfficalsAndInvalids) {
            if (composeImage.host && composeImage.host === DEFAULT_REGISTRY_HOST) continue;
            if (!semverValid(composeImage.tag)) continue;
        }
        filteredImages.push(composeImage);
    }
    const outdatedImages: OutdatedImage[] = [];
    const progressBar = new CliProgressBar({}, CliProgressBarPresets.shades_classic);
    progressBar.start(filteredImages.length, 0);

    try {
        for (const image of filteredImages) {
            const { latest, wanted } = await getImageUpdateTags(credentials, image);

            if (image.tag) {
                const wantedDiff = wanted && semverDiff(image.tag, wanted);
                const latestDiff = latest && semverDiff(image.tag, latest);
                if (wantedDiff || latestDiff) {
                    outdatedImages.push({
                        image,
                        wantedVersion: wanted || 'NA',
                        latestVersion: latest || 'NA'
                    });
                }
            } else {
                console.warn(`Skipping image '${image.name}' since we cannot determine its tag!`);
            }
            progressBar.increment(1);
        }
        progressBar.stop();
    } catch (err) {
        progressBar.stop();
        throw err;
    }

    const table = new EasyTable();

    outdatedImages.forEach(({ image, wantedVersion, latestVersion }) => {
        table.cell('Image', image.name);
        table.cell('Current', image.tag);
        table.cell('Wanted[^]', wantedVersion);
        table.cell('Latest', latestVersion);
        table.newRow();
    });

    console.log(table.toString());

    return outdatedImages;
}

//listOutdated().catch(err => console.log('Error during execution: ', err));
