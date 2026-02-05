import { Router, Request, Response } from 'express';
import { keywordRepository, nicheRepository, auditRepository } from '../../db/repositories/index.js';
import logger from '../../utils/logger.js';

const router = Router();

// ============================================
// SEARCH KEYWORDS ROUTES
// ============================================

// GET /api/v1/keywords - List all keywords
router.get('/', async (req: Request, res: Response) => {
  try {
    const { niche, active_only = 'true' } = req.query;

    let keywords;
    if (niche) {
      keywords = await keywordRepository.findByNiche(niche as string);
    } else if (active_only === 'true') {
      keywords = await keywordRepository.findActive();
    } else {
      keywords = await keywordRepository.findAll();
    }

    res.json({
      keywords,
      total: keywords.length,
    });
  } catch (error) {
    logger.error('Error fetching keywords:', error);
    res.status(500).json({ error: 'Failed to fetch keywords' });
  }
});

// POST /api/v1/keywords - Create new keyword
router.post('/', async (req: Request, res: Response) => {
  try {
    const { keyword, niche, is_active = true } = req.body;

    if (!keyword) {
      res.status(400).json({ error: 'keyword is required' });
      return;
    }

    const newKeyword = await keywordRepository.create({
      keyword,
      niche,
      is_active,
    });

    // Log the action
    await auditRepository.log({
      action: 'keyword_added',
      entity_type: 'keyword',
      entity_id: newKeyword.id,
      details: { keyword, niche },
    });

    res.status(201).json(newKeyword);
  } catch (error) {
    logger.error('Error creating keyword:', error);
    res.status(500).json({ error: 'Failed to create keyword' });
  }
});

// GET /api/v1/keywords/:id - Get single keyword
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const keyword = await keywordRepository.findById(req.params.id);
    if (!keyword) {
      res.status(404).json({ error: 'Keyword not found' });
      return;
    }
    res.json(keyword);
  } catch (error) {
    logger.error('Error fetching keyword:', error);
    res.status(500).json({ error: 'Failed to fetch keyword' });
  }
});

// PATCH /api/v1/keywords/:id - Update keyword
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { keyword, niche, is_active } = req.body;

    const updated = await keywordRepository.update(req.params.id, {
      keyword,
      niche,
      is_active,
    });

    if (!updated) {
      res.status(404).json({ error: 'Keyword not found' });
      return;
    }

    res.json(updated);
  } catch (error) {
    logger.error('Error updating keyword:', error);
    res.status(500).json({ error: 'Failed to update keyword' });
  }
});

// DELETE /api/v1/keywords/:id - Delete keyword
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const keyword = await keywordRepository.findById(req.params.id);
    if (!keyword) {
      res.status(404).json({ error: 'Keyword not found' });
      return;
    }

    await keywordRepository.deleteById(req.params.id);

    // Log the action
    await auditRepository.log({
      action: 'keyword_removed',
      entity_type: 'keyword',
      entity_id: req.params.id,
      details: { keyword: keyword.keyword },
    });

    res.json({ success: true, message: 'Keyword deleted' });
  } catch (error) {
    logger.error('Error deleting keyword:', error);
    res.status(500).json({ error: 'Failed to delete keyword' });
  }
});

// POST /api/v1/keywords/:id/toggle - Toggle keyword active status
router.post('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const keyword = await keywordRepository.findById(req.params.id);
    if (!keyword) {
      res.status(404).json({ error: 'Keyword not found' });
      return;
    }

    const updated = await keywordRepository.setActive(req.params.id, !keyword.is_active);
    res.json(updated);
  } catch (error) {
    logger.error('Error toggling keyword:', error);
    res.status(500).json({ error: 'Failed to toggle keyword' });
  }
});

// ============================================
// NICHES ROUTES
// ============================================

// GET /api/v1/keywords/niches - List all niches
router.get('/niches/list', async (req: Request, res: Response) => {
  try {
    const { active_only = 'true' } = req.query;

    let niches;
    if (active_only === 'true') {
      niches = await nicheRepository.findActive();
    } else {
      niches = await nicheRepository.findAll();
    }

    res.json({
      niches,
      total: niches.length,
    });
  } catch (error) {
    logger.error('Error fetching niches:', error);
    res.status(500).json({ error: 'Failed to fetch niches' });
  }
});

// POST /api/v1/keywords/niches - Create new niche
router.post('/niches', async (req: Request, res: Response) => {
  try {
    const { name, description, keywords, is_active = true } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const niche = await nicheRepository.create({
      name,
      description,
      keywords: keywords || [],
      is_active,
    });

    res.status(201).json(niche);
  } catch (error) {
    logger.error('Error creating niche:', error);
    res.status(500).json({ error: 'Failed to create niche' });
  }
});

// GET /api/v1/keywords/niches/:id - Get single niche
router.get('/niches/:id', async (req: Request, res: Response) => {
  try {
    const niche = await nicheRepository.findById(req.params.id);
    if (!niche) {
      res.status(404).json({ error: 'Niche not found' });
      return;
    }
    res.json(niche);
  } catch (error) {
    logger.error('Error fetching niche:', error);
    res.status(500).json({ error: 'Failed to fetch niche' });
  }
});

// PATCH /api/v1/keywords/niches/:id - Update niche
router.patch('/niches/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, keywords, is_active } = req.body;

    const updated = await nicheRepository.update(req.params.id, {
      name,
      description,
      keywords,
      is_active,
    });

    if (!updated) {
      res.status(404).json({ error: 'Niche not found' });
      return;
    }

    res.json(updated);
  } catch (error) {
    logger.error('Error updating niche:', error);
    res.status(500).json({ error: 'Failed to update niche' });
  }
});

// DELETE /api/v1/keywords/niches/:id - Delete niche
router.delete('/niches/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await nicheRepository.deleteById(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Niche not found' });
      return;
    }

    res.json({ success: true, message: 'Niche deleted' });
  } catch (error) {
    logger.error('Error deleting niche:', error);
    res.status(500).json({ error: 'Failed to delete niche' });
  }
});

export default router;
