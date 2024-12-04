export interface CertInfo {
    user: string;       // user ID or email
    expiration: number; // Unix timestamp
    key: string;        // fp
}

// Do not schedule Node.js callbacks to refresh the key too rapidly
const schedulingGranularity: number = 60 * 1000; // ms

// Do not immediately delete keys as soon as they expire
const expirationGranularity: number = 300; // s

const certs: CertInfo[] = [];

export async function addCert(cert: CertInfo): Promise<void> {
    certs.push(cert);
}

export async function getAllCerts(): Promise<CertInfo[]> {
    return certs 
}

export async function getCert(user: string): Promise<CertInfo | null> {
    for (let cert of certs) {
        if (cert.user == user) {
            return cert; 
        }
    }

    return null;
}

export async function getCertByFP(fp: string): Promise<CertInfo | null> {
    for (let cert of certs) {
        if (cert.key == fp) {
            return cert; 
        }
    }

    return null;
}

export async function removeCert(user: string, key: string): Promise<void> {
    for (let cert of certs) {
        if (cert.user === user && cert.key === key) {
            certs.splice(certs.indexOf(cert), 1);
            return;
        }
    }

    throw new Error("No key with that user and fingerprint found.");
}

async function removeExpiredCerts(): Promise<void> {
    const now = Date.now() / 1000;
    certs.forEach(cert => {
        if (now - cert.expiration > expirationGranularity) {
            certs.splice(certs.indexOf(cert), 1);
        }
    });
}

setTimeout(removeExpiredCerts, schedulingGranularity);
