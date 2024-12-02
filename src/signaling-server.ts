import * as socketio from 'socket.io';

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Turn = require('node-turn');

import { ServerType } from '@hono/node-server';

export function startSignal(server: ServerType) {
    var io = new socketio.Server(server);

    /**
     * Handle signaling events
     */
    io.on('connection', socket => {
        console.log('Socket connected, broadcasting join-init:', socket.id, 'at',
            socket.request.connection.remoteAddress);
        // Broadcast client join-init
        socket.broadcast.emit('join-init', JSON.stringify({ src: socket.id }));

        socket.on('disconnect', () => {
            console.log('Socket disconnected:', socket.id, 'at', socket.request.connection.remoteAddress)
        });

        socket.on('join-offer', offer => {
            let dstSocket = JSON.parse(offer).dst;
            console.log('Relaying join-offer event from', socket.id, 'to', dstSocket);
            let s = io.sockets.sockets.get(dstSocket)
            if (!s) {
                console.log('Socket does not exist');
                return;
            }
            s.emit('join-offer', offer);
        });
        socket.on('join-answer', answer => {
            let dstSocket = JSON.parse(answer).dst;
            console.log('Relaying join-answer event from', socket.id, 'to', dstSocket);
            let s = io.sockets.sockets.get(dstSocket)
            if (!s) {
                console.log('Socket does not exist');
                return;
            }
            s.emit('join-answer', answer);
        });

        socket.on('join', join => {
            let dstSocket = JSON.parse(join).dst;
            console.log('Relaying join event from', socket.id, 'to', dstSocket);
            let s = io.sockets.sockets.get(dstSocket)
            if (!s) {
                console.log('Socket does not exist');
                return;
            }
            s.emit('join', join);
        });
    });


    var turn_server = new Turn(); 
    turn_server.start();
}
