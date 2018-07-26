#!/usr/bin/env node

import * as program from 'commander';
import * as os from 'os';
import * as path from 'path';
import { listOutdated, Options } from '../lib';

const pkg = require('../../package.json');

program.version(pkg.version)
    .option('--compose-file <file path>', 'Path to the docker-compose file. Defaults to ./docker-compose.yml')
    .option('--docker-config <file path>', 'Path to the docker config file, from which authentication details taken. Defaults to ~/.docker/config.json')
    .option('-f --filter <string>', 'Filter string to optionally filter the list of checked-images. If specified, only images-names that contain the given search string will be checked')
    .parse(process.argv);

const options: Options = {
    composeFilePath: './docker-compose.yml',
    dockerConfigPath: path.join(os.homedir(), '.docker', 'config.json')
};

if(program.composeFile) options.composeFilePath = program.composeFile;
if(program.dockerConfig) options.dockerConfigPath = program.dockerConfig;
if(program.filter) options.imagesFilter = program.filter;


listOutdated(options)
    .catch(err => {
        console.error(`There was an error: ${err.message}`);
        process.exit(1);
    });
