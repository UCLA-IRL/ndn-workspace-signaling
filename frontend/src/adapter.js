import * as Y from 'yjs';
import * as A from 'y-protocols/awareness';
import * as W from './webrtc';

function insertByte(byte, arr) {
    const bigArr = new Uint8Array(arr.length + 1);
    bigArr.set(byte);
    bigArr.set(arr, 1);

    return bigArr;
}

function getByte(arr) {
    return [arr.at(0), arr.slice(1)];
}

export class Adapter {
    doc
    awareness

    constructor(d) {
        this.doc = d;
        this.doc.on('update', u => {
            W.broadcast(insertByte(1, u));
        });

        this.awareness = new A.Awareness(doc);
        this.awareness.on('update', ({ added, updated, removed }) => { 
            const changedClients = added.concat(updated).concat(removed);
            const msg = A.encodeAwarenessUpdate(this.awareness, changedClients);

            W.broadcast(insertByte(2, msg));
        });
    }

    onUpdate(peer, data) {
        const [byte, arr] = getByte(data);
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
        W.send(peer, sv);
    }

    async create(d) {
        if (!(await W.loadCert())) {
            await W.newCert();
            await W.uploadCert();
            await W.saveCert();
        }
        W.start();
        W.setDataHandler(this.onUpdate);
        W.setPeerHandler(this.onNewPeer);

        return new Adapter(d);
    }
}

