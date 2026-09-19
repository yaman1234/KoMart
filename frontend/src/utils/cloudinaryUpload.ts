import { showWarning } from '@/utils/toast';

const MAX_BYTES = 5 * 1024 * 1024;

/** Upload one image to Cloudinary (same env as product images). */
export async function uploadImageToCloudinary(file: File): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary configuration is missing.');
  }
  if (!file.type.startsWith('image/')) {
    showWarning('Please select an image file.');
    throw new Error('Not an image');
  }
  if (file.size > MAX_BYTES) {
    showWarning('Image must be smaller than 5 MB.');
    throw new Error('Image too large');
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: formData },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Image upload failed.');
  }
  return data.secure_url as string;
}

/** Upload multiple images; skips invalid files after warning. */
export async function uploadImagesToCloudinary(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files);
  const urls: string[] = [];
  for (const file of list) {
    try {
      urls.push(await uploadImageToCloudinary(file));
    } catch {
      // warning already shown for validation errors
    }
  }
  return urls;
}
