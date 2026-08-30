const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Les chemins renvoyés par le backend sont relatifs à backend/ (ex: "results/images/..."),
// alors que /media est déjà monté sur backend/results.
export function mediaUrl(path) {
  if (!path) return null;
  const cleaned = path.replace(/^results\//, "");
  return `${API_URL}/media/${cleaned}`;
}

export function dataMediaUrl(filename) {
  return `${API_URL}/data-media/${filename}`;
}

export function youtubeEmbedUrl(watchUrl) {
  if (!watchUrl) return null;
  const match = watchUrl.match(/[?&]v=([^&]+)/);
  const videoId = match ? match[1] : watchUrl.split("/").pop();
  return `https://www.youtube.com/embed/${videoId}`;
}
