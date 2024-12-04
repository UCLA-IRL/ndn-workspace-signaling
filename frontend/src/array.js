import { Adapter } from './adapter.js';
import * as Y from 'yjs';

let doc = new Y.Doc();
Adapter.create(doc).then(() => {
    const yarray = doc.getArray()

    yarray.observeDeep(() => {
        document.getElementById("arr").innerText = yarray.toJSON();
    })

    document.getElementById("add").onclick = () => {
        yarray.insert(0, [document.getElementById("num").value]);
    }
});

