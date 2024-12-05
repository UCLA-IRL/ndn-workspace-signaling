import { io } from 'socket.io-client';

// ========================== Certificate Management ==========================
let certDB = null;
let localCert = null;
let localUser= null;

// Utilities
function getCertificateChecksumFromSDP(desc) {
    let fp = desc.sdp.split('\n').reduce((res, curr) =>
        curr.startsWith('a=fingerprint:sha-256 ') ? curr : res, null);
    console.assert(fp !== null, 'Description does not have a sha256sum');
    return fp.trim().split(' ')[1].split(':').join('').toLowerCase();
}

async function getCertificateChecksum(cert) {
    if (cert.getFingerprints) {
        let fp = cert.getFingerprints().reduce((res, curr) =>
            curr.algorithm === 'sha-256' ? curr : res, null);
        console.assert(fp !== null, 'Certificate does not have a sha256sum');
        return fp.value.split(':').join('');
    } else {  // Firefox shim
        let testConn = new RTCPeerConnection({ certificates: [cert] });
        let desc = await testConn.createOffer();
        testConn.close();
        return getCertificateChecksumFromSDP(desc);
    }
}

// IndexedDB
function openCertDatabase(onSuccess, onError) {
    let req = window.indexedDB.open('webrtc-poc', 1);
    req.onupgradeneeded = () => {
        console.log('Initializing new IndexedDB');
        let db = req.result;
        let certStore = db.createObjectStore('dtlsCerts', { keyPath: 'id' });
        certStore.createIndex('by_id', 'id');
    };
    req.onsuccess = () => onSuccess(req.result);
    req.onerror = () => onError(req.error);
}

function saveCertificate(db, key, cert, onSuccess, onError) {
    let certTx = db.transaction('dtlsCerts', 'readwrite');
    let certStore = certTx.objectStore('dtlsCerts');
    let certPut = certStore.put({
        id: key,
        cert: cert,
    });
    certPut.onsuccess = onSuccess;
    certPut.onerror = () => onError(certPut.error);
}

function loadCertificate(db, key, onSuccess, onError) {
    let certTx = db.transaction('dtlsCerts', 'readonly');
    let certStore = certTx.objectStore('dtlsCerts');
    let certGet = certStore.get(key)
    certGet.onsuccess = () => {
        let match = certGet.result;
        if (match !== undefined) {
            onSuccess(match.cert);
        } else {
            onSuccess(null);
        }
    };
    certGet.onerror = () => onError(certGet.error);
}

// ========================== Interface ==========================

export function loadCert(key) {
    console.assert(certDB !== null, 'IndexedDB not available');

    return new Promise((res, rej) => {
        loadCertificate(certDB, key,
            cert => {
                if (cert !== null) {
                    getCertificateChecksum(cert).then(fp => {
                        let exp = new Date(cert.expires);
                        if (exp < new Date()) {
                            console.log("Certificate expired");
                            res(false); return;
                        }
                        let ts = new Date(cert.expires).toISOString();
                        console.log(`Loaded certificate (expires ${ts}): ${fp}`);
                    });
                    localCert = cert;
                    res(true);
                } else {
                    console.log('Load Failed (No Certificate Found)');
                    res(false);
                }
            },
            err => {
                console.log(`Load Failed (${err})`);
                rej(err);
            },
        );
    });
}

export function saveCert(key) {
    console.assert(localCert !== null, 'No local certificate available');
    console.assert(certDB !== null, 'IndexedDB not available');

    return new Promise((res, rej) => {
        saveCertificate(certDB, key, localCert,
            () => {
                res(true)
            },
            err => {
                rej(err)
            },
        );
    });
}

export async function newCert() {
    const cert = await RTCPeerConnection.generateCertificate({
        name: 'ECDSA',
        hash: 'SHA-256',
        namedCurve: 'P-256',
    });
    const fp = await getCertificateChecksum(cert)
    let ts = new Date(cert.expires).toISOString();
    console.log(`Generated new certificate (expires ${ts}): ${fp}`);
    localCert = cert;
}

export async function uploadCert() {
    console.assert(localCert !== null, 'No local certificate available');
    const fp = await getCertificateChecksum(localCert);
    const res = await fetch('/keys', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            'key': fp,
            'expires': localCert.expires,
        }),
    })

    if (res.status !== 200) {
        throw Error('Could not upload certificate');
    }

    console.log("Cert uploaded");

}

