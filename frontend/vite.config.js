import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                array: resolve(__dirname, 'array.html'),
                prosemirror: resolve(__dirname, 'prosemirror.html'),
            },
        },
    },
});
