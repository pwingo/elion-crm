"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[180px] px-3 py-2",
      },
    },
  });

  // Sync external content changes (e.g. after generation)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col flex-1 border border-[var(--border)] rounded overflow-hidden focus-within:border-[var(--primary)]">
      {/* Toolbar */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-[var(--border)] bg-gray-50 flex-wrap">
        <ToolbarBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <em>I</em>
        </ToolbarBtn>
        <div className="w-px bg-gray-300 mx-1" />
        <ToolbarBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          &bull; List
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          1. List
        </ToolbarBtn>
        <div className="w-px bg-gray-300 mx-1" />
        <ToolbarBtn
          active={editor.isActive("link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const url = window.prompt("URL:");
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }}
          title="Link"
        >
          Link
        </ToolbarBtn>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent
          editor={editor}
          className="text-sm [&_.ProseMirror]:min-h-[180px] [&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2 [&_.ProseMirror]:focus:outline-none [&_.ProseMirror_p]:my-1 [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_a]:text-blue-600 [&_.ProseMirror_a]:underline"
        />
        {!content && (
          <div className="absolute top-0 left-0 px-3 py-2 text-sm text-gray-400 pointer-events-none hidden">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "px-2 py-0.5 text-xs font-medium rounded transition-colors",
        active
          ? "bg-[var(--primary)] text-white"
          : "bg-white text-gray-600 hover:bg-gray-200 border border-gray-200",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
