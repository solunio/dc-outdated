import { Bar as CliProgressBar, Presets as CliProgressBarPresets } from 'cli-progress';
import EasyTable from 'easy-table';
import { diff as semverDiff, valid as semverValid } from 'semver';

import { CredentialsLoader, CredentialsStore } from './credentials';
import {
    DockerConfig,
    DockerConfigCredentialsLoader,
    UserInputCredentialsLoader
} from './credentials-loader-implementations';
import { getComposeImages } from './compose-utils';
import {
    DOCKER_REGISTRY_HOST,
    DockerImage,
    getImageUpdateTags,
    getLatestImageVersion,
    listRepositories
} from './docker-utils';
import { readJsonFile } from './utils';

// only for testing purposes

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
    wantedPatchVersion: string;
    wantedMinorVersion: string;
    latestVersion: string;
}

class ProgressBarWrapper {
    private readonly progressBar: CliProgressBar;

    private progressInformation: { total: number; current: number } | undefined;

    constructor() {
        this.progressBar = new CliProgressBar({}, CliProgressBarPresets.shades_classic);
    }

    public start(total: number, initialValue: number): void {
        this.progressInformation = { total, current: initialValue };
        this.progressBar.start(total, initialValue);
    }

    public stop(): void {
        this.progressBar.stop();
    }

    public pause(): void {
        this.progressBar.stop();
    }

    public resume(): void {
        if (this.progressInformation == null) throw new Error('Progressbar was never started');
        this.progressBar.start(this.progressInformation.total, this.progressInformation.current);
    }

    public increment(inc: number): void {
        if (this.progressInformation == null) throw new Error('Progressbar was never started');
        this.progressInformation = {
            total: this.progressInformation.total,
            current: this.progressInformation.current + inc
        };

        this.progressBar.increment(inc);
    }
}

export async function listOutdated(options: Options): Promise<OutdatedImage[]> {
    const progressBar = new ProgressBarWrapper();

    const credentialsLoaders: CredentialsLoader[] = [];

    try {
        const config = await readJsonFile<DockerConfig>(options.dockerConfigPath);
        credentialsLoaders.push(new DockerConfigCredentialsLoader(config));
    } catch (err) {
        console.error('Error while trying to add credentials-loader from docker config file. Skipping...', err);
    }

    credentialsLoaders.push(
        new UserInputCredentialsLoader({
            onPromptStart: () => progressBar.pause(),
            onPromptStop: () => progressBar.resume()
        })
    );

    const credentials = new CredentialsStore(credentialsLoaders);
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
            if (composeImage.host && composeImage.host === DOCKER_REGISTRY_HOST) continue;
            if (!semverValid(composeImage.tag)) continue;
        }
        filteredImages.push(composeImage);
    }
    const outdatedImages: OutdatedImage[] = [];
    progressBar.start(filteredImages.length, 0);

    try {
        for (const image of filteredImages) {
            const { latest, wantedMinor, wantedPatch } = await getImageUpdateTags(credentials, image);

            if (image.tag) {
                const wantedPatchDiff = wantedPatch && semverDiff(image.tag, wantedPatch);
                const wantedMinorDiff = wantedMinor && semverDiff(image.tag, wantedMinor);
                const latestDiff = latest && semverDiff(image.tag, latest);
                if (wantedPatchDiff || wantedMinorDiff || latestDiff) {
                    outdatedImages.push({
                        image,
                        wantedPatchVersion: wantedPatch || 'NA',
                        wantedMinorVersion: wantedMinor || 'NA',
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

    outdatedImages.forEach(({ image, wantedPatchVersion, wantedMinorVersion, latestVersion }) => {
        table.cell('Image', image.name);
        table.cell('Current', image.tag);
        table.cell('Wanted[~]', wantedPatchVersion);
        table.cell('Wanted[^]', wantedMinorVersion);
        table.cell('Latest', latestVersion);
        table.newRow();
    });

    console.log(table.toString());

    return outdatedImages;
}

//listOutdated().catch(err => console.log('Error during execution: ', err));
