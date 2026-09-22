export function buildFileUrl(path) {
  if (!path || typeof path !== "string") return path;

  // Already a complete URL
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const baseUrl = process.env.AWS_URL
    ? process.env.AWS_URL.replace(/\/$/, "")
    : (process.env.AWS_BUCKET_NAME && process.env.AWS_DEFAULT_REGION
        ? `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_DEFAULT_REGION}.amazonaws.com`
        : "");

  if (!baseUrl) return path;

  const cleanPath = path.replace(/^\//, "");
  return `${baseUrl}/${cleanPath}`;
}

export default buildFileUrl;
