function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fitWithin(w, h, maxDim) {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };
  const ratio = Math.min(maxDim / w, maxDim / h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

export async function compressImageToWebp(file, { maxDim = 1280, quality = 0.82 } = {}) {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxDim);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
  return { blob, width, height };
}
