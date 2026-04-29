import { X, Download } from 'lucide-react';
import { useEffect } from 'react';

export default function ImageLightbox({ src, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleDownload = async () => {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `image_${Date.now()}.webp`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button onClick={(e) => { e.stopPropagation(); handleDownload(); }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
          <Download className="w-5 h-5 text-white" />
        </button>
        <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>
      <img src={src} alt="" onClick={e => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
    </div>
  );
}
