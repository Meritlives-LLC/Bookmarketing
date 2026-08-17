"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clapperboard, FileText, Loader2, Play, Pause, RefreshCw, CheckCircle2, AlertCircle, Film, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api/client";

type Manuscript = { id: string; originalFileName: string; fileType: string; fileSize: number; extractionStatus: string; extractedWordCount?: number; chapters?: Array<{ id: string; chapterNumber: number; title?: string; wordCount: number }>; };
type Shot = { id: string; shotNumber: number; shotType?: string; camera?: string; visualPrompt?: string; durationSec?: number; status: string };
type Scene = { id: string; sceneNumber: number; status: string; sourceText: string; visualPrompt?: string; negativePrompt?: string; videoUrl?: string; estimatedDurationSec?: number; shots?: Shot[] };
type VideoProject = { id: string; name: string; status: string; progress: number; totalChapters: number; totalScenes: number; completedScenes: number; visualStyle: string; aspectRatio: string; subtitleEnabled: boolean; subtitleMode: string; subtitleStyle: string; finalVideoUrl?: string; cleanVideoUrl?: string; subtitleVideoUrl?: string; srtUrl?: string; vttUrl?: string; assUrl?: string; errorMessage?: string; filmBible?: { premise?: string; genre?: string; tone?: string }; scenes?: Scene[]; characters?: Array<{ id: string; name: string; referenceImageUrl?: string }>; locations?: Array<{ id: string; name: string; referenceImageUrl?: string }> };
type Progress = { projectId: string; status: string; progress: number; totalChapters: number; totalScenes: number; completedScenes: number; stageLabel: string; errorMessage?: string };

