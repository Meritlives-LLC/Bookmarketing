import { Request, Response, NextFunction } from 'express';
import { videoProjectService } from '../services/video-project.service';
import { videoSceneRepository } from '../repositories/video-scene.repository';
import { AppError } from '../utils/helpers';

export const videoProjectController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await videoProjectService.create(req.user!.id, req.params.bookId, req.body || {}) }); }
    catch (error) { next(error); }
  },
  async list(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await videoProjectService.listForBook(req.user!.id, req.params.bookId) }); }
    catch (error) { next(error); }
  },
  async get(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await videoProjectService.get(req.user!.id, req.params.projectId) }); }
    catch (error) { next(error); }
  },
  async progress(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await videoProjectService.getProgress(req.user!.id, req.params.projectId) }); }
    catch (error) { next(error); }
  },
  async analyze(req: Request, res: Response, next: NextFunction) {
    try { res.status(202).json({ success: true, data: await videoProjectService.startAnalysis(req.user!.id, req.params.projectId) }); }
    catch (error) { next(error); }
  },
  async plan(req: Request, res: Response, next: NextFunction) {
    try { res.status(202).json({ success: true, data: await videoProjectService.startPlanning(req.user!.id, req.params.projectId) }); }
    catch (error) { next(error); }
  },
  async generate(req: Request, res: Response, next: NextFunction) {
    try { res.status(202).json({ success: true, data: await videoProjectService.startGeneration(req.user!.id, req.params.projectId, { sceneId: req.body?.sceneId }) }); }
    catch (error) { next(error); }
  },
  async pause(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await videoProjectService.pause(req.user!.id, req.params.projectId) }); }
    catch (error) { next(error); }
  },
  async resume(req: Request, res: Response, next: NextFunction) {
    try { res.status(202).json({ success: true, data: await videoProjectService.resume(req.user!.id, req.params.projectId) }); }
    catch (error) { next(error); }
  },
  async cancel(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await videoProjectService.cancel(req.user!.id, req.params.projectId) }); }
    catch (error) { next(error); }
  },
  async render(req: Request, res: Response, next: NextFunction) {
    try { res.status(202).json({ success: true, data: await videoProjectService.renderFinal(req.user!.id, req.params.projectId) }); }
    catch (error) { next(error); }
  },
  async listScenes(req: Request, res: Response, next: NextFunction) {
    try { const project = await videoProjectService.get(req.user!.id, req.params.projectId); res.json({ success: true, data: project.scenes }); }
    catch (error) { next(error); }
  },
  async getScene(req: Request, res: Response, next: NextFunction) {
    try {
      const scene = await videoSceneRepository.findByIdForUser(req.params.sceneId, req.user!.id);
      if (!scene) throw AppError.notFound('Scene not found');
      res.json({ success: true, data: scene });
    } catch (error) { next(error); }
  },
  async regenerateScene(req: Request, res: Response, next: NextFunction) {
    try { res.status(202).json({ success: true, data: await videoProjectService.regenerateScene(req.user!.id, req.params.sceneId) }); }
    catch (error) { next(error); }
  },
  async regenerateShot(req: Request, res: Response, next: NextFunction) {
    try { res.status(202).json({ success: true, data: await videoProjectService.regenerateShot(req.user!.id, req.params.shotId) }); }
    catch (error) { next(error); }
  },
  async updateScenePrompt(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await videoProjectService.updateScenePrompt(req.user!.id, req.params.sceneId, req.body || {}) }); }
    catch (error) { next(error); }
  },
  async updateShotPrompt(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await videoProjectService.updateShotPrompt(req.user!.id, req.params.shotId, req.body || {}) }); }
    catch (error) { next(error); }
  },
  async updateSubtitleSettings(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await videoProjectService.updateSubtitleSettings(req.user!.id, req.params.projectId, req.body || {}) }); }
    catch (error) { next(error); }
  },
  async generateSubtitles(req: Request, res: Response, next: NextFunction) {
    try { res.status(202).json({ success: true, data: await videoProjectService.generateSubtitles(req.user!.id, req.params.projectId) }); }
    catch (error) { next(error); }
  },
};
