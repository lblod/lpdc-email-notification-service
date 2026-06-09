export function getUUIDFromUri(uri) {
  const segmentedUri = uri.split("/");
  return segmentedUri[segmentedUri.length - 1];
}

export function getWindowStart(frequency) {
  const now = new Date();
  if (frequency === "weekly") now.setDate(now.getDate() - 7);
  if (frequency === "monthly") now.setMonth(now.getMonth() - 1);
  return now;
}
