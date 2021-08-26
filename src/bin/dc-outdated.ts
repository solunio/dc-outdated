#!/usr/bin/env node

import { Command } from 'commander';
import * as os from 'os';
import * as path from 'path';
import { listOutdated, Options } from '../lib';

const pkg = require('../../package.json');
interface CliOptions {
    readonly composeFile: string;
    readonly dockerConfig: string;
    readonly filter: string;
    readonly excludeOfficalsAndInvalids: boolean;
}

const program = new Command().version(pkg.version)
    .option('--compose-file <file path>', 'Path to the docker-compose file. Defaults to ./docker-compose.yml')
    .option('--docker-config <file path>', 'Path to the docker config file, from which authentication details taken. Defaults to ~/.docker/config.json')
    .option('-f --filter <string>', 'Filter string to optionally filter the list of checked-images. If specified, only images-names that contain the given search string will be checked')
    .option('-x --exclude-officals-and-invalids', 'When scanning the docker-compose.yml file, exclude all images from the offical docker registry, as well as images that do not have a semver compliant tag')
    .parse(process.argv);

const options: Options = {
    composeFilePath: './docker-compose.yml',
    dockerConfigPath: path.join(os.homedir(), '.docker', 'config.json')
};

const cliOptions = program.opts<CliOptions>();

if(cliOptions.composeFile) options.composeFilePath = cliOptions.composeFile;
if(cliOptions.dockerConfig) options.dockerConfigPath = cliOptions.dockerConfig;
if(cliOptions.filter) options.imagesFilter = cliOptions.filter;
if(cliOptions.excludeOfficalsAndInvalids) options.excludeOfficalsAndInvalids = true;


listOutdated(options)
    .catch(err => {
        console.error(`There was an error: ${err.message}`);
        process.exit(1);
    });
