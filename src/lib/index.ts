import * as cliProgress from 'cli-progress';
import * as EasyTable from 'easy-table';
import * as semver from 'semver';
import { getComposeImages } from './compose-utils';
import { Credentials, CredentialsStore, DockerImage, getLatestImageVersion, listRepositories, readDockerConfig } from './docker-utils';



// only for testing purposes
class LoginCredentials implements Credentials {
    constructor(private username: string, private password: string) { }

    public getToken(): string {
        return new Buffer(`${this.username}:${this.password}`).toString('base64');
    }
}



async function listLatestImageVersions(registryHost: string, credentials: CredentialsStore, filter?: string): Promise<DockerImage[]> {
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
}

export interface OutdatedImage {
    image: DockerImage;
    versionDiff: string;
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
        filteredImages.push(composeImage);
    }
    const outdatedImages: OutdatedImage[] = [];
    const progressBar = new (cliProgress.Bar)({}, cliProgress.Presets.shades_classic);
    progressBar.start(filteredImages.length, 0);

    try {
        for (const image of filteredImages) {
            const latestVersion = await getLatestImageVersion(credentials, image);
    
            const versionDiff = semver.diff(image.tag, latestVersion);
            if (versionDiff) {
                outdatedImages.push({
                    image,
                    versionDiff,
                    latestVersion
                });
            }
            progressBar.increment(1);
        }
        progressBar.stop();
    } catch(err) {
        progressBar.stop();
        throw err;
    }

    const table = new EasyTable();

    outdatedImages.forEach(({image, versionDiff, latestVersion}) => {
        table.cell('Image', image.name);
        table.cell('Upgrade Type', versionDiff);
        table.cell('Current Version', image.tag);
        table.cell('Latest Version', latestVersion);
        table.newRow();
    });

    console.log(table.toString());

    return outdatedImages;
}





//listOutdated().catch(err => console.log('Error during execution: ', err));
