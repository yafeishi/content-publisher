'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { useEffect, useCallback } from 'react';
import {
    Bold,
    Italic,
    Strikethrough,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Code,
    Image as ImageIcon,
    Link as LinkIcon,
    Undo,
    Redo,
    RemoveFormatting,
    Minus,
} from 'lucide-react';
import { useDialog } from '@/components/ui/dialog-center';

interface RichTextEditorProps {
    content: string;
    onChange: (html: string) => void;
    placeholder?: string;
    platforms?: string[];
    onStats?: (stats: { characters: number; words: number }) => void;
    onInsertImage?: () => void;
}

interface ToolbarButtonProps {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
}

interface TiptapWindow extends Window {
    __tiptapInsertImage?: (src: string, alt?: string) => void;
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`p-1.5 rounded transition-colors ${isActive
                ? 'tag-info'
                : 'theme-muted hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800'
                } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            {children}
        </button>
    );
}

function ToolbarDivider() {
    return <div className="mx-1 h-6 w-px" style={{ background: 'var(--border)' }} />;
}

export default function RichTextEditor({
    content,
    onChange,
    placeholder = '开始编写你的精彩内容...',
    platforms = [],
    onStats,
    onInsertImage,
}: RichTextEditorProps) {
    const { prompt } = useDialog();
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Image.configure({
                HTMLAttributes: {
                    class: 'rounded-lg max-w-full mx-auto my-4',
                },
            }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: 'text-sky-600 underline cursor-pointer',
                },
            }),
            Placeholder.configure({
                placeholder,
            }),
            CharacterCount,
        ],
        content,
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] px-6 py-4',
            },
        },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            onChange(html);

            if (onStats) {
                const text = editor.getText();
                const characters = text.length;
                const words = text.trim() ? text.trim().split(/\s+/).length : 0;
                onStats({ characters, words });
            }
        },
    });

    // Sync external content changes
    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content, { emitUpdate: false });
        }
    }, [content, editor]);

    // Report initial stats
    useEffect(() => {
        if (editor && onStats) {
            const text = editor.getText();
            const characters = text.length;
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            onStats({ characters, words });
        }
    }, [editor, onStats]);

    const addLink = useCallback(async () => {
        if (!editor) return;
        const url = await prompt({
            title: '插入链接',
            description: '请输入链接地址',
            defaultValue: 'https://',
            placeholder: 'https://example.com',
            confirmText: '插入',
        });
        if (url) {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }
    }, [editor, prompt]);

    const addImage = useCallback(async () => {
        if (onInsertImage) {
            onInsertImage();
            return;
        }
        if (!editor) return;
        const url = await prompt({
            title: '插入图片',
            description: '请输入图片地址',
            placeholder: 'https://example.com/image.png',
            confirmText: '插入',
        });
        if (url) {
            editor.chain().focus().setImage({ src: url }).run();
        }
    }, [editor, onInsertImage, prompt]);

    // Public method to insert image from outside
    useEffect(() => {
        const tiptapWindow = window as TiptapWindow;
        if (editor) {
            tiptapWindow.__tiptapInsertImage = (src: string, alt?: string) => {
                editor.chain().focus().setImage({ src, alt: alt || '' }).run();
            };
        }
        return () => {
            delete tiptapWindow.__tiptapInsertImage;
        };
    }, [editor]);

    if (!editor) {
        return (
            <div className="theme-card animate-pulse">
                <div className="h-12 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }} />
                <div className="h-96 p-6">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
            </div>
        );
    }

    // Get current text stats
    const text = editor.getText();
    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const readingTime = Math.max(1, Math.ceil(wordCount / 300));
    const activeLimits = platforms
        .map((p) => {
            if (p === 'xiaohongshu') return { title: 20, body: 1000, label: '小红书' };
            if (p === 'wechat') return { title: 64, body: 20000, label: '微信公众号' };
            return null;
        })
        .filter((item): item is { title: number; body: number; label: string } => Boolean(item));

    return (
        <div className="theme-card overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 border-b px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
                {/* Text formatting */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                    title="加粗 (Ctrl+B)"
                >
                    <Bold className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                    title="斜体 (Ctrl+I)"
                >
                    <Italic className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    isActive={editor.isActive('strike')}
                    title="删除线"
                >
                    <Strikethrough className="h-4 w-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Headings */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    isActive={editor.isActive('heading', { level: 1 })}
                    title="标题 1"
                >
                    <Heading1 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    isActive={editor.isActive('heading', { level: 2 })}
                    title="标题 2"
                >
                    <Heading2 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    isActive={editor.isActive('heading', { level: 3 })}
                    title="标题 3"
                >
                    <Heading3 className="h-4 w-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Lists */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive('bulletList')}
                    title="无序列表"
                >
                    <List className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive('orderedList')}
                    title="有序列表"
                >
                    <ListOrdered className="h-4 w-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Blocks */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive('blockquote')}
                    title="引用"
                >
                    <Quote className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    isActive={editor.isActive('codeBlock')}
                    title="代码块"
                >
                    <Code className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    title="分隔线"
                >
                    <Minus className="h-4 w-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Media */}
                <ToolbarButton onClick={addImage} title="插入图片">
                    <ImageIcon className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={addLink}
                    isActive={editor.isActive('link')}
                    title="插入链接"
                >
                    <LinkIcon className="h-4 w-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Clear formatting */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
                    title="清除格式"
                >
                    <RemoveFormatting className="h-4 w-4" />
                </ToolbarButton>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Undo/Redo */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                    title="撤销 (Ctrl+Z)"
                >
                    <Undo className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                    title="重做 (Ctrl+Shift+Z)"
                >
                    <Redo className="h-4 w-4" />
                </ToolbarButton>
            </div>

            {/* Editor */}
            <EditorContent editor={editor} />

            {/* Stats bar */}
            <div className="flex items-center justify-between border-t px-4 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
                <div className="theme-muted flex items-center gap-4 text-xs">
                    <span>{charCount} 字符</span>
                    <span>{wordCount} 词</span>
                    <span>约 {readingTime} 分钟阅读</span>
                </div>

                {/* Platform limits */}
                {activeLimits.length > 0 && (
                    <div className="flex items-center gap-3">
                        {activeLimits.map((limit) => {
                            const overBody = charCount > limit.body;
                            const warningBody = charCount > limit.body * 0.8;
                            return (
                                <span
                                    key={limit.label}
                                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${overBody
                                        ? 'tag-danger'
                                        : warningBody
                                            ? 'tag-warning'
                                            : 'tag-success'
                                        }`}
                                >
                                    {limit.label}: {charCount}/{limit.body}
                                    {overBody && ' ⚠️'}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
