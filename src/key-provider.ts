import * as fs from 'fs';

export interface KeyInfo {
    Sequence: number;
    Expiration: number; // Unix timestamp
    Key: string;
}

const filePath: string = "keyfile.json"

async function ensureFileExists(): Promise<void> {
    return fs.access(filePath, async (err) => {
        if (err)
        {
            return fs.writeFile(filePath, JSON.stringify([], null, 2), (err) => {
                if (err) throw err;
            });
        }
    });
}

export async function readKeys(): Promise<KeyInfo[]> {
    await ensureFileExists();

    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf-8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(JSON.parse(data) as KeyInfo[]);
            }
        });
    });
}

export async function insertKey(newRow: KeyInfo): Promise<void> {
    await ensureFileExists();

    const KeyInfos = await readKeys();

    // Append the new row
    KeyInfos.push(newRow);

    // Write the updated data back to the JSON file
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, JSON.stringify(KeyInfos, null, 2), 'utf-8', (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}
