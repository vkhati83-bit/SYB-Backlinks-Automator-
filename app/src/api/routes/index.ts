import { Router } from 'express';
import healthRoutes from './health.routes.js';
import prospectsRoutes from './prospects.routes.js';
import contactsRoutes from './contacts.routes.js';
import keywordsRoutes from './keywords.routes.js';
import emailsRoutes from './emails.routes.js';
import campaignsRoutes from './campaigns.routes.js';
import responsesRoutes from './responses.routes.js';
import metricsRoutes from './metrics.routes.js';
import settingsRoutes from './settings.routes.js';
import dataFetchRoutes from './data-fetch.routes.js';

const router = Router();

// Health routes
router.use('/health', healthRoutes);

// Data fetch routes
router.use('/data-fetch', dataFetchRoutes);

// Resource routes
router.use('/prospects', prospectsRoutes);
router.use('/contacts', contactsRoutes);
router.use('/keywords', keywordsRoutes);
router.use('/emails', emailsRoutes);
router.use('/campaigns', campaignsRoutes);
router.use('/responses', responsesRoutes);
router.use('/metrics', metricsRoutes);
router.use('/settings', settingsRoutes);

// API info
router.get('/', (req, res) => {
  res.json({
    name: 'SYB Backlinks Gen API',
    version: '1.0.0',
    endpoints: {
      health: {
        base: '/api/v1/health',
        detailed: '/api/v1/health/detailed',
      },
      prospects: {
        list: 'GET /api/v1/prospects',
        get: 'GET /api/v1/prospects/:id',
        grouped: 'GET /api/v1/prospects/grouped',
        approved: 'GET /api/v1/prospects/approved',
        completed: 'GET /api/v1/prospects/completed',
        bulkAction: 'POST /api/v1/prospects/bulk-action',
        outcome: 'PATCH /api/v1/prospects/:id/outcome',
        approval: 'PATCH /api/v1/prospects/:id/approval',
        niche: 'PATCH /api/v1/prospects/:id/niche',
        block: 'POST /api/v1/prospects/:id/block',
      },
      contacts: {
        list: 'GET /api/v1/contacts/:prospectId',
        create: 'POST /api/v1/contacts/:prospectId',
        setPrimary: 'POST /api/v1/contacts/:prospectId/set-primary',
        queue: 'GET /api/v1/contacts/:prospectId/queue',
        addToQueue: 'POST /api/v1/contacts/:prospectId/queue',
        removeFromQueue: 'DELETE /api/v1/contacts/:prospectId/queue/:contactId',
        reorderQueue: 'PATCH /api/v1/contacts/:prospectId/queue/reorder',
      },
      keywords: {
        list: 'GET /api/v1/keywords',
        create: 'POST /api/v1/keywords',
        get: 'GET /api/v1/keywords/:id',
        update: 'PATCH /api/v1/keywords/:id',
        delete: 'DELETE /api/v1/keywords/:id',
        toggle: 'POST /api/v1/keywords/:id/toggle',
        niches: {
          list: 'GET /api/v1/keywords/niches/list',
          create: 'POST /api/v1/keywords/niches',
          get: 'GET /api/v1/keywords/niches/:id',
          update: 'PATCH /api/v1/keywords/niches/:id',
          delete: 'DELETE /api/v1/keywords/niches/:id',
        },
      },
      emails: {
        list: 'GET /api/v1/emails',
        get: 'GET /api/v1/emails/:id',
        approve: 'POST /api/v1/emails/:id/approve',
        reject: 'POST /api/v1/emails/:id/reject',
        regenerate: 'POST /api/v1/emails/:id/regenerate',
      },
      campaigns: {
        list: 'GET /api/v1/campaigns',
        get: 'GET /api/v1/campaigns/:id',
        create: 'POST /api/v1/campaigns',
        update: 'PATCH /api/v1/campaigns/:id',
        activate: 'POST /api/v1/campaigns/:id/activate',
        pause: 'POST /api/v1/campaigns/:id/pause',
      },
      responses: {
        list: 'GET /api/v1/responses',
        get: 'GET /api/v1/responses/:id',
        markHandled: 'POST /api/v1/responses/:id/mark-handled',
        reclassify: 'POST /api/v1/responses/:id/reclassify',
        create: 'POST /api/v1/responses',
      },
      metrics: {
        summary: 'GET /api/v1/metrics/summary',
        daily: 'GET /api/v1/metrics/daily',
        bySource: 'GET /api/v1/metrics/by-source',
        byType: 'GET /api/v1/metrics/by-type',
        responseBreakdown: 'GET /api/v1/metrics/response-breakdown',
        qualityImpact: 'GET /api/v1/metrics/quality-impact',
      },
      settings: {
        list: 'GET /api/v1/settings',
        get: 'GET /api/v1/settings/:key',
        update: 'PUT /api/v1/settings/:key',
        bulkUpdate: 'PUT /api/v1/settings',
        blocklist: {
          domains: 'GET /api/v1/settings/blocklist/domains',
          emails: 'GET /api/v1/settings/blocklist/emails',
          add: 'POST /api/v1/settings/blocklist',
          remove: 'DELETE /api/v1/settings/blocklist',
        },
      },
    },
  });
});

export default router;
