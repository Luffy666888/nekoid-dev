export const NEKO_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const NEKO_MAX_UPLOAD_LABEL = "10MB";
export const NEKO_MAX_ONBOARDING_VIDEO_BYTES = 100 * 1024 * 1024;
export const NEKO_MAX_ONBOARDING_VIDEO_LABEL = "100MB";

type UploadKind = "image" | "video";
type UploadLimitOptions = {
  maxBytes?: number;
  maxLabel?: string;
};

const KIND_LABEL: Record<UploadKind, string> = {
  image: "图片",
  video: "视频",
};

export function isNekoUploadSizeAllowed(size: number, maxBytes = NEKO_MAX_UPLOAD_BYTES) {
  return size <= maxBytes;
}

export function getNekoUploadLimitError(file: File, kind: UploadKind, options: UploadLimitOptions = {}) {
  const maxBytes = options.maxBytes ?? NEKO_MAX_UPLOAD_BYTES;
  const maxLabel = options.maxLabel ?? NEKO_MAX_UPLOAD_LABEL;

  if (isNekoUploadSizeAllowed(file.size, maxBytes)) return null;
  return `${KIND_LABEL[kind]}不能超过 ${maxLabel}，请压缩后再上传`;
}
