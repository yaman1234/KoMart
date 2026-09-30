/** Upload PO bill images to Cloudinary using the PO unsigned preset from env. */

export async function uploadImageToCloudinary(file: File): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset =
    import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET_PURCHASEORDER ||
    import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary configuration is missing.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be smaller than 5 MB.');
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

export async function uploadImagesToCloudinary(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files);
  const urls: string[] = [];
  for (const file of list) {
    urls.push(await uploadImageToCloudinary(file));
  }
  return urls;
}

/** Alias for PO Form/Detail bill photo uploads. */
export const uploadPurchaseOrderBillImages = uploadImagesToCloudinary;
