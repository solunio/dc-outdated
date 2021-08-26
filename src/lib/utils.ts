import { readFile as fsReadFile } from 'fs';
import { resolve as resolvePath } from 'path';

export async function readFile(filePath: string): Promise<string> {
    return new Promise<any>((resolve, reject) => {
        fsReadFile(filePath, 'utf8', (err, data) => {
            if (err) return reject(err);
            return resolve(data);
        });
    });
}

export async function readJsonFile<T>(configPath: string): Promise<T> {
    const data = await readFile(resolvePath(configPath));
    return JSON.parse(data);
}
