import { Router } from 'express';
import multer from 'multer';
import { manuscriptController } from '../../controllers/manuscript.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { MANUSCRIPT_MAX_FILE_SIZE_BYTES } from '../../validators/manuscript.validator';

// Memory storage: the file never touches local disk. manuscriptService streams
// the buffer straight to S3 (storageService.uploadBuffer), so this is safe
// even for the largest manuscripts we accept.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MANUSCRIPT_MAX_FILE_SIZE_BYTES, files: 1 },
});

const router = Router();

router.use(authenticate);

router.post('/:bookId/manuscript', upload.single('manuscript'), manuscriptController.upload);
router.get('/:bookId/manuscript', manuscriptController.getForBook);
router.delete('/:bookId/manuscript', manuscriptController.remove);

export default router;
