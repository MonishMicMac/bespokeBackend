export function buildFileUrl(path) {
  if (!path || typeof path !== "string") return null;

  const trimmed = path.trim();
  if (trimmed === "") return null;

  // Already a complete URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  let cleanPath = trimmed.replace(/^\/+/, "");
  if (cleanPath.startsWith("public/")) {
    cleanPath = cleanPath.slice(7);
  }

  const bucket = process.env.AWS_BUCKET_NAME || "bespoke-2026";
  const region = process.env.AWS_DEFAULT_REGION || "ap-south-1";
  const baseUrl = process.env.AWS_URL
    ? process.env.AWS_URL.replace(/\/$/, "")
    : `https://${bucket}.s3.${region}.amazonaws.com`;

  return `${baseUrl}/${cleanPath}`;
}

export default buildFileUrl;