export default function BookVideoStudioPage({ params }: { params: { id: string } }) {
  const bookId = params.id;
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [active, setActive] = useState<VideoProject | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editNeg, setEditNeg] = useState("");
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [editShotPrompt, setEditShotPrompt] = useState("");
  const [editShotCamera, setEditShotCamera] = useState("");
  const [settings, setSettings] = useState({ visualStyle: "CINEMATIC_REALISM", aspectRatio: "RATIO_16_9", subtitleMode: "SOFT", subtitleStyle: "CINEMATIC", subtitleEnabled: true });

  const load = useCallback(async () => {
    try {
      const [ms, projs] = await Promise.all([
        api.get<Manuscript>(`/books/${bookId}/manuscript`).catch(() => null),
        api.get<VideoProject[]>(`/books/${bookId}/video-projects`).catch(() => [] as VideoProject[]),
      ]);
      setManuscript(ms);
      if (projs?.[0]) setActive(await api.get<VideoProject>(`/video-projects/${projs[0].id}`));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [bookId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!active || ["COMPLETED", "FAILED", "CANCELED", "DRAFT", "PAUSED"].includes(active.status)) return;
    const t = setInterval(async () => {
      try {
        const p = await api.get<Progress>(`/video-projects/${active.id}/progress`);
        setProgress(p);
        if (["COMPLETED", "FAILED", "CANCELED"].includes(p.status)) setActive(await api.get<VideoProject>(`/video-projects/${active.id}`));
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(t);
  }, [active]);

  async function handleUpload() {
    if (!uploadFile) return;
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("manuscript", uploadFile);
      const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
      const res = await fetch(`${base}/books/${bookId}/manuscript`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Upload failed");
      setManuscript(json.data);
      const poll = setInterval(async () => {
        try {
          const m = await api.get<Manuscript>(`/books/${bookId}/manuscript`);
          setManuscript(m);
          if (m.extractionStatus === "COMPLETED" || m.extractionStatus === "FAILED") clearInterval(poll);
        } catch { clearInterval(poll); }
      }, 3000);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }

  async function createProject() {
    setBusy(true); setError("");
    try { setActive(await api.post<VideoProject>(`/books/${bookId}/video-projects`, settings)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to create project"); }
    finally { setBusy(false); }
  }
  async function runAnalyze() {
    if (!active) return; setBusy(true); setError("");
    try { await api.post(`/video-projects/${active.id}/analyze`); setActive(await api.get<VideoProject>(`/video-projects/${active.id}`)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Analysis failed"); }
    finally { setBusy(false); }
  }
  async function runGenerate() {
    if (!active) return;
    if (!confirm(`Generate video for ${active.totalScenes || "all"} scenes? This consumes credits.`)) return;
    setBusy(true); setError("");
    try { await api.post(`/video-projects/${active.id}/generate`, {}); setActive(await api.get<VideoProject>(`/video-projects/${active.id}`)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Generation failed"); }
    finally { setBusy(false); }
  }
  async function pauseOrResume() {
    if (!active) return; setBusy(true);
    try {
      if (active.status === "PAUSED") await api.post(`/video-projects/${active.id}/resume`);
      else await api.post(`/video-projects/${active.id}/pause`);
      setActive(await api.get<VideoProject>(`/video-projects/${active.id}`));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }
  async function saveScenePrompt(sceneId: string) {
    setBusy(true);
    try {
      await api.patch(`/video-scenes/${sceneId}/prompt`, { visualPrompt: editPrompt, negativePrompt: editNeg });
      setEditingSceneId(null); setActive(await api.get<VideoProject>(`/video-projects/${active!.id}`));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }
  async function saveShotPrompt(shotId: string) {
    setBusy(true);
    try {
      await api.patch(`/video-shots/${shotId}/prompt`, { visualPrompt: editShotPrompt, camera: editShotCamera });
      setEditingShotId(null); setActive(await api.get<VideoProject>(`/video-projects/${active!.id}`));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }
  async function saveSubtitleSettings() {
    if (!active) return; setBusy(true);
    try {
      await api.patch(`/video-projects/${active.id}/subtitle-settings`, { subtitleMode: settings.subtitleMode, subtitleStyle: settings.subtitleStyle, subtitleEnabled: settings.subtitleEnabled });
      setActive(await api.get<VideoProject>(`/video-projects/${active.id}`));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="mx-auto max-w-4xl animate-pulse space-y-4 p-6"><div className="h-8 w-64 rounded bg-muted" /><div className="h-48 rounded-xl bg-muted" /></div>;
  const pct = progress?.progress ?? active?.progress ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href={`/books/${bookId}`}><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button></Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Clapperboard className="h-6 w-6" /> AI Film Studio</h1>
      </div>
      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5" /> 1. Manuscript</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {manuscript ? (
            <div className="space-y-1 text-sm">
              <p><strong>{manuscript.originalFileName}</strong> ({manuscript.fileType}) — {Math.round(manuscript.fileSize / 1024)} KB</p>
              <p>Status: <Badge variant={manuscript.extractionStatus === "COMPLETED" ? "default" : "secondary"}>{manuscript.extractionStatus}</Badge>
                {manuscript.extractedWordCount != null && <> · {manuscript.extractedWordCount.toLocaleString()} words</>}
                {manuscript.chapters && <> · {manuscript.chapters.length} chapters</>}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Upload the full manuscript (PDF, DOCX, or TXT).</p>
              <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
              <Button onClick={handleUpload} disabled={!uploadFile || busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Upload manuscript</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {manuscript?.extractionStatus === "COMPLETED" && !active && (
        <Card>
          <CardHeader><CardTitle className="text-lg">2. Production settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Visual style
                <select className="mt-1 w-full rounded border bg-background px-3 py-2" value={settings.visualStyle} onChange={(e) => setSettings((s) => ({ ...s, visualStyle: e.target.value }))}>
                  <option value="CINEMATIC_REALISM">Cinematic Realism</option><option value="ANIMATION">Animation</option><option value="ANIME">Anime</option><option value="DOCUMENTARY">Documentary</option><option value="FANTASY">Fantasy</option>
                </select>
              </label>
              <label className="text-sm">Aspect ratio
                <select className="mt-1 w-full rounded border bg-background px-3 py-2" value={settings.aspectRatio} onChange={(e) => setSettings((s) => ({ ...s, aspectRatio: e.target.value }))}>
                  <option value="RATIO_16_9">16:9</option><option value="RATIO_9_16">9:16</option><option value="RATIO_1_1">1:1</option>
                </select>
              </label>
              <label className="text-sm">Subtitle mode
                <select className="mt-1 w-full rounded border bg-background px-3 py-2" value={settings.subtitleMode} onChange={(e) => setSettings((s) => ({ ...s, subtitleMode: e.target.value }))}>
                  <option value="OFF">Off</option><option value="SOFT">Soft (SRT/VTT/ASS)</option><option value="BURNED_IN">Burned-in</option>
                </select>
              </label>
              <label className="text-sm">Subtitle style
                <select className="mt-1 w-full rounded border bg-background px-3 py-2" value={settings.subtitleStyle} onChange={(e) => setSettings((s) => ({ ...s, subtitleStyle: e.target.value }))}>
                  <option value="CLASSIC">Classic</option><option value="MODERN">Modern</option><option value="CINEMATIC">Cinematic</option><option value="MINIMAL">Minimal</option><option value="BOLD">Bold</option>
                </select>
              </label>
            </div>
            <Button onClick={createProject} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />} Create video project</Button>
          </CardContent>
        </Card>
      )}

      {active && (
        <>
          <Card>
            <CardHeader><CardTitle className="flex items-center justify-between text-lg"><span>{active.name}</span><Badge>{active.status}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-sm text-muted-foreground"><span>{progress?.stageLabel || active.status}</span><span>{Math.round(pct)}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, pct)}%` }} /></div>
              </div>
              <p className="text-sm text-muted-foreground">Chapters: {active.totalChapters} · Scenes: {active.completedScenes}/{active.totalScenes}
                {active.characters && <> · Characters: {active.characters.length}</>}
                {active.locations && <> · Locations: {active.locations.length}</>}
              </p>
              {active.errorMessage && <p className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{active.errorMessage}</p>}
              {active.filmBible && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">Film Bible</p>
                  {active.filmBible.genre && <p>Genre: {active.filmBible.genre}</p>}
                  {active.filmBible.tone && <p>Tone: {active.filmBible.tone}</p>}
                  {active.filmBible.premise && <p className="mt-1 text-muted-foreground">{active.filmBible.premise}</p>}
                </div>
              )}
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium">Subtitle settings</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs">Mode
                    <select className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm" value={settings.subtitleMode || active.subtitleMode} onChange={(e) => setSettings((s) => ({ ...s, subtitleMode: e.target.value }))}>
                      <option value="OFF">Off</option><option value="SOFT">Soft</option><option value="BURNED_IN">Burned-in</option>
                    </select>
                  </label>
                  <label className="text-xs">Style (ASS)
                    <select className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm" value={settings.subtitleStyle || active.subtitleStyle} onChange={(e) => setSettings((s) => ({ ...s, subtitleStyle: e.target.value }))}>
                      <option value="CLASSIC">Classic</option><option value="MODERN">Modern</option><option value="CINEMATIC">Cinematic</option><option value="MINIMAL">Minimal</option><option value="BOLD">Bold</option>
                    </select>
                  </label>
                </div>
                <Button size="sm" variant="outline" onClick={saveSubtitleSettings} disabled={busy}>Save subtitle settings</Button>
              </div>
              {active.characters && active.characters.some((c) => c.referenceImageUrl) && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Character references</p>
                  <div className="flex flex-wrap gap-2">
                    {active.characters.filter((c) => c.referenceImageUrl).map((c) => (
                      <div key={c.id} className="text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.referenceImageUrl!} alt={c.name} className="h-16 w-16 rounded object-cover" />
                        <p className="text-xs mt-0.5">{c.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {active.status === "DRAFT" && <Button onClick={runAnalyze} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Analyze & plan scenes</Button>}
                {active.totalScenes > 0 && !["GENERATING_VIDEO", "COMPLETED", "DRAFT"].includes(active.status) && (
                  <Button onClick={runGenerate} disabled={busy}><Play className="mr-2 h-4 w-4" /> Generate video</Button>
                )}
                {!["COMPLETED", "CANCELED", "DRAFT"].includes(active.status) && (
                  <Button variant="outline" onClick={pauseOrResume} disabled={busy}>
                    {active.status === "PAUSED" ? <><RefreshCw className="mr-2 h-4 w-4" /> Resume</> : <><Pause className="mr-2 h-4 w-4" /> Pause</>}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {active.scenes && active.scenes.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Scenes & shots</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {active.scenes.slice(0, 80).map((s) => (
                  <div key={s.id} className="rounded-lg border p-3 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Scene {s.sceneNumber}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{s.status}</Badge>
                        {editingSceneId !== s.id && (
                          <Button size="sm" variant="ghost" onClick={() => { setEditingSceneId(s.id); setEditPrompt(s.visualPrompt || ""); setEditNeg(s.negativePrompt || ""); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="line-clamp-2 text-muted-foreground text-xs">{s.sourceText}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Source text (read-only)</p>
                    {editingSceneId === s.id ? (
                      <div className="space-y-2 rounded border bg-muted/20 p-2">
                        <label className="text-xs font-medium">Visual prompt<textarea className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm min-h-[80px]" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} /></label>
                        <label className="text-xs font-medium">Negative prompt<textarea className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm min-h-[40px]" value={editNeg} onChange={(e) => setEditNeg(e.target.value)} /></label>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveScenePrompt(s.id)} disabled={busy}><Save className="mr-1 h-3.5 w-3.5" /> Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingSceneId(null)}><X className="mr-1 h-3.5 w-3.5" /> Cancel</Button>
                        </div>
                      </div>
                    ) : (s.visualPrompt && <p className="text-xs text-muted-foreground line-clamp-2"><strong>Prompt:</strong> {s.visualPrompt}</p>)}
                    {s.shots && s.shots.length > 0 && (
                      <div className="ml-2 space-y-1 border-l pl-3">
                        {s.shots.map((shot) => (
                          <div key={shot.id} className="text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span>Shot {shot.shotNumber}{shot.shotType ? ` · ${shot.shotType}` : ""}{shot.durationSec ? ` · ${shot.durationSec}s` : ""}</span>
                              {editingShotId !== shot.id && (
                                <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => { setEditingShotId(shot.id); setEditShotPrompt(shot.visualPrompt || ""); setEditShotCamera(shot.camera || ""); }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            {editingShotId === shot.id ? (
                              <div className="space-y-1 rounded border bg-muted/20 p-2">
                                <label className="text-[10px]">Camera<input className="mt-0.5 w-full rounded border bg-background px-1.5 py-1 text-xs" value={editShotCamera} onChange={(e) => setEditShotCamera(e.target.value)} /></label>
                                <label className="text-[10px]">Visual prompt<textarea className="mt-0.5 w-full rounded border bg-background px-1.5 py-1 text-xs min-h-[50px]" value={editShotPrompt} onChange={(e) => setEditShotPrompt(e.target.value)} /></label>
                                <div className="flex gap-1">
                                  <Button size="sm" className="h-6 text-xs" onClick={() => saveShotPrompt(shot.id)} disabled={busy}>Save</Button>
                                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingShotId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (shot.visualPrompt && <p className="text-muted-foreground line-clamp-1">{shot.visualPrompt}</p>)}
                          </div>
                        ))}
                      </div>
                    )}
                    {s.videoUrl && <a href={s.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary hover:underline text-xs"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Preview clip</a>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {active.status === "COMPLETED" && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Final film</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {active.cleanVideoUrl && <p>Clean video: <a href={active.cleanVideoUrl} className="text-primary hover:underline" target="_blank" rel="noreferrer">Download</a></p>}
                {active.subtitleVideoUrl && <p>Burned-in: <a href={active.subtitleVideoUrl} className="text-primary hover:underline" target="_blank" rel="noreferrer">Download</a></p>}
                {active.srtUrl && <p>SRT: <a href={active.srtUrl} className="text-primary hover:underline" target="_blank" rel="noreferrer">Download</a></p>}
                {active.vttUrl && <p>WebVTT: <a href={active.vttUrl} className="text-primary hover:underline" target="_blank" rel="noreferrer">Download</a></p>}
                {active.assUrl && <p>ASS: <a href={active.assUrl} className="text-primary hover:underline" target="_blank" rel="noreferrer">Download</a></p>}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
