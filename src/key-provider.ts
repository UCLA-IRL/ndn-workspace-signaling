import * as fs from 'fs';
import { randomBytes, randomInt } from 'crypto';

export interface KeyInfo {
    sequence: number;   // randomize, then monotonically increasing
    expiration: number; // Unix timestamp
    key: string;
}

/*
Period controls the approximate amount of time a key is valid for.
Tolerance controls the following things:
    * The maximum amount of time an expired key will be provided to the user after expiration so that it can process
      data encrypted with an old key.
    * The maximum earliness by which a new key will be provided before the previous key expires (so that
      clients with early clocks have something to encrypt with)
 */

interface KeyFile {
    period: number;
    tolerance: number;
    keys: KeyInfo[];
}

const filePath: string = "keyfile.json"
// Do not schedule Node.js callbacks to refresh the key too rapidly
const schedulingGranularity: number = 32; // ms

const defaultTolerance: number = 60;
const defaultPeriod: number = 3600;

function generateSequence(): number {
    // generates a random sequence number to start at.
    // this avoids sequence collision issues if the server ever loses its state
    return randomInt(2 ** 32);
}

function generateKey(): string {
    return randomBytes(32).toString('hex');
}

async function ensureFileExists(): Promise<void> {
    return fs.open(filePath, 'wx', (err, fd) => {
        if (err) {
            if (err.code === 'EEXIST') return;
            else throw err;
        }

        const fileTemplate: KeyFile = {
            period: defaultPeriod,
            tolerance: defaultTolerance,
            keys: [
                {
                    sequence: generateSequence(),
                    expiration: Math.floor((Date.now() / 1000)) + defaultPeriod,
                    key: generateKey()
                }
            ]
        }

        try {
            fs.write(fd, JSON.stringify(fileTemplate, null, 2), (err) => {
                if (err) throw err;
            });
        } finally {
            fs.close(fd, (err) => {
                if (err) throw err;
            });
        }
    })
}


async function readFile(): Promise<KeyFile> {
    return new Promise(async (resolve, reject) => {
        await ensureFileExists().catch(err => reject(err));

        fs.readFile(filePath, 'utf-8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                let keyFile: KeyFile = JSON.parse(data);
                resolve(keyFile);
            }
        });
    });
}


async function refreshKeys(): Promise<void> {
    let keyFile = await readFile();

    // Prune expired keys
    let currentKeys = keyFile.keys.filter(key => key.expiration >= (Date.now() / 1000) - keyFile.tolerance);

    // Check if a new key is needed
    if (currentKeys.length == 0 /* no current keys */ ||
    currentKeys[currentKeys.length - 1].expiration < (Date.now() / 1000) + keyFile.tolerance /* current key about to expire */)
    {
        currentKeys.push(
            {
                sequence: currentKeys.length == 0 ? generateSequence() : currentKeys[currentKeys.length - 1].sequence + 1,
                expiration: Math.floor((Date.now() / 1000)) + keyFile.period,
                key: generateKey()
            }
        )
    }

    keyFile.keys = currentKeys;

    // Refresh keys before the old one expires
    setTimeout(
        refreshKeys,
        Math.max(schedulingGranularity,
            (currentKeys[currentKeys.length - 1].expiration - keyFile.tolerance) * 1000 + schedulingGranularity - Date.now()
        )
    );

    // Write the updated data back to the JSON file
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, JSON.stringify(keyFile, null, 2), 'utf-8', (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export async function readKeys(): Promise<KeyInfo[]> {
    return new Promise((resolve, reject) => {
        readFile()
            .then(keyFile => resolve(keyFile.keys))
            .catch(err => reject(err));
    });
}

refreshKeys();
