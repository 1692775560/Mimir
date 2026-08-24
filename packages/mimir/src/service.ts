/**
 * The `research` Remote namespace: the host half of the web research panel.
 * This file is a thin facade — it keeps the class, the `super(ctx,
 * 'research')` registration, the config type, the Context augmentation, and
 * all 58 `@Remote` signatures intact, and forwards every method body to a
 * pure-function domain module under `./services`. It owns no domain logic:
 * the mutable instance state (`compileStatus` map, `jobSeq` counter) rides a
 * single {@link ServiceState} object created here, so every
 * `new ResearchService` gets its own copy.
 * @module dsh-mimir/src/service
 */

import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { ResearchWikiDomain } from './store.ts'
import type { SvgConversionDeps } from './svg-convert.ts'
import type { LatexToolOptions } from './tools/latex.ts'
import type {
  ArxivEntry,
  BibEntry,
  ExperimentInput,
  ResearchArtifactResult,
  ResearchArxivSubscriptionsResult,
  ResearchBibliographyResult,
  ResearchCheckArxivSubscriptionsResult,
  ResearchCheckServerResult,
  ResearchCompileResult,
  ResearchCompileStatusResult,
  ResearchConvertFigureResult,
  ResearchDeleteExperimentResult,
  ResearchDeleteArxivSubscriptionResult,
  ResearchDeleteFigureResult,
  ResearchDeleteJobResult,
  ResearchDeleteServerResult,
  ResearchExperimentsResult,
  ResearchExportWikiResult,
  ResearchFetchPaperPdfResult,
  ResearchFiguresResult,
  ResearchImportBibResult,
  ResearchImportPaperResult,
  ResearchImportWikiMode,
  ResearchImportWikiResult,
  ResearchListBackupsResult,
  ResearchListJobsResult,
  ResearchListProjectsResult,
  ResearchListServersResult,
  ResearchOutlineResult,
  ResearchPaperSnapshotResult,
  ResearchPaperSnapshotsResult,
  ResearchPaperSourceResult,
  ResearchPapersResult,
  ResearchRemovePaperResult,
  ResearchRenameFigureResult,
  ResearchRevertPaperSnapshotResult,
  ResearchSaveBibliographyResult,
  ResearchSaveExperimentResult,
  ResearchSaveFigureResult,
  ResearchSavePaperSourceResult,
  ResearchSaveArxivSubscriptionResult,
  ResearchSaveServerResult,
  ResearchSearchArxivResult,
  ResearchSubmitJobResult,
  ResearchUpdateExperimentResult,
  ResearchUpdateFigureResult,
  ResearchUpdatePaperResult,
  ResearchVenueTemplatesResult,
  ResearchApplyVenueResult,
  ResearchClearVenueResult,
  ResearchDeleteMeetingDeckResult,
  ResearchGenerateMeetingResult,
  ResearchMeetingDecksResult,
  MeetingInclude,
  ResearchWikiSnapshot,
  ResearchCheckZoteroResult,
  ResearchZoteroCollectionsResult,
  ResearchZoteroExportResult,
  ResearchZoteroImportResult,
  ResearchZoteroSearchResult,
  SectionMove,
  SectionOutlineTitles,
  ServerInput,
  SubsectionMove,
} from './types.ts'
import * as paper from './services/paper.ts'
import * as paperSnapshots from './services/paper-snapshots.ts'
import * as library from './services/library.ts'
import * as zotero from './services/zotero.ts'
import * as subscriptions from './services/subscriptions.ts'
import * as experiment from './services/experiment.ts'
import * as server from './services/server.ts'
import * as wikiAdmin from './services/wiki-admin.ts'
import * as venue from './services/venue.ts'
import * as meeting from './services/meeting.ts'
import type { ServiceState } from './services/common.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The research panel's host service (the `research` Remote namespace). */
    research: ResearchService
  }
}

/** Everything the service needs from the plugin's apply scope. */
export interface ResearchServiceConfig {
  /** Absolute research workspace root (already resolved by the plugin). */
  readonly workspaceDir: string
  /** Open research-wiki domain handle owned by the plugin. */
  readonly domain: ResearchWikiDomain
  /** Resolved LaTeX deployment knobs. */
  readonly latex: LatexToolOptions
  /**
   * Resolved scheduled-backup knobs (`dir` already absolute); absent in
   * tests and direct constructions — `listBackups` then reports disabled.
   */
  readonly backup?: {
    readonly enabled: boolean
    readonly intervalMinutes: number
    readonly keep: number
    readonly dir: string
  }
  /**
   * Probe/run overrides for the SVG conversion behind `convertFigure` /
   * `saveFigure`; absent outside tests, where the real PATH probe and
   * process runner apply.
   */
  readonly svg?: SvgConversionDeps
  /**
   * Resolved Zotero Web API credentials; absent (or empty) disables the
   * integration — every Zotero Remote method then rejects `invalid-input`
   * (`checkZotero` reports `unconfigured`). The key is a secret: it only
   * ever reaches the API as a header.
   */
  readonly zotero?: {
    readonly apiKey: string
    readonly userId: string
  }
}

/**
 * Host service behind the web research panel. Thin facade: keeps the
 * `research` Remote namespace and all 58 `@Remote` signatures; every method
 * body forwards to a domain module under `./services`. Owns no domain logic.
 */
export class ResearchService extends TypertRemoteService {
  /** Read-only injection (workspaceDir/domain/latex/backup from the config). */
  private readonly deps: ResearchServiceConfig
  /** The only mutable instance state (compileStatus / jobSeq). */
  private readonly state: ServiceState

  /**
   * @param ctx - Host context the service registers on (`ctx.research`).
   * @param config - Workspace root, open wiki domain, and LaTeX knobs.
   */
  constructor(ctx: Context, config: ResearchServiceConfig) {
    super(ctx, 'research')
    if (config.workspaceDir.trim().length === 0) {
      throw new TypeError('research: workspaceDir must be a non-empty absolute path')
    }
    this.deps = {
      workspaceDir: config.workspaceDir,
      domain: config.domain,
      latex: config.latex,
      ...(config.backup === undefined ? {} : { backup: config.backup }),
      ...(config.svg === undefined ? {} : { svg: config.svg }),
      ...(config.zotero === undefined ? {} : { zotero: config.zotero }),
    }
    this.state = { compileStatus: new Map(), jobSeq: 0 }
  }

  // wiki-admin domain
  @Remote('listProjects')
  listProjects(): Promise<ResearchListProjectsResult> {
    return wikiAdmin.listProjects(this.deps)
  }

  // paper domain: outline / source / bibliography / compile
  @Remote('getPaperOutline')
  getPaperOutline(request: { projectId: string; dir?: string | undefined }): Promise<ResearchOutlineResult> {
    return paper.getPaperOutline(this.deps, request)
  }

  // library domain
  @Remote('listPapers')
  listPapers(): Promise<ResearchPapersResult> {
    return library.listPapers(this.deps)
  }

  @Remote('searchArxiv')
  searchArxiv(request: { query: string; maxResults?: number }): Promise<ResearchSearchArxivResult> {
    return library.searchArxiv(this.deps, request)
  }

  @Remote('importPaper')
  importPaper(request: { entry: ArxivEntry; projectId?: string | undefined }): Promise<ResearchImportPaperResult> {
    return library.importPaper(this.deps, request)
  }

  @Remote('removePaper')
  removePaper(request: { arxivId: string }): Promise<ResearchRemovePaperResult> {
    return library.removePaper(this.deps, request)
  }

  @Remote('updatePaper')
  updatePaper(request: {
    arxivId: string
    tags?: string[] | undefined
    projectIds?: string[] | undefined
    notes?: string | undefined
    relevance?: { projectId: string; score: number; reason: string } | undefined
  }): Promise<ResearchUpdatePaperResult> {
    return library.updatePaper(this.deps, request)
  }

  @Remote('fetchPaperPdf')
  fetchPaperPdf(request: { arxivId: string }): Promise<ResearchFetchPaperPdfResult> {
    return library.fetchPaperPdf(this.deps, request)
  }

  // zotero domain: read-only bridge to a configured Zotero user library
  @Remote('checkZotero')
  checkZotero(): Promise<ResearchCheckZoteroResult> {
    return zotero.checkZotero(this.deps)
  }

  @Remote('listZoteroCollections')
  listZoteroCollections(): Promise<ResearchZoteroCollectionsResult> {
    return zotero.listZoteroCollections(this.deps)
  }

  @Remote('searchZotero')
  searchZotero(request: { query: string; maxResults?: number }): Promise<ResearchZoteroSearchResult> {
    return zotero.searchZotero(this.deps, request)
  }

  @Remote('importZoteroItem')
  importZoteroItem(request: { key: string; projectId?: string | undefined }): Promise<ResearchZoteroImportResult> {
    return zotero.importZoteroItem(this.deps, request)
  }

  @Remote('exportZoteroCollectionToBib')
  exportZoteroCollectionToBib(request: {
    projectId: string
    collectionKey: string
    dir?: string | undefined
  }): Promise<ResearchZoteroExportResult> {
    return zotero.exportZoteroCollectionToBib(this.deps, request)
  }

  // subscription domain: arXiv new-paper checks (pure filesystem storage)
  @Remote('listArxivSubscriptions')
  listArxivSubscriptions(): Promise<ResearchArxivSubscriptionsResult> {
    return subscriptions.listArxivSubscriptions(this.deps)
  }

  @Remote('saveArxivSubscription')
  saveArxivSubscription(request: { query: string }): Promise<ResearchSaveArxivSubscriptionResult> {
    return subscriptions.saveArxivSubscription(this.deps, request)
  }

  @Remote('deleteArxivSubscription')
  deleteArxivSubscription(request: { id: string }): Promise<ResearchDeleteArxivSubscriptionResult> {
    return subscriptions.deleteArxivSubscription(this.deps, request)
  }

  @Remote('checkArxivSubscriptions')
  checkArxivSubscriptions(request: { id?: string }): Promise<ResearchCheckArxivSubscriptionsResult> {
    return subscriptions.checkArxivSubscriptions(this.deps, request)
  }

  // experiment domain
  @Remote('listExperiments')
  listExperiments(request: { projectId?: string }): Promise<ResearchExperimentsResult> {
    return experiment.listExperiments(this.deps, request)
  }

  @Remote('deleteExperiment')
  deleteExperiment(request: { id: string }): Promise<ResearchDeleteExperimentResult> {
    return experiment.deleteExperiment(this.deps, request)
  }

  @Remote('saveExperiment')
  saveExperiment(request: { experiment: ExperimentInput }): Promise<ResearchSaveExperimentResult> {
    return experiment.saveExperiment(this.deps, request)
  }

  @Remote('updateExperiment')
  updateExperiment(request: {
    id: string
    serverId?: string | null | undefined
  }): Promise<ResearchUpdateExperimentResult> {
    return experiment.updateExperiment(this.deps, request)
  }

  @Remote('readArtifact')
  readArtifact(request: { projectId: string; name: string }): Promise<ResearchArtifactResult> {
    return experiment.readArtifact(this.deps, request)
  }

  @Remote('listFigures')
  listFigures(request: { projectId: string; dir?: string | undefined }): Promise<ResearchFiguresResult> {
    return experiment.listFigures(this.deps, request)
  }

  // paper domain: source / reorder / bibliography
  @Remote('getPaperSource')
  getPaperSource(request: { projectId: string; dir?: string | undefined }): Promise<ResearchPaperSourceResult> {
    return paper.getPaperSource(this.deps, request)
  }

  @Remote('savePaperSource')
  savePaperSource(request: {
    projectId: string
    content: string
    baseMtimeMs: number
    dir?: string | undefined
  }): Promise<ResearchSavePaperSourceResult> {
    return paper.savePaperSource(this.deps, request)
  }

  @Remote('reorderPaperSections')
  reorderPaperSections(request: {
    projectId: string
    moves: SectionMove[]
    baseOutline: string[]
    dir?: string | undefined
  }): Promise<ResearchSavePaperSourceResult> {
    return paper.reorderPaperSections(this.deps, request)
  }

  @Remote('reorderPaperSubsections')
  reorderPaperSubsections(request: {
    projectId: string
    moves: SubsectionMove[]
    baseOutline: SectionOutlineTitles[]
    dir?: string | undefined
  }): Promise<ResearchSavePaperSourceResult> {
    return paper.reorderPaperSubsections(this.deps, request)
  }

  @Remote('getBibliography')
  getBibliography(request: { projectId: string; dir?: string | undefined }): Promise<ResearchBibliographyResult> {
    return paper.getBibliography(this.deps, request)
  }

  @Remote('saveBibliography')
  saveBibliography(request: {
    projectId: string
    entries: BibEntry[]
    baseMtimeMs: number | null
    dir?: string | undefined
  }): Promise<ResearchSaveBibliographyResult> {
    return paper.saveBibliography(this.deps, request)
  }

  @Remote('importPapersToBib')
  importPapersToBib(request: {
    projectId: string
    arxivIds: string[]
    dir?: string | undefined
  }): Promise<ResearchImportBibResult> {
    return paper.importPapersToBib(this.deps, request)
  }

  // paper domain: compile status flows through this.state
  @Remote('compile')
  compile(request: { projectId?: string; dir?: string | undefined }, signal: AbortSignal): Promise<ResearchCompileResult> {
    return paper.compile(this.deps, this.state, request, signal)
  }

  @Remote('getCompileStatus')
  getCompileStatus(request: { projectId?: string }): Promise<ResearchCompileStatusResult> {
    return paper.getCompileStatus(this.deps, this.state, request)
  }

  // paper domain: compile snapshots (pure filesystem storage)
  @Remote('listPaperSnapshots')
  listPaperSnapshots(request: { projectId: string }): Promise<ResearchPaperSnapshotsResult> {
    return paperSnapshots.listPaperSnapshots(this.deps, request)
  }

  @Remote('getPaperSnapshot')
  getPaperSnapshot(request: { projectId: string; id: string }): Promise<ResearchPaperSnapshotResult> {
    return paperSnapshots.getPaperSnapshot(this.deps, request)
  }

  @Remote('revertPaperSnapshot')
  revertPaperSnapshot(request: {
    projectId: string
    id: string
    baseMtimeMs: number
    dir?: string | undefined
  }): Promise<ResearchRevertPaperSnapshotResult> {
    return paperSnapshots.revertPaperSnapshot(this.deps, request)
  }

  // experiment domain: figures
  @Remote('deleteFigure')
  deleteFigure(request: { projectId: string; relPath: string; dir?: string | undefined }): Promise<ResearchDeleteFigureResult> {
    return experiment.deleteFigure(this.deps, request)
  }

  @Remote('renameFigure')
  renameFigure(request: {
    projectId: string
    relPath: string
    newName: string
    dir?: string | undefined
  }): Promise<ResearchRenameFigureResult> {
    return experiment.renameFigure(this.deps, request)
  }

  @Remote('updateFigure')
  updateFigure(request: {
    projectId: string
    relPath: string
    caption: string
  }): Promise<ResearchUpdateFigureResult> {
    return experiment.updateFigure(this.deps, request)
  }

  @Remote('convertFigure')
  convertFigure(request: { projectId: string; relPath: string; dir?: string | undefined }): Promise<ResearchConvertFigureResult> {
    return experiment.convertFigure(this.deps, request)
  }

