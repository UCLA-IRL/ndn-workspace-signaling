export interface CertInfo {
    host: string;       // IP address
    user: string;       // user ID or email
    expiration: number; // Unix timestamp
    key: string;        // fp
}

// Do not schedule Node.js callbacks to refresh the key too rapidly
const schedulingGranularity: number = 60 * 1000; // ms

// Do not immediately delete keys as soon as they expire
const expirationGranularity: number = 300; // s

// key: "user/ip"
// value: CertInfo
const certs: Map<string, CertInfo> = new Map();

export async function addCert(cert: CertInfo): Promise<void> {
    certs.set(cert.host + '/' + cert.user, cert);
}

export async function getAllCerts(): Promise<CertInfo[]> {
    return Array.from(certs.values());
}

export async function getCert(host: string, user: string): Promise<CertInfo> {
    const result = certs.get(host + '/' + user);
    if (result === undefined) {
        throw new Error("No key for found for host and user.");
    }

    return result;
}

export async function removeCert(user: string, key: string): Promise<void> {
    for (const [k, v] of certs) {
        if (v.user === user && v.key === key) {
            certs.delete(k);
            return;
        }
    }

    throw new Error("No key with that user and fingerprint found.");
}

async function removeExpiredCerts(): Promise<void> {
    const now = Date.now() / 1000;
    certs.forEach((cert, key) => {
        if (now - cert.expiration > expirationGranularity) {
            certs.delete(key);
        }
    });
}

setTimeout(removeExpiredCerts, schedulingGranularity);
