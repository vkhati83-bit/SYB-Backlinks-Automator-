/**
 * Trash Cleanup Worker
 *
 * Runs daily cron job to permanently delete prospects
 * that have been in trash for 90+ days
 */

import cron from 'node-cron';
import { prospectRepository } from '../db/repositories/index.js';
import logger from '../utils/logger.js';

/**
 * Cleanup old trash (prospects deleted 90+ days ago)
 */
async function cleanupOldTrash(): Promise<void> {
  try {
    logger.info('Starting trash cleanup job...');

    // Find prospects ready for permanent deletion
    const readyForDeletion = await prospectRepository.findReadyForPermanentDeletion(100);

    if (readyForDeletion.length === 0) {
      logger.info('No prospects ready for permanent deletion');
      return;
    }

    logger.info(`Found ${readyForDeletion.length} prospects in trash for 90+ days`);

    // Log details before deletion
    const deletionSummary = readyForDeletion.map(p => ({
      id: p.id,
      domain: p.domain,
      deleted_at: p.deleted_at,
      days_in_trash: Math.floor(
        (new Date().getTime() - new Date(p.deleted_at!).getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));

    logger.info('Prospects to be permanently deleted:', deletionSummary);

    // Permanently delete
    const deleted = await prospectRepository.cleanupOldTrash();

    logger.info(`✅ Trash cleanup complete: ${deleted} prospects permanently deleted`);

    // Log summary
    if (deleted > 0) {
      logger.warn(`⚠️  PERMANENT DELETION: ${deleted} prospects removed from database (cannot be recovered)`);
    }
  } catch (error) {
    logger.error('Trash cleanup job failed:', error);
  }
}

/**
 * Schedule daily cleanup at 2:00 AM
 */
export function startTrashCleanupScheduler(): void {
  // Run every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('⏰ Scheduled trash cleanup triggered (2:00 AM)');
    await cleanupOldTrash();
  });

  logger.info('✅ Trash cleanup scheduler started (runs daily at 2:00 AM)');
}

/**
 * Run cleanup manually (for testing or immediate cleanup)
 */
export async function runCleanupNow(): Promise<{ deleted: number; details: any[] }> {
  logger.info('Running manual trash cleanup...');

  const readyForDeletion = await prospectRepository.findReadyForPermanentDeletion(100);
  const details = readyForDeletion.map(p => ({
    id: p.id,
    domain: p.domain,
    deleted_at: p.deleted_at,
    days_in_trash: Math.floor(
      (new Date().getTime() - new Date(p.deleted_at!).getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));

  const deleted = await prospectRepository.cleanupOldTrash();

  return { deleted, details };
}

export default {
  startTrashCleanupScheduler,
  runCleanupNow,
  cleanupOldTrash,
};
