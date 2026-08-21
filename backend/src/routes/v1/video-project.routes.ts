import { Router } from 'express';
import { videoProjectController } from '../../controllers/video-project.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { aiGenerationRateLimiter } from '../../middleware/rate-limit.middleware';

const router = Router();
router.use(authenticate);
router.post('/:bookId/video-projects', videoProjectController.create);
router.get('/:bookId/video-projects', videoProjectController.list);
router.get('/video-projects/:projectId', videoProjectController.get);
router.get('/video-projects/:projectId/progress', videoProjectController.progress);
// Book-to-Film generation/analysis/assembly endpoints are far more
// expensive (provider spend, FFmpeg CPU time) than ordinary API requests —
// rate limit them so a user can't spam retries/regenerations into a huge
// provider bill. Read-only endpoints above are left unlimited.
router.post('/video-projects/:projectId/analyze', aiGenerationRateLimiter, videoProjectController.analyze);
router.post('/video-projects/:projectId/plan', aiGenerationRateLimiter, videoProjectController.plan);
router.post('/video-projects/:projectId/generate', aiGenerationRateLimiter, videoProjectController.generate);
router.post('/video-projects/:projectId/pause', videoProjectController.pause);
router.post('/video-projects/:projectId/resume', aiGenerationRateLimiter, videoProjectController.resume);
router.post('/video-projects/:projectId/cancel', videoProjectController.cancel);
router.post('/video-projects/:projectId/render', aiGenerationRateLimiter, videoProjectController.render);
router.post('/video-projects/:projectId/subtitles', aiGenerationRateLimiter, videoProjectController.generateSubtitles);
router.patch('/video-projects/:projectId/subtitle-settings', videoProjectController.updateSubtitleSettings);
router.get('/video-projects/:projectId/scenes', videoProjectController.listScenes);
router.get('/video-scenes/:sceneId', videoProjectController.getScene);
router.post('/video-scenes/:sceneId/regenerate', aiGenerationRateLimiter, videoProjectController.regenerateScene);
router.post('/video-scenes/:sceneId/generate', aiGenerationRateLimiter, videoProjectController.regenerateScene);
router.patch('/video-scenes/:sceneId/prompt', videoProjectController.updateScenePrompt);
router.patch('/video-shots/:shotId/prompt', videoProjectController.updateShotPrompt);
router.post('/video-shots/:shotId/regenerate', aiGenerationRateLimiter, videoProjectController.regenerateShot);
router.post('/video-shots/:shotId/generate-camera', aiGenerationRateLimiter, videoProjectController.generateCameraForShot);
router.post('/video-shots/:shotId/fix-continuity', videoProjectController.fixCameraContinuity);
export default router;
