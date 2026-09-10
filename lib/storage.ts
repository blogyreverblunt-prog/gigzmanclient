import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * Where uploaded files go.
 *
 * Two backends behind one function, because the right answer differs between
 * development and production and the call sites should not know which is
 * active:
 *
 *  - **`local`** writes under `public/uploads/`, which is what this codebase has
 *    always done and what works with no credentials. It is the default.
 *  - **`blob`** PUTs to Vercel Blob, and is selected only when
 *    `BLOB_READ_WRITE_TOKEN` is set.
 *
 * **Production needs the blob backend.** Vercel's filesystem is ephemeral: a
 * file written under `public/uploads/` at runtime is not in the deployment's
 * immutable image, is not shared between instances, and is gone at the next
 * deploy. The local backend is correct for development and for a
 * single-machine deployment with a persistent disk, and silently wrong on
 * Vercel — a logo that uploads successfully and 404s an hour later. Set
 * `BLOB_READ_WRITE_TOKEN` in the production environment and the seam switches
 * itself.
 *
 * The blob backend calls the REST API with `fetch` rather than depending on
 * `@vercel/blob`. One HTTP PUT is not worth a dependency, and adding one would
 * mean carrying a package that cannot be exercised here at all. It is
 * unexercised for the same reason: there is no token on this machine, so this
 * path is written from the documented API and has never been run. Treat the
 * first production upload as the test.
 */

export type StorageBackend = "local" | "blob";

export function storageBackend(): StorageBackend {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

/**
 * Store `body` at `key` and return the URL it is served from.
 *
 * `key` is a path-like string the caller controls entirely — never a
 * client-supplied filename. Callers randomise names; this function assumes that
 * has already happened and only guards against traversal.
 */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  if (key.includes("..") || key.startsWith("/")) {
    throw new Error(`Refusing to store an unsafe object key: ${key}`);
  }

  if (storageBackend() === "blob") {
    // `addRandomSuffix=false` because callers already randomise, and a suffix
    // added here would make the returned URL unpredictable for cleanup.
    const response = await fetch(`https://blob.vercel-storage.com/${key}?addRandomSuffix=false`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
        "x-content-type": contentType,
        "x-api-version": "7",
      },
      body: new Uint8Array(body),
    });
    if (!response.ok) {
      throw new Error(`Blob upload failed (${response.status}): ${await response.text()}`);
    }
    const result = (await response.json()) as { url?: string };
    if (!result.url) throw new Error("Blob upload returned no URL.");
    return result.url;
  }

  const path = join(process.cwd(), "public", "uploads", key);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, body);
  return `/uploads/${key}`;
}

/**
 * Best-effort delete. A failure is swallowed on purpose: an orphaned file is
 * clutter, but a delete that throws mid-action would fail a save the operator
 * has already been told succeeded.
 */
export async function deleteObject(url: string): Promise<void> {
  try {
    if (url.startsWith("/uploads/")) {
      await unlink(join(process.cwd(), "public", url));
      return;
    }
    if (process.env.BLOB_READ_WRITE_TOKEN && url.includes("blob.vercel-storage.com")) {
      await fetch("https://blob.vercel-storage.com/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          "content-type": "application/json",
          "x-api-version": "7",
        },
        body: JSON.stringify({ urls: [url] }),
      });
    }
  } catch {
    // Intentionally ignored — see above.
  }
}
