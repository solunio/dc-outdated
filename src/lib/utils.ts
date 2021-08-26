import { readFile as fsReadFile } from 'fs';

export async function readFile(filePath: string): Promise<string> {
    return new Promise<any>((resolve, reject) => {
        fsReadFile(filePath, 'utf8', (err, data) => {
            if (err) return reject(err);
            return resolve(data);
        });
    });
}
