'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Image as ImageIcon,
    Star,
    StarOff,
    X,
    Plus,
    Upload,
    Loader2,
    ChevronUp,
    ChevronDown,
} from 'lucide-react';

interface Asset {
    id: string;
    filename: string;
    path: string;
    type: string;
    size: number;
}

interface ImageManagerProps {
    selectedImages: string[];
    coverImage: string | null;
    onImagesChange: (images: string[]) => void;
    onCoverChange: (cover: string | null) => void;
    onInsertToEditor?: (path: string, filename: string) => void;
    projectId?: string | null;
}

export default function ImageManager({
    selectedImages,
    coverImage,
    onImagesChange,
    onCoverChange,
    onInsertToEditor,
    projectId,
}: ImageManagerProps) {
    const [showPicker, setShowPicker] = useState(false);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const isVideoPath = (assetPath: string) => /\.(mp4|mov|webm|m4v|avi)$/i.test(assetPath);

    const fetchAssets = useCallback(async () => {
        setLoading(true);
        try {
            const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
            const res = await fetch(`/api/assets${query}`);
            const data = await res.json();
            setAssets((data.assets || []));
        } catch (error) {
            console.error('Failed to fetch assets:', error);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (showPicker) fetchAssets();
    }, [showPicker, fetchAssets]);

    const toggleImage = (path: string) => {
        if (selectedImages.includes(path)) {
            const newImages = selectedImages.filter((p) => p !== path);
            onImagesChange(newImages);
            if (coverImage === path) {
                onCoverChange(newImages.length > 0 ? newImages[0] : null);
            }
        } else {
            const newImages = [...selectedImages, path];
            onImagesChange(newImages);
            if (!coverImage) {
                onCoverChange(path);
            }
        }
    };

    const setCover = (path: string) => {
        onCoverChange(path);
    };

    const removeImage = (path: string) => {
        const newImages = selectedImages.filter((p) => p !== path);
        onImagesChange(newImages);
        if (coverImage === path) {
            onCoverChange(newImages.length > 0 ? newImages[0] : null);
        }
    };

    const moveImage = (index: number, direction: 'up' | 'down') => {
        const newImages = [...selectedImages];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newImages.length) return;
        [newImages[index], newImages[targetIndex]] = [newImages[targetIndex], newImages[index]];
        onImagesChange(newImages);
    };

    // 共用上传函数
    const uploadFiles = useCallback(async (files: File[]) => {
        if (files.length === 0) return;
        setUploading(true);
        try {
            for (const file of files) {
                const uploadFile = (file.name === 'image.png' && file.size > 0 && !file.lastModified)
                    ? new File([file], `paste-${Date.now()}.png`, { type: file.type })
                    : file;
                const formData = new FormData();
                formData.append('file', uploadFile);
                if (projectId) formData.append('projectId', projectId);
                const res = await fetch('/api/assets', { method: 'POST', body: formData });
                if (res.ok) {
                    const data = await res.json();
                    if (data.asset) {
                        setAssets((prev) => [data.asset, ...prev]);
                        const newImages = [...selectedImages, data.asset.path];
                        onImagesChange(newImages);
                        if (!coverImage) onCoverChange(data.asset.path);
                    }
                }
            }
        } catch (error) {
            console.error('Upload failed:', error);
        } finally {
            setUploading(false);
        }
    }, [selectedImages, coverImage, onImagesChange, onCoverChange, projectId]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        await uploadFiles(Array.from(files));
        e.target.value = '';
    };

    // 粘贴上传 —— 监听整个组件容器
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const imageFiles: File[] = [];
            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                        // Give pasted screenshots a proper name
                        imageFiles.push(new File([file], `paste-${Date.now()}.png`, { type: file.type }));
                    }
                }
            }
            if (imageFiles.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                uploadFiles(imageFiles);
            }
        };
        container.addEventListener('paste', handlePaste);
        return () => container.removeEventListener('paste', handlePaste);
    }, [uploadFiles]);

    return (
        <div
            ref={containerRef}
            tabIndex={-1}
            className="theme-card p-5 outline-none focus-within:ring-2 focus-within:ring-sky-100"
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="theme-title font-semibold">素材管理</h3>
                <span className="theme-muted text-xs">
                    {projectId ? '项目素材模式 · ' : ''}{selectedImages.length} 张已选
                </span>
            </div>

            {/* Selected images preview */}
            {selectedImages.length > 0 ? (
                <div className="space-y-2 mb-4">
                    {selectedImages.map((path, index) => (
                        <div
                            key={path}
                            className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${coverImage === path
                                ? 'border-yellow-300 bg-yellow-50'
                                : ''
                                }`}
                            style={coverImage === path ? undefined : { borderColor: 'var(--border)', background: 'var(--surface-soft)' }}
                        >
                            <div className="flex flex-col gap-0.5">
                                <button
                                    onClick={() => moveImage(index, 'up')}
                                    disabled={index === 0}
                                    className="theme-muted p-0.5 hover:text-slate-700 disabled:opacity-20"
                                >
                                    <ChevronUp className="h-3 w-3" />
                                </button>
                                <button
                                    onClick={() => moveImage(index, 'down')}
                                    disabled={index === selectedImages.length - 1}
                                    className="theme-muted p-0.5 hover:text-slate-700 disabled:opacity-20"
                                >
                                    <ChevronDown className="h-3 w-3" />
                                </button>
                            </div>

                            {isVideoPath(path) ? (
                                <video
                                    src={path}
                                    className="w-12 h-12 rounded object-cover flex-shrink-0 bg-black"
                                    muted
                                    playsInline
                                />
                            ) : (
                                <img
                                    src={path}
                                    alt=""
                                    className="w-12 h-12 rounded object-cover flex-shrink-0"
                                />
                            )}

                            <div className="flex-1 min-w-0">
                                <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                    {path.split('/').pop()}
                                </p>
                                {coverImage === path && (
                                    <span className="text-[10px] text-yellow-700 font-medium">
                                        ⭐ 封面图
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    onClick={() => setCover(path)}
                                    title={coverImage === path ? '取消封面' : '设为封面'}
                                    className={`p-1 rounded transition-colors ${coverImage === path
                                        ? 'text-yellow-500 hover:text-yellow-600'
                                        : 'text-gray-300 hover:text-yellow-500'
                                        }`}
                                >
                                    {coverImage === path ? (
                                        <Star className="h-3.5 w-3.5 fill-current" />
                                    ) : (
                                        <StarOff className="h-3.5 w-3.5" />
                                    )}
                                </button>
                                {onInsertToEditor && !isVideoPath(path) && (
                                    <button
                                        onClick={() => onInsertToEditor(path, path.split('/').pop() || '')}
                                        title="插入到正文"
                                        className="p-1 text-gray-300 hover:text-blue-500 rounded transition-colors"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </button>
                                )}
                                <button
                                    onClick={() => removeImage(path)}
                                    title="移除"
                                    className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')); if (files.length) uploadFiles(files); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    className={`mb-4 py-6 border border-dashed rounded-lg text-center transition-colors cursor-default ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                        }`}
                >
                    <ImageIcon className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="theme-muted text-xs">暂未选择素材</p>
                    <p className="theme-muted mt-1 text-[10px]">
                        {dragOver ? '松开即可上传' : '可拖拽图片/视频到此处 或 ⌘V / Ctrl+V 粘贴图片'}
                    </p>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
                <button
                    onClick={() => setShowPicker(true)}
                    data-image-picker-trigger
                    className="button-secondary flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm"
                >
                    <ImageIcon className="h-3.5 w-3.5" />
                    从素材库选择
                </button>
                <label className="button-secondary flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm">
                    {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Upload className="h-3.5 w-3.5" />
                    )}
                    <span>上传</span>
                    <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        onChange={handleUpload}
                        className="hidden"
                        disabled={uploading}
                    />
                </label>
            </div>

            {/* Media Picker Modal */}
            {showPicker && (
                <div className="modern-overlay" onClick={() => setShowPicker(false)}>
                    <div className="modern-modal max-h-[82vh] max-w-4xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="font-semibold text-lg">选择素材</h3>
                            <div className="flex items-center gap-2">
                                <label className="button-secondary flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-sm">
                                    <Upload className="h-4 w-4" />
                                    上传新素材
                                    <input
                                        type="file"
                                        accept="image/*,video/*"
                                        multiple
                                        onChange={handleUpload}
                                        className="hidden"
                                        disabled={uploading}
                                    />
                                </label>
                                <button
                                    onClick={() => setShowPicker(false)}
                                    className="button-secondary rounded-lg p-2"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                                    <p className="theme-muted mt-2">加载中...</p>
                                </div>
                            ) : assets.length === 0 ? (
                                <div className="text-center py-12">
                                    <ImageIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                    <p className="theme-muted mb-2">素材库为空</p>
                                    <label className="button-primary inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2">
                                        <Upload className="h-4 w-4" />
                                        上传第一个素材
                                        <input
                                            type="file"
                                            accept="image/*,video/*"
                                            multiple
                                            onChange={handleUpload}
                                            className="hidden"
                                        />
                                    </label>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                    {assets.map((asset) => {
                                        const isSelected = selectedImages.includes(asset.path);
                                        return (
                                            <button
                                                key={asset.id}
                                                onClick={() => toggleImage(asset.path)}
                                                className={`group relative rounded-lg overflow-hidden border-2 transition-all ${isSelected
                                                    ? 'border-blue-500 ring-2 ring-blue-200'
                                                    : 'border-transparent hover:border-blue-300'
                                                    }`}
                                            >
                                                {asset.type === 'video' ? (
                                                    <div className="relative">
                                                        <video
                                                            src={asset.path}
                                                            className="w-full aspect-square object-cover bg-black"
                                                            muted
                                                            playsInline
                                                        />
                                                        <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">视频</span>
                                                    </div>
                                                ) : (
                                                    <img
                                                        src={asset.path}
                                                        alt={asset.filename}
                                                        className="w-full aspect-square object-cover"
                                                    />
                                                )}
                                                {isSelected && (
                                                    <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                                        {selectedImages.indexOf(asset.path) + 1}
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <span className="text-white text-sm font-medium">
                                                        {isSelected ? '取消选择' : '选择'}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--surface-soft)' }}>
                            <span className="theme-muted text-sm">
                                已选 {selectedImages.length} 个素材
                            </span>
                            <button
                                onClick={() => setShowPicker(false)}
                                className="button-primary rounded-lg px-4 py-2 text-sm"
                            >
                                确定
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
