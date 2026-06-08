export function getUUIDFromUri(uri) {
  const segmentedUri = uri.split("/");
  return segmentedUri[segmentedUri.length - 1];
}

export function getWindowStart(cadence) {
  const now = new Date();
  if (cadence === "weekly") now.setDate(now.getDate() - 7);
  if (cadence === "monthly") now.setMonth(now.getMonth() - 1);
  return now;
}
