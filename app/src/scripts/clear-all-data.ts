import { db } from '../db/index.js';
import logger from '../utils/logger.js';

async function clearAllData() {
  try {
    logger.info('Clearing all prospect-related data...');

    // Delete in correct order (respecting foreign keys)
    await db.query('DELETE FROM emails');
    logger.info('✓ Cleared emails');

    await db.query('DELETE FROM contacts');
    logger.info('✓ Cleared contacts');

    await db.query('DELETE FROM prospects');
    logger.info('✓ Cleared prospects');

    // Get counts to verify
    const emailCount = await db.query('SELECT COUNT(*) FROM emails');
    const contactCount = await db.query('SELECT COUNT(*) FROM contacts');
    const prospectCount = await db.query('SELECT COUNT(*) FROM prospects');

    logger.info('Database cleared successfully!');
    logger.info(`Emails: ${emailCount.rows[0].count}`);
    logger.info(`Contacts: ${contactCount.rows[0].count}`);
    logger.info(`Prospects: ${prospectCount.rows[0].count}`);

    process.exit(0);
  } catch (error) {
    logger.error('Error clearing database:', error);
    process.exit(1);
  }
}

clearAllData();
