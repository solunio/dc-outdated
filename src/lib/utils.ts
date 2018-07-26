import * as fs from 'fs';

export async function readFile(filePath: string): Promise<string> {
    return new Promise<any>((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) return reject(err);
            return resolve(data);
        });
    });
}
