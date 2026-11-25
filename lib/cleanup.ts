import "server-only";
import { db } from "./supabase";
import { FARM } from "./config";

/**
 * Delete video files older than FARM.videoRetentionDays from storage.
 * The recording rows stay (marked video_deleted_at) so reports keep every feed.
 */
export async function deleteOldVideos(maxRounds = 10): Promise<number> {
  const cutoff = new Date(Date.now() - FARM.videoRetentionDays * 86_400_000).toISOString();
  const supa = db();
  let deleted = 0;
  for (let round = 0; round < maxRounds; round++) {
    const { data, error } = await supa
      .from("recordings")
      .select("id, storage_path")
      .is("video_deleted_at", null)
      .lt("recorded_at", cutoff)
      .limit(500);
    if (error || !data?.length) break;
    const { error: rmErr } = await supa.storage.from(FARM.videoBucket).remove(data.map((r) => r.storage_path));
    if (rmErr) break;
    await supa
      .from("recordings")
      .update({ video_deleted_at: new Date().toISOString() })
      .in(
        "id",
        data.map((r) => r.id),
      );
    deleted += data.length;
    if (data.length < 500) break;
  }
  return deleted;
}
