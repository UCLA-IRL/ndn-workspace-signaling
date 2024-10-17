import * as fs from 'fs';

const filename: string = "KEYFILE"

function writeKey(seq: number, expiration: Date, key: string): void {
    try {
        const data = `${seq}\n${expiration.toISOString()}\n${key}\n`;  // Date stored as ISO string
        fs.writeFileSync(filename, data, 'utf8');
    } catch (err) {
        console.error('Error writing to file:', err);
    }
}

function readKey(): { seq: number; expiration: Date; key: string } | null {
    try {
        const data: string = fs.readFileSync(filename, 'utf8');
        const [seqStr, expirationStr, key] = data.split('\n').map(line => line.trim());

        const seq: number = parseInt(seqStr, 10);  // Convert string to integer
        const expiration: Date = new Date(expirationStr);        // Convert string to Date
        return { seq, expiration, key };
    } catch (err) {
        console.error('Error reading from file:', err);
        return null;
    }
}