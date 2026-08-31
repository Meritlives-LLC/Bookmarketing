import { z } from 'zod';
import {
  VisualStyle,
  VideoAspectRatio,
  SubtitleMode,
  SubtitleStyle,
  CameraMovement,
  CameraSpeed,
  CameraRig,
  CameraAngle,
  CameraFraming,
  FocusMode,
  DepthOfField,
  MovementPurpose,
} from '@prisma/client';

export const createVideoProjectSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  visualStyle: z.nativeEnum(VisualStyle).optional(),
  aspectRatio: z.nativeEnum(VideoAspectRatio).optional(),
  resolution: z.string().trim().max(50).optional(),
  videoModel: z.string().trim().max(100).optional(),
  subtitleEnabled: z.boolean().optional(),
  subtitleMode: z.nativeEnum(SubtitleMode).optional(),
  subtitleStyle: z.nativeEnum(SubtitleStyle).optional(),
  subtitleConfig: z.record(z.string(), z.unknown()).optional(),
  narrationWordsPerMinute: z.number().int().min(60).max(300).optional(),
  narrationVoice: z.string().trim().min(1).max(100).optional(),
}).strict();

// videoProjectController.generate reads only req.body?.sceneId.
export const generateVideoSchema = z.object({
  sceneId: z.string().trim().min(1).max(100).optional(),
}).strict();

// Matches videoProjectService.updateScenePrompt's { visualPrompt?, negativePrompt?, cameraPlan? }.
export const updateScenePromptSchema = z.object({
  visualPrompt: z.string().trim().min(1).max(10_000).optional(),
  negativePrompt: z.string().trim().max(10_000).optional(),
  cameraPlan: z.string().trim().max(10_000).optional(),
}).strict();

// Matches the `allowed` field list + cameraKeys in videoProjectService.updateShotPrompt.
export const updateShotPromptSchema = z.object({
  visualPrompt: z.string().trim().max(10_000).optional(),
  camera: z.string().trim().max(10_000).optional(),
  shotType: z.string().trim().max(100).optional(),
  durationSec: z.number().positive().max(120).optional(),
  cameraMovement: z.nativeEnum(CameraMovement).optional(),
  cameraSpeed: z.nativeEnum(CameraSpeed).optional(),
  cameraDirection: z.string().trim().max(200).optional(),
  cameraAngle: z.nativeEnum(CameraAngle).optional(),
  cameraRig: z.nativeEnum(CameraRig).optional(),
  lens: z.string().trim().max(50).optional(),
  focalLength: z.string().trim().max(50).optional(),
  framing: z.nativeEnum(CameraFraming).optional(),
  composition: z.string().trim().max(200).optional(),
  focusMode: z.nativeEnum(FocusMode).optional(),
  depthOfField: z.nativeEnum(DepthOfField).optional(),
  movementPurpose: z.nativeEnum(MovementPurpose).optional(),
  movement: z.string().trim().max(200).optional(),
  lighting: z.string().trim().max(500).optional(),
  negativePrompt: z.string().trim().max(10_000).optional(),
  recompilePrompt: z.boolean().optional(),
}).strict();

// Matches videoProjectService.updateSubtitleSettings's
// { subtitleMode?, subtitleStyle?, subtitleConfig?, subtitleEnabled? }.
export const updateSubtitleSettingsSchema = z.object({
  subtitleMode: z.nativeEnum(SubtitleMode).optional(),
  subtitleStyle: z.nativeEnum(SubtitleStyle).optional(),
  subtitleConfig: z.record(z.string(), z.unknown()).optional(),
  subtitleEnabled: z.boolean().optional(),
}).strict();
