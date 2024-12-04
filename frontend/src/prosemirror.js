import * as Y from 'yjs'
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo, initProseMirrorDoc } from 'y-prosemirror'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from './schema.js'
import { exampleSetup } from 'prosemirror-example-setup'
import { keymap } from 'prosemirror-keymap'
import { Adapter } from './adapter.js'

window.addEventListener('load', async () => {
    const ydoc = new Y.Doc()
    const provider = await Adapter.create(ydoc);
    const yXmlFragment = ydoc.getXmlFragment('prosemirror')

    const editor = document.createElement('div')
    editor.setAttribute('id', 'editor')
    const editorContainer = document.createElement('div')
    editorContainer.insertBefore(editor, null)
    const { doc, mapping } = initProseMirrorDoc(yXmlFragment, schema)
    new EditorView(editor, {
        state: EditorState.create({
            doc,
            schema,
            plugins: [
                ySyncPlugin(yXmlFragment, { mapping }),
                yCursorPlugin(provider.awareness),
                yUndoPlugin(),
                keymap({
                    'Mod-z': undo,
                    'Mod-y': redo,
                    'Mod-Shift-z': redo
                })
            ].concat(exampleSetup({ schema }))
        })
    })
    document.body.insertBefore(editorContainer, null)
})
