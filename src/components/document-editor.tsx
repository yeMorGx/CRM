"use client";

import {AppSelect} from "@/components/app-select";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { useState } from "react";
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Code2, Minus, Undo2, Redo2, Pilcrow, FileCode2 } from "lucide-react";

export default function DocumentEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [source, setSource] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
    editorProps: { attributes: { class: "document-prose", "aria-label": "Conteúdo do documento" } },
  });
  const selection = useEditorState({ editor, selector: ({ editor }) => editor ? {
    bold: editor.isActive("bold"), italic: editor.isActive("italic"), strike: editor.isActive("strike"),
    bullet: editor.isActive("bulletList"), ordered: editor.isActive("orderedList"), quote: editor.isActive("blockquote"), code: editor.isActive("codeBlock"),
    block: editor.isActive("heading", { level: 1 }) ? "1" : editor.isActive("heading", { level: 2 }) ? "2" : editor.isActive("heading", { level: 3 }) ? "3" : "paragraph",
    undo: editor.can().undo(), redo: editor.can().redo(),
  } : null });
  if (!editor) return <p className="document-editor-loading" role="status">Carregando editor...</p>;
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const formats = [
    { label: "Negrito", icon: Bold, active: selection?.bold, action: () => editor.chain().focus().toggleBold().run() },
    { label: "Itálico", icon: Italic, active: selection?.italic, action: () => editor.chain().focus().toggleItalic().run() },
    { label: "Tachado", icon: Strikethrough, active: selection?.strike, action: () => editor.chain().focus().toggleStrike().run() },
    { label: "Lista", icon: List, active: selection?.bullet, action: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Lista numerada", icon: ListOrdered, active: selection?.ordered, action: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Citação", icon: Quote, active: selection?.quote, action: () => editor.chain().focus().toggleBlockquote().run() },
    { label: "Bloco de código", icon: Code2, active: selection?.code, action: () => editor.chain().focus().toggleCodeBlock().run() },
    { label: "Divisor", icon: Minus, active: false, action: () => editor.chain().focus().setHorizontalRule().run() },
  ];
  return <div className="document-editor">
    <div className="document-editor-toolbar">
      <div className="document-editor-modes" role="group" aria-label="Modo de edição">
        <button aria-pressed={!source} onClick={() => { if (source) { editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false }); setSource(false); } }}><Pilcrow size={15} /> Escrever</button>
        <button aria-pressed={source} onClick={() => { if (!source) onChange(editor.getMarkdown()); setSource(true); }}><FileCode2 size={15} /> Markdown</button>
      </div>
      {!source && <div className="document-formatting" role="group" aria-label="Formatação">
        <AppSelect aria-label="Estilo do parágrafo" value={selection?.block ?? "paragraph"} onChange={event => { if (event.target.value === "paragraph") editor.chain().focus().setParagraph().run(); else editor.chain().focus().toggleHeading({ level: Number(event.target.value) as 1 | 2 | 3 }).run(); }}><option value="paragraph">Texto</option><option value="1">Título 1</option><option value="2">Título 2</option><option value="3">Título 3</option></AppSelect>
        <span className="document-toolbar-divider" />
        {formats.map(format => <button key={format.label} type="button" title={format.label} aria-label={format.label} aria-pressed={format.label === "Divisor" ? undefined : format.active} onMouseDown={event => event.preventDefault()} onClick={format.action}><format.icon size={16} /></button>)}
        <span className="document-toolbar-divider" />
        <button title="Desfazer" aria-label="Desfazer" disabled={!selection?.undo} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></button><button title="Refazer" aria-label="Refazer" disabled={!selection?.redo} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></button>
      </div>}
    </div>
    <div className="document-editor-content">
      {source ? <textarea className="document-markdown" spellCheck={false} aria-label="Código Markdown" value={value} placeholder="Escreva seu documento em Markdown..." onChange={event => onChange(event.target.value)} /> : <EditorContent editor={editor} />}
    </div>
    <div className="document-editor-footer"><span>{words} {words === 1 ? "palavra" : "palavras"}</span><span>{source ? "Markdown" : "Use # para títulos e - para listas"}</span></div>
  </div>;
}