export function clearCert() {
    console.assert(localCert !== null, 'No local certificate available');
    getCertificateChecksum(localCert).then(fp => {
        fetch(`/keys/${fp}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        }).then(res => {
            if (res.status === 200) {
                localCert = null;
            } else {
                throw Error('Could not delete certificate');
            }
        });
    });
}

export function openDB() {
    return new Promise((res, rej) => {
        openCertDatabase(
            db => {
                console.assert(certDB === null, 'IndexedDB already open');
                certDB = db;
                console.log('IndexedDB opened.');
                res();
            },
            err => {
                console.error(`IndexedDB open error: ${err}`);
                rej(err);
            }
        );
    });
}



export function start(userid) {
    console.assert(localCert !== null, 'No local certificate available');
    console.assert(Object.keys(activeConnection).length === 0, 'Local connection exists');
    console.assert(Object.keys(activeChannel).length === 0, 'Local channel exists');

    localUser = userid;

    socket = io(window.location.protocol + '//' + window.location.host);
    socket.on('join-init', onPeerJoinInit);
    socket.on('join-offer', onPeerOfferAvailable);
    socket.on('join-answer', onPeerAnswerAvailable);
    socket.on('join', onPeerJoinAvailable);
    socket.on('connect', () => { console.log("Connected to signaling server") });
}

export function end() {
    if (socket !== null) {
        socket.disconnect();
        socket = null;
    }

    for (let peer in activeChannel) {
        activeChannel[peer].close();
    }
    activeChannel = {};

    for (let peer in activeConnection) {
        activeConnection[peer].close();
    }
    activeConnection = {};

    localDesc = {};
    remoteDesc = {};
}

export function broadcast(data) {
    console.log(`BROAD ${data}`);
    for (let peer in activeChannel) {
        try {
            activeChannel[peer].send(data);
        } catch {
            delete localDesc[peer];
            delete remoteDesc[peer];
            delete activeConnection[peer];
            delete activeChannel[peer];
        }
    }
}

export function send(peer, data) {
    console.log(`SEND ${peer}: ${data}`)
    try {
        activeChannel[peer].send(data);
    } catch {
        delete localDesc[peer];
        delete remoteDesc[peer];
        delete activeConnection[peer];
        delete activeChannel[peer];
    }
}

let dataHandler;
export function setDataHandler(dh) {
    dataHandler = dh;
}

let peerHandler;
export function setPeerHandler(ph) {
    peerHandler = ph;
}

// =============================== Peer Control ===============================
let socket = null;
let localDesc = {};
let remoteDesc = {};
let activeConnection = {};
let activeChannel = {};
let deferredCandidates = {};

function verifyFingerprint(desc, peer) {
    let fp = getCertificateChecksumFromSDP(desc);
    fetch(`/keys/${fp}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
    }).then(res => {
        if (res.status !== 200) {
            console.log(`${peer}: Unauthorized certificate detected! Terminating connection...`);
            alert(`Terminating unauthorized session ${peer}.`);

            delete localDesc[peer];
            delete remoteDesc[peer];
            delete activeConnection[peer];
            delete activeChannel[peer];
        }
        return res.json();
    }).then(json => {
        if (json.user !== remoteDesc[peer].user) {
            console.log(`${peer}: Incorrect user detected! Terminating connection...`);
            alert(`Terminating unauthorized session ${peer}.`);

            delete localDesc[peer];
            delete remoteDesc[peer];
            delete activeConnection[peer];
            delete activeChannel[peer];
        }
    });
}

function onPeerOfferAvailable(msg) {
    let msgParse = JSON.parse(msg)
    let peer = msgParse.src
    console.log(`Received WebRTC connection offer from ${peer}`);

    // Ignore subsequent requests
    if (peer in remoteDesc) return;
    console.log('Sending answer...');

    if (!(peer in localDesc)) {
        sendOffer(peer, false);
    }

    if (peer in activeChannel) {
        activeChannel[peer].close();
        delete activeChannel[peer];
    }

    remoteDesc[peer] = JSON.parse(msg);
    verifyFingerprint(remoteDesc[peer].desc, peer);
    activeConnection[peer].setRemoteDescription(remoteDesc[peer].desc).then(() => {
        return activeConnection[peer].createAnswer();
    }).then(answer => {
        localDesc[peer] = { src: socket.id, user: localUser, dst: remoteDesc[peer].src, desc: answer };
        return activeConnection[peer].setLocalDescription(localDesc[peer].desc);
    }).then(() => {
        socket.emit('join-answer', JSON.stringify(localDesc[peer]));
        for (let candidate of deferredCandidates[peer]) {
            activeConnection[peer].addIceCandidate(candidate);
        }
        deferredCandidates[peer] = [];
    });
}

function onPeerAnswerAvailable(msg) {
    let currDesc = JSON.parse(msg);
    let peer = currDesc.src;
    console.log('Received WebRTC connection answer...');

    if (peer in remoteDesc) return;
    console.assert(peer in localDesc, 'No local description available');

    remoteDesc[peer] = currDesc;
    verifyFingerprint(remoteDesc[peer].desc, peer);
    activeConnection[peer].setLocalDescription(localDesc[peer].desc).then(() => {
        return activeConnection[peer].setRemoteDescription(remoteDesc[peer].desc);
    }).then(() => {
        for (let candidate of deferredCandidates[peer]) {
            activeConnection[peer].addIceCandidate(candidate);
        }
        deferredCandidates[peer] = []
    });
}

function onPeerJoinAvailable(msg) {
    let candidate = JSON.parse(msg);
    let peer = candidate.src;
    if (peer in remoteDesc && candidate.dst === localDesc[peer].src) {
        if (activeConnection[peer].remoteDescription) {
            console.log('Received WebRTC ICE candidate info, registering...');
            activeConnection[peer].addIceCandidate(candidate.candidate);
        } else {
            console.log('Received WebRTC ICE candidate info, deferring registration...');
            deferredCandidates[peer].push(candidate.candidate);
        }
    } else if (candidate.src === remoteDesc[peer].src) {
        delete localDesc[peer];
        delete remoteDesc[peer];
        delete activeConnection[peer];
        delete activeChannel[peer];

        sendOffer(peer);
    }
}

function onPeerAvailable(event, peer) {
    console.assert(peer in remoteDesc, 'No remote description available');
    if (event.candidate) {
        console.log('Sending WebRTC ICE candidate info...');
        socket.emit('join', JSON.stringify({
            src: localDesc[peer].src,
            dst: remoteDesc[peer].src,
            candidate: event.candidate
        }));
    }
}

function registerChannelHandlers(channel, peer) {
    channel.addEventListener('open', () => {
        peerHandler(peer);
        console.log(`User ${peer} joined.`);
        channel.addEventListener('close', () => {
            console.log(`User ${peer} disconnected.`);
            delete localDesc[peer];
            delete remoteDesc[peer];
            delete activeConnection[peer];
            delete activeChannel[peer];
        })
    });
    channel.addEventListener('message', event => {
        console.log(`RECV ${peer}`)
        dataHandler(peer, event.data)
    });
}

function onRTCConnectionStateChange(event, peer) {
    let connection = event.target
    let state = connection.connectionState;

    console.log('WebRTC connection state update:', state);
    if (state === 'failed') {
        delete localDesc[peer];
        delete remoteDesc[peer];
        delete activeConnection[peer];
        delete activeChannel[peer];
    }
}

function onPeerJoinInit(msg) {
    let dst = JSON.parse(msg).src;
    console.log(dst);

    sendOffer(dst);
}

function sendOffer(peer, send = true) {
    let rtcCfg = {
        iceServers: [{ urls: `stun:${window.location.hostname}:3478` }],
        certificates: [localCert],
    };
    activeConnection[peer] = new RTCPeerConnection(rtcCfg);
    activeConnection[peer].addEventListener('icecandidate', (e) => onPeerAvailable(e, peer));
    activeConnection[peer].addEventListener('connectionstatechange', (e) => onRTCConnectionStateChange(e, peer));
    activeConnection[peer].addEventListener('datachannel', event => {
        activeChannel[peer] = event.channel;
        registerChannelHandlers(activeChannel[peer], peer)
    });
    activeChannel[peer] = activeConnection[peer].createDataChannel('chatChannel');
    registerChannelHandlers(activeChannel[peer], peer);
    activeConnection[peer].createOffer().then(offer => {
        localDesc[peer] = { src: socket.id, user: localUser, desc: offer, dst: peer };
        // Send join offer
        if (send) {
            console.log('Sending WebRTC connection offer...');
            socket.emit('join-offer', JSON.stringify(localDesc[peer]));
        }
    })
    deferredCandidates[peer] = []
}

