#!/usr/bin/env node

/*
Source derived from https://github.com/yjs/y-webrtc/blob/master/bin/server.js
Converted to TypeScript and mirrored here
 */

import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import * as map from 'lib0/map'

const wsReadyStateConnecting = WebSocket.CONNECTING
const wsReadyStateOpen = WebSocket.OPEN
const wsReadyStateClosing = WebSocket.CLOSING
const wsReadyStateClosed = WebSocket.CLOSED

const pingTimeout = 30000

const port = process.env.PORT || 4444
const wss = new WebSocketServer({ noServer: true })

const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    response.end('okay')
})

/**
 * Map from topic-name to set of subscribed clients.
 */
const topics: Map<string, Set<WebSocket>> = new Map()

/**
 * Send a message to a connection
 * @param conn The WebSocket connection
 * @param message The message to send
 */
const send = (conn: WebSocket, message: object): void => {
    if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
        conn.close()
    }
    try {
        conn.send(JSON.stringify(message))
    } catch (e) {
        conn.close()
    }
}

/**
 * Setup a new client connection
 * @param conn The WebSocket connection
 */
const onconnection = (conn: WebSocket): void => {
    const subscribedTopics: Set<string> = new Set()
    let closed = false
    let pongReceived = true

    const pingInterval = setInterval(() => {
        if (!pongReceived) {
            conn.close()
            clearInterval(pingInterval)
        } else {
            pongReceived = false
            try {
                conn.ping()
            } catch (e) {
                conn.close()
            }
        }
    }, pingTimeout)

    conn.on('pong', () => {
        pongReceived = true
    })

    conn.on('close', () => {
        subscribedTopics.forEach(topicName => {
            const subs = topics.get(topicName) || new Set()
            subs.delete(conn)
            if (subs.size === 0) {
                topics.delete(topicName)
            }
        })
        subscribedTopics.clear()
        closed = true
    })

    conn.on('message', (message: string | Buffer) => {
        let parsedMessage: any
        if (typeof message === 'string' || message instanceof Buffer) {
            parsedMessage = JSON.parse(message.toString())
        }

        if (parsedMessage && parsedMessage.type && !closed) {
            switch (parsedMessage.type) {
                case 'subscribe':
                    (parsedMessage.topics || []).forEach((topicName: string) => {
                        if (typeof topicName === 'string') {
                            const topic = map.setIfUndefined(topics, topicName, () => new Set())
                            topic.add(conn)
                            subscribedTopics.add(topicName)
                        }
                    })
                    break
                case 'unsubscribe':
                    (parsedMessage.topics || []).forEach((topicName: string) => {
                        const subs = topics.get(topicName)
                        if (subs) {
                            subs.delete(conn)
                        }
                    })
                    break
                case 'publish':
                    if (parsedMessage.topic) {
                        const receivers = topics.get(parsedMessage.topic)
                        if (receivers) {
                            parsedMessage.clients = receivers.size
                            receivers.forEach(receiver => send(receiver, parsedMessage))
                        }
                    }
                    break
                case 'ping':
                    send(conn, { type: 'pong' })
            }
        }
    })
}

wss.on('connection', onconnection)

server.on('upgrade', (request, socket, head) => {
    const handleAuth = (ws: WebSocket): void => {
        wss.emit('connection', ws, request)
    }
    wss.handleUpgrade(request, socket, head, handleAuth)
})

server.listen(port)

console.log('Signaling server running on localhost:', port)