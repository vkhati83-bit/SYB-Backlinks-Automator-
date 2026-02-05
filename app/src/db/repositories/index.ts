// Repository exports
export { BaseRepository } from './base.repository.js';
export { prospectRepository, ProspectRepository } from './prospect.repository.js';
export { contactRepository, ContactRepository } from './contact.repository.js';
export { emailRepository, EmailRepository } from './email.repository.js';
export { campaignRepository, CampaignRepository } from './campaign.repository.js';
export { sequenceRepository, SequenceRepository } from './sequence.repository.js';
export { responseRepository, ResponseRepository } from './response.repository.js';
export { blocklistRepository, BlocklistRepository } from './blocklist.repository.js';
export { settingsRepository, SettingsRepository } from './settings.repository.js';
export { auditRepository, AuditRepository } from './audit.repository.js';
export { keywordRepository, KeywordRepository, nicheRepository, NicheRepository } from './keyword.repository.js';

// Type exports
export type { CreateProspectInput, UpdateProspectInput, ProspectFilters } from './prospect.repository.js';
export type { CreateContactInput, UpdateContactInput } from './contact.repository.js';
export type { CreateEmailInput, UpdateEmailInput } from './email.repository.js';
export type { CreateCampaignInput, UpdateCampaignInput } from './campaign.repository.js';
export type { CreateSequenceInput } from './sequence.repository.js';
export type { CreateResponseInput } from './response.repository.js';
export type { CreateBlocklistInput } from './blocklist.repository.js';
export type { CreateAuditLogInput } from './audit.repository.js';
export type { CreateKeywordInput, UpdateKeywordInput, CreateNicheInput, UpdateNicheInput } from './keyword.repository.js';
