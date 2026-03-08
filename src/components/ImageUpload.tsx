import React, { useCallback, useState } from 'react';
import { UploadCloud, Image as ImageIcon, X } from 'lucide-react';

interface ImageUploadProps {
  onImageSelected: (base64: string, mimeType: string) => void;
  onClear: () => void;
  currentImage: string | null;
}

export function ImageUpload({ onImageSelected, onClear, currentImage }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // Extract base64 and mime type
      const match = result.match(/^data:(image\/[a-zA-Z0-9]+);base64,(.+)$/);
      if (match) {
        onImageSelected(match[2], match[1]);
      }
    };
    reader.readAsDataURL(file);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  if (currentImage) {
    return (
      <div className="relative w-full h-full min-h-[300px] rounded-2xl overflow-hidden shadow-sm border border-stone-200 group">
        <img
          src={`data:image/jpeg;base64,${currentImage}`}
          alt="Uploaded room"
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <button
          onClick={onClear}
          className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Clear image"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`w-full h-full min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-colors cursor-pointer ${
        isDragging
          ? 'border-emerald-500 bg-emerald-50/50'
          : 'border-stone-300 hover:border-stone-400 bg-stone-50/50 hover:bg-stone-100/50'
      }`}
      onClick={() => document.getElementById('file-upload')?.click()}
    >
      <input
        id="file-upload"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileInput}
      />
      <div className="p-4 bg-white rounded-full shadow-sm mb-4">
        <UploadCloud className="w-8 h-8 text-stone-500" />
      </div>
      <p className="text-stone-700 font-medium mb-1">Click or drag photo here</p>
      <p className="text-stone-500 text-sm">Upload a photo of your room to get started</p>
    </div>
  );
}
