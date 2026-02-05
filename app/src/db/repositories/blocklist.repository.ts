import { BaseRepository } from './base.repository.js';
import { BlocklistEntry, BlocklistType } from '../../types/index.js';

export interface CreateBlocklistInput {
  type: BlocklistType;
  value: string;
  reason?: string;
  added_by?: string;
}

export class BlocklistRepository extends BaseRepository<BlocklistEntry> {
  constructor() {
    super('blocklist');
  }

  async add(input: CreateBlocklistInput): Promise<BlocklistEntry> {
    const result = await this.queryOne<BlocklistEntry>(`
      INSERT INTO blocklist (type, value, reason, added_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (type, value) DO UPDATE SET
        reason = COALESCE(EXCLUDED.reason, blocklist.reason)
      RETURNING *
    `, [
      input.type,
      input.value.toLowerCase(),
      input.reason || null,
      input.added_by || null,
    ]);
    return result!;
  }

  async remove(type: BlocklistType, value: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM blocklist WHERE type = $1 AND value = $2',
      [type, value.toLowerCase()]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async isBlocked(type: BlocklistType, value: string): Promise<boolean> {
    const result = await this.queryOne<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM blocklist WHERE type = $1 AND value = $2) as exists',
      [type, value.toLowerCase()]
    );
    return result?.exists || false;
  }

  async isDomainBlocked(domain: string): Promise<boolean> {
    return this.isBlocked('domain', domain);
  }

  async isEmailBlocked(email: string): Promise<boolean> {
    return this.isBlocked('email', email);
  }

  async containsBlockedKeyword(text: string): Promise<boolean> {
    const result = await this.queryOne<{ exists: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM blocklist
        WHERE type = 'keyword' AND $1 ILIKE '%' || value || '%'
      ) as exists
    `, [text]);
    return result?.exists || false;
  }

  async findByType(type: BlocklistType): Promise<BlocklistEntry[]> {
    return this.query<BlocklistEntry>(
      'SELECT * FROM blocklist WHERE type = $1 ORDER BY created_at DESC',
      [type]
    );
  }

  async getAllDomains(): Promise<string[]> {
    const result = await this.query<{ value: string }>(
      "SELECT value FROM blocklist WHERE type = 'domain'"
    );
    return result.map(r => r.value);
  }

  async getAllEmails(): Promise<string[]> {
    const result = await this.query<{ value: string }>(
      "SELECT value FROM blocklist WHERE type = 'email'"
    );
    return result.map(r => r.value);
  }

  async getAllKeywords(): Promise<string[]> {
    const result = await this.query<{ value: string }>(
      "SELECT value FROM blocklist WHERE type = 'keyword'"
    );
    return result.map(r => r.value);
  }
}

export const blocklistRepository = new BlocklistRepository();
export default blocklistRepository;
