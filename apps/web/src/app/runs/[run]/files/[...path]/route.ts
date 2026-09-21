import { extname } from "node:path";
import { listPublicFiles, loadPublicCatalog, readPublicTextFile } from "../../../../../lib/content.js";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function publishedRoot() { return process.env.AIBENCH_PUBLISHED_ROOT ?? "../../published"; }

export async function generateStaticParams() {
  const catalog = await loadPublicCatalog(publishedRoot());
  return catalog.runs.flatMap((run) => listPublicFiles(run).map((file) => ({ run: run.runId, path: file.path.split("/") })));
}

export async function GET(_request: Request, { params }: { params: Promise<{ run: string; path: string[] }> }) {
  const { run, path } = await params;
  const relativePath = path.join("/");
  const contentType = contentTypes[extname(relativePath).toLowerCase()];
  if (!contentType) return new Response("Not found", { status: 404 });
  const contents = await readPublicTextFile(publishedRoot(), run, relativePath);
  if (contents === null) return new Response("Not found", { status: 404 });
  return new Response(contents, { headers: { "content-type": contentType } });
}
