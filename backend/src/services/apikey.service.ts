import { prisma } from '../config/database';
import { apiKeyRepository } from '../repositories/apikey.repository';
import { generateApiKey } from '../utils/crypto';
import { AppError } from '../utils/helpers';

const MAX_ACTIVE_KEYS = 5;

export const apiKeyService = {
  async list(userId: string) {
    const keys = await apiKeyRepository.findManyForUser(userId);
    // Never return keyHash to the client.
    return keys.map(({ keyHash, ...rest }) => {
      void keyHash;
      return rest;
    });
  },

  async create(userId: string, name: string) {
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    if (!subscription || subscription.plan !== 'AGENCY') {
      throw AppError.forbidden(
        'API keys are available on the Agency plan. Upgrade to generate custom integration keys.',
        'PLAN_UPGRADE_REQUIRED'
      );
    }

    const activeKeys = await apiKeyRepository.findManyForUser(userId);
    if (activeKeys.filter((k) => !k.revokedAt).length >= MAX_ACTIVE_KEYS) {
      throw AppError.badRequest(`You can have at most ${MAX_ACTIVE_KEYS} active API keys`, 'KEY_LIMIT_REACHED');
    }

    const { key, prefix, hash } = generateApiKey();
    const { keyHash, ...record } = await apiKeyRepository.create(userId, name, hash, prefix);
    void keyHash;

    // The raw key is only ever returned once, at creation time.
    return { ...record, rawKey: key };
  },

  async revoke(id: string, userId: string) {
    const existing = await apiKeyRepository.findByIdForUser(id, userId);
    if (!existing) {
      throw AppError.notFound('API key not found');
    }
    if (existing.revokedAt) {
      throw AppError.badRequest('API key is already revoked');
    }
    return apiKeyRepository.revoke(id);
  },
};
