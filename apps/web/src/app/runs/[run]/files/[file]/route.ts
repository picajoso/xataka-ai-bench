import { extname } from "node:path";
import { getPublicFileId, getPublicFilePath, listPublicFiles, loadPublicCatalog, readPublicTextFile } from "../../../../../lib/content.js";

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
  return catalog.runs.flatMap((run) => listPublicFiles(run).map((file) => ({ run: run.runId, file: getPublicFileId(file.path) })));
}

export async function GET(_request: Request, { params }: { params: Promise<{ run: string; file: string }> }) {
  const { run: runId, file } = await params;
  const catalog = await loadPublicCatalog(publishedRoot());
  const run = catalog.runs.find((candidate) => candidate.runId === runId);
  const relativePath = run ? getPublicFilePath(run, file) : null;
  const contentType = relativePath ? contentTypes[extname(relativePath).toLowerCase()] : undefined;
  if (!relativePath || !contentType) return new Response("Not found", { status: 404 });
  const contents = await readPublicTextFile(publishedRoot(), runId, relativePath);
  if (contents === null) return new Response("Not found", { status: 404 });
  return new Response(contents, { headers: { "content-type": contentType } });
}
