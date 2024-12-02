import * as Y from 'yjs';
import * as W from './webrtc';

class Adapter {
    doc
    state

    constructor(d) {
        this.doc = d;

    }

    onUpdate(data) {
        
    }

    async create(d) {
        await W.newCert();
        await W.uploadCert();
        await W.start();

        W.setDataHandler(this.onUpdate);

        return new Adapter(d);
    }
}

