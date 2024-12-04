# NDN Workspace over TCP/IP Signaling Server
This repository serves four goals:
1. [WIP] A source of trust where a workspace manager can approve users based on current IdP solutions
2. A rendezvous server where individual WebRTC clients can communicate to authenticate SDP fingerprints, signal to each other their session descriptions, and hole-punch using STUN
3. A WebRTC adapter for Y.js that implements our NxN signaling protocol
4. [WIP] A proof of concept that uses our rendezvous server and adapter (ProseQuill, Drawing)

## Build
Firstly, build the frontend which includes the adapter and proof of concept:
```
$ cd frontend
$ npm i
$ npm run build
$ npx vite build --sourcemap true -w # For easier debugging  
```

Get your OIDC/Auth0 credentials and put them in the `.env` file (template available in `.env.template`. 

To build the server:
```
$ npm i 
```

## Run
To run the server:
```
$ npm run dev
```


