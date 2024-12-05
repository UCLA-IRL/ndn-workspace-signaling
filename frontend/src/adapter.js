import * as Y from 'yjs';
import * as A from 'y-protocols/awareness';
import * as W from './webrtc';

function insertByte(byte, arr) {
    const bigArr = new Uint8Array(arr.length + 1);
    bigArr.set(new Uint8Array([byte]));
    bigArr.set(arr, 1);

    return bigArr;
}

async function getByte(data) {
    let arr;

    try {
        arr = new Uint8Array(await data.arrayBuffer());
    } catch {
        arr = new Uint8Array(data);
    }

    return [arr.at(0), arr.slice(1)];
}

export class Adapter {
    doc
    awareness

    constructor(d) {
        this.doc = d;
        this.doc.on('update', u => {
            console.log(`Sending: ${u}`);
            W.broadcast(insertByte(1, u));
        });

        this.awareness = new A.Awareness(this.doc);
        this.awareness.on('update', ({ added, updated, removed }) => {
            const changedClients = added.concat(updated).concat(removed);
            const msg = A.encodeAwarenessUpdate(this.awareness, changedClients);

            W.broadcast(insertByte(2, msg));
        });

        W.start();
        W.setDataHandler(this.onUpdate.bind(this));
        W.setPeerHandler(this.onNewPeer.bind(this));
    }

    async onUpdate(peer, data) {
        const [byte, arr] = await getByte(data);
        console.log(`Received from ${peer}: Type ${byte}, ${arr}`);
        if (byte === 0) {
            W.send(peer, insertByte(1, Y.encodeStateAsUpdate(this.doc, arr)));
        } else if (byte === 1) {
            Y.applyUpdate(this.doc, arr);
        } else if (byte === 2) {
            A.applyAwarenessUpdate(this.awareness, arr, peer);
        }
    }

    onNewPeer(peer) {
        const sv = insertByte(0, Y.encodeStateVector(this.doc));
        console.log(`Peer ${peer} joined; sending ${sv}`);
        W.send(peer, sv);
    }

    static async create(d) {
        // Fetch current identity
        let userid = await fetch(`/email`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        }).then(res => {
            return res.json();
        }).then(json => {
            return json.email;
        });
        console.log(userid);
        await W.openDB();
        let status = await W.loadCert(userid);
        if (!status) {
            console.log('Issuing new certificate');
            await W.newCert(userid);
            await W.uploadCert();
            await W.saveCert(userid);
        } else {
            console.log('Reusing old certificate');
            // Always re-upload the cert, since the certDB is not persistent
            await W.uploadCert();
        }

        return new Adapter(d);
    }
}