  @Remote('saveFigure')
  saveFigure(request: {
    projectId: string
    name: string
    content: string
    caption?: string | undefined
    dir?: string | undefined
  }): Promise<ResearchSaveFigureResult> {
    return experiment.saveFigure(this.deps, request)
  }

  // venue domain: target-conference templates
  @Remote('listVenueTemplates')
  listVenueTemplates(): Promise<ResearchVenueTemplatesResult> {
    return venue.listVenueTemplates()
  }

  @Remote('applyVenueTemplate')
  applyVenueTemplate(request: {
    projectId: string
    dir?: string | undefined
    templateId?: string | undefined
    customName?: string | undefined
  }): Promise<ResearchApplyVenueResult> {
    return venue.applyVenueTemplate(this.deps, request)
  }

  @Remote('clearVenueTemplate')
  clearVenueTemplate(request: { projectId: string }): Promise<ResearchClearVenueResult> {
    return venue.clearVenueTemplate(this.deps, request)
  }

  // meeting domain: group-meeting pptx decks
  @Remote('generateMeetingDeck')
  generateMeetingDeck(request: {
    projectId: string
    title?: string | undefined
    presenter?: string | undefined
    date?: string | undefined
    paperIds?: readonly string[] | undefined
    figureRelPaths?: readonly string[] | undefined
    include?: Partial<MeetingInclude> | undefined
  }): Promise<ResearchGenerateMeetingResult> {
    return meeting.generateMeetingDeck(this.deps, request)
  }

  @Remote('listMeetingDecks')
  listMeetingDecks(request: { projectId: string }): Promise<ResearchMeetingDecksResult> {
    return meeting.listMeetingDecks(this.deps, request)
  }

  @Remote('deleteMeetingDeck')
  deleteMeetingDeck(request: { projectId: string; file: string }): Promise<ResearchDeleteMeetingDeckResult> {
    return meeting.deleteMeetingDeck(this.deps, request)
  }

  // server domain
  @Remote('listServers')
  listServers(): Promise<ResearchListServersResult> {
    return server.listServers(this.deps)
  }

  @Remote('saveServer')
  saveServer(request: { server: ServerInput }): Promise<ResearchSaveServerResult> {
    return server.saveServer(this.deps, request)
  }

  @Remote('deleteServer')
  deleteServer(request: { id: string }): Promise<ResearchDeleteServerResult> {
    return server.deleteServer(this.deps, request)
  }

  @Remote('checkServer')
  checkServer(request: { id: string }): Promise<ResearchCheckServerResult> {
    return server.checkServer(this.deps, request)
  }

  // job counter flows through this.state
  @Remote('submitJob')
  submitJob(request: {
    serverId: string
    command: string
    experimentId?: string | undefined
  }): Promise<ResearchSubmitJobResult> {
    return server.submitJob(this.deps, this.state, request)
  }

  @Remote('listJobs')
  listJobs(request: { serverId?: string }): Promise<ResearchListJobsResult> {
    return server.listJobs(this.deps, request)
  }

  @Remote('deleteJob')
  deleteJob(request: { id: string }): Promise<ResearchDeleteJobResult> {
    return server.deleteJob(this.deps, request)
  }

  // wiki-admin domain: export / import / backups
  @Remote('exportWiki')
  exportWiki(): Promise<ResearchExportWikiResult> {
    return wikiAdmin.exportWiki(this.deps)
  }

  @Remote('importWiki')
  importWiki(request: {
    snapshot: ResearchWikiSnapshot
    mode: ResearchImportWikiMode
    confirmReplace?: boolean
  }): Promise<ResearchImportWikiResult> {
    return wikiAdmin.importWiki(this.deps, request)
  }

  @Remote('listBackups')
  listBackups(): Promise<ResearchListBackupsResult> {
    return wikiAdmin.listBackups(this.deps)
  }
}

export default ResearchService
