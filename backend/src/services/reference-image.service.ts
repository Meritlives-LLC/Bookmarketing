import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { storageService } from './storage.service';

function buildCharacterPrompt(c: { name: string; age?: string | null; gender?: string | null; physicalAppearance?: string | null; clothing?: string | null; role?: string | null }): string {
  const parts = ['Cinematic character reference portrait, single subject, neutral studio backdrop, consistent face for film continuity, photorealistic,', `character named ${c.name}`];
  if (c.age) parts.push(`age ${c.age}`);
  if (c.gender) parts.push(c.gender);
  if (c.physicalAppearance) parts.push(c.physicalAppearance);
  if (c.clothing) parts.push(`wearing ${c.clothing}`);
  if (c.role) parts.push(`role: ${c.role}`);
  parts.push('centered composition, soft key light, 85mm lens look, high detail face');
  return parts.join(' ');
}
function buildLocationPrompt(l: { name: string; description?: string | null; architecture?: string | null; environment?: string | null; timePeriod?: string | null; visualDescription?: string | null }): string {
  const parts = ['Cinematic establishing location reference, wide shot, no people, film still,', l.name];
  if (l.visualDescription) parts.push(l.visualDescription); else if (l.description) parts.push(l.description);
  if (l.architecture) parts.push(l.architecture);
  if (l.environment) parts.push(l.environment);
  if (l.timePeriod) parts.push(`period: ${l.timePeriod}`);
  parts.push('natural lighting, depth of field, production design reference');
  return parts.join(' ');
}
function buildPropPrompt(p: { name: string; description?: string | null; visualDescription?: string | null }): string {
  const parts = ['Cinematic prop reference on neutral background, product-style hero shot, film still,', p.name];
  if (p.visualDescription) parts.push(p.visualDescription); else if (p.description) parts.push(p.description);
  parts.push('high detail, consistent design for continuity');
  return parts.join(' ');
}

async function generateImageWithGemini(prompt: string): Promise<Buffer | null> {
  const apiKey = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
  if (!apiKey) return null;
  const model = process.env.GEMINI_IMAGE_MODEL || process.env.IMAGE_MODEL || 'imagen-3.0-generate-002';
  const base = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${model}:predict?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
    });
    if (!res.ok) { logger.warn('Gemini image generation failed', { status: res.status }); return null; }
    const json = (await res.json()) as { predictions?: Array<{ bytesBase64Encoded?: string }> };
    const b64 = json.predictions?.[0]?.bytesBase64Encoded;
    return b64 ? Buffer.from(b64, 'base64') : null;
  } catch (e) {
    logger.warn('Gemini image network error', { error: (e as Error).message });
    return null;
  }
}

export const referenceImageService = {
  buildCharacterPrompt, buildLocationPrompt, buildPropPrompt,
  async generateForProject(videoProjectId: string, opts?: { force?: boolean }) {
    const characters = await prisma.videoCharacter.findMany({ where: { videoProjectId } });
    const locations = await prisma.videoLocation.findMany({ where: { videoProjectId } });
    const props = await prisma.videoProp.findMany({ where: { videoProjectId } });
    let cDone = 0, lDone = 0, pDone = 0, skipped = 0;
    for (const c of characters) {
      if (c.referenceImageUrl && !opts?.force) { skipped++; continue; }
      const prompt = buildCharacterPrompt(c);
      const buf = await generateImageWithGemini(prompt);
      let url: string | null = null;
      if (buf) {
        const key = await storageService.uploadBuffer(buf, 'image/png', `book-video/${videoProjectId}/references/characters`);
        url = storageService.publicUrl(key);
      }
      await prisma.videoCharacter.update({ where: { id: c.id }, data: { referenceImageUrl: url ?? c.referenceImageUrl, continuityNotes: prompt } });
      if (url) cDone++; else skipped++;
    }
    for (const loc of locations) {
      if (loc.referenceImageUrl && !opts?.force) { skipped++; continue; }
      const prompt = buildLocationPrompt(loc);
      const buf = await generateImageWithGemini(prompt);
      let url: string | null = null;
      if (buf) {
        const key = await storageService.uploadBuffer(buf, 'image/png', `book-video/${videoProjectId}/references/locations`);
        url = storageService.publicUrl(key);
      }
      await prisma.videoLocation.update({ where: { id: loc.id }, data: { referenceImageUrl: url ?? loc.referenceImageUrl, visualDescription: loc.visualDescription || prompt, continuityNotes: prompt } });
      if (url) lDone++; else skipped++;
    }
    for (const prop of props) {
      if (prop.referenceImageUrl && !opts?.force) { skipped++; continue; }
      const prompt = buildPropPrompt(prop);
      const buf = await generateImageWithGemini(prompt);
      let url: string | null = null;
      if (buf) {
        const key = await storageService.uploadBuffer(buf, 'image/png', `book-video/${videoProjectId}/references/props`);
        url = storageService.publicUrl(key);
      }
      await prisma.videoProp.update({ where: { id: prop.id }, data: { referenceImageUrl: url ?? prop.referenceImageUrl, visualDescription: prop.visualDescription || prompt, continuityNotes: prompt } });
      if (url) pDone++; else skipped++;
    }
    logger.info('Reference generation complete', { videoProjectId, characters: cDone, locations: lDone, props: pDone, skipped });
    return { characters: cDone, locations: lDone, props: pDone, skipped };
  },
};
