import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Window } from 'happy-dom';

export const groups = [
  { key: 'reference', count: 24, section: 'sec-references', sourceSection: 'portfolio-references' },
  { key: 'r9', count: 29, section: 'sec-original', sourceSection: 'portfolio-original' },
  { key: 'concept', count: 29, section: 'sec-future', sourceSection: null },
];
const digest = value => createHash('sha256').update(value).digest('hex');
const clean = value => value.replace(/\s+/g, ' ').trim();

export async function checkedFile(root, relative) {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('unsafe_source_path');
  const base = await realpath(root), filename = await realpath(path.resolve(base, relative));
  if (!filename.startsWith(base + path.sep)) throw new Error('source_outside_workspace');
  const bytes = await readFile(filename);
  return { path: relative.split(path.sep).join('/'), sha256: digest(bytes), bytes: bytes.length };
}

function documentFrom(html) {
  const window = new Window({ settings: {
    enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true, enableImageFileLoading: false,
    enableFileSystemHttpRequests: false,
  } });
  window.document.write(html);
  return window;
}

export async function inventory(root) {
  const galleryPath = 'designs/showcase_consolidado/index.html';
  const originalPath = 'designs/acervo82/sources/showcase-original.html';
  const galleryFile = await checkedFile(root, galleryPath), originalFile = await checkedFile(root, originalPath);
  const gallery = documentFrom(await readFile(path.join(root, galleryPath), 'utf8'));
  const original = documentFrom(await readFile(path.join(root, originalPath), 'utf8'));
  try {
    const entries = [], assets = new Map();
    const asset = async relative => {
      if (!assets.has(relative)) assets.set(relative, await checkedFile(root, relative));
      return relative;
    };
    for (const group of groups) {
      const boards = [...gallery.document.querySelectorAll(`#${group.section} .ratio-4-5`)];
      if (boards.length !== group.count) throw new Error(`roster_count_invalid:${group.key}`);
      const htmlBoards = group.sourceSection
        ? [...original.document.querySelectorAll(`#${group.sourceSection} .ratio-4-5`)]
        : [...original.document.querySelectorAll('#portfolio-future .ratio-4-5')];
      if (htmlBoards.length !== group.count) throw new Error(`source_count_invalid:${group.key}`);
      for (const [index, board] of boards.entries()) {
        const num = String(index + 1).padStart(2, '0');
        const images = [...board.querySelectorAll('img')];
        const main = group.key === 'reference' ? images.find(i => i.id.endsWith('-foto')) : images[0];
        if (!main) throw new Error('source_image_missing');
        const sourceNumber = group.key === 'reference' ? main.id.match(/^img-ref-(\d+)-foto$/)?.[1] : num;
        if (!sourceNumber) throw new Error('reference_identity_invalid');
        const imageFiles = [];
        for (const image of images) imageFiles.push(await asset(path.posix.join('designs/showcase_consolidado', image.getAttribute('src'))));
        const sourceIndex = Number(sourceNumber) - 1;
        const sourceBoard = htmlBoards[sourceIndex];
        if (!sourceBoard) throw new Error('source_board_missing');
        const card = board.parentElement;
        const title = card.querySelector('h4')?.textContent || main.getAttribute('alt') || sourceNumber;
        entries.push({
          id: `acervo82-${group.key}-${sourceNumber}`, group: group.key, order: Number(sourceNumber),
          title: clean(title), sourceKind: group.key === 'reference' ? 'raster' : 'html-css-svg',
          preview: await asset(path.posix.join('designs/showcase_consolidado', main.getAttribute('src'))),
          evidenceImages: imageFiles,
          source: { path: originalPath, sha256: originalFile.sha256,
            selector: group.sourceSection ? `#${group.sourceSection} .ratio-4-5` : '#portfolio-future .ratio-4-5',
            index: sourceIndex, svgCount: sourceBoard.querySelectorAll('svg').length },
          capabilities: null,
        });
      }
    }
    const integrityPath = 'designs/acervo82/sources/integrity.json';
    const integrity = JSON.parse(await readFile(path.join(root, integrityPath), 'utf8'));
    for (const item of integrity.files) {
      const relative = path.posix.join('designs/acervo82/sources', item.path);
      const actual = await checkedFile(root, relative);
      if (actual.sha256 !== item.sha256) throw new Error(`archived_source_changed:${item.path}`);
      assets.set(relative, actual);
    }
    assets.set(integrityPath, await checkedFile(root, integrityPath));
    entries.sort((a, b) => groups.findIndex(g => g.key === a.group) - groups.findIndex(g => g.key === b.group) || a.order - b.order);
    return { format: 'postspark.acervo82.roster', version: 1,
      purpose: 'complete-replacement-of-selection-catalog', artboard: { width: 1080, height: 1350 },
      gallery: galleryFile, original: originalFile, entries,
      files: [...assets.values()].sort((a, b) => a.path.localeCompare(b.path)),
      externalDependencies: [...new Set((await readFile(path.join(root, originalPath), 'utf8')).match(/https:\/\/[^\s'"<>]+/g) || [])].sort(),
      policy: { legacyCatalogEligible: false, inheritTopicRestrictions: false,
        sampleCopyIsFactualEvidence: false, automaticVisualApproval: false },
    };
  } finally { await gallery.happyDOM.close(); await original.happyDOM.close(); }
}

export function validateRoster(roster) {
  if (roster.format !== 'postspark.acervo82.roster' || roster.version !== 1 || roster.entries.length !== 82) throw new Error('roster_invalid');
  const ids = roster.entries.map(e => e.id);
  if (new Set(ids).size !== 82) throw new Error('roster_duplicate_identity');
  for (const group of groups) for (let i = 1; i <= group.count; i++) {
    const id = `acervo82-${group.key}-${String(i).padStart(2, '0')}`;
    if (!ids.includes(id)) throw new Error(`roster_identity_missing:${id}`);
  }
  return roster;
}

export function validateRelease(roster, receipt) {
  validateRoster(roster);
  if (receipt?.format !== 'postspark.acervo82.release' || receipt.version !== 1 || receipt.entries?.length !== 82) throw new Error('release_incomplete');
  const ids = new Set(), definitions = new Set();
  for (const entry of receipt.entries) {
    if (ids.has(entry.id) || !roster.entries.some(e => e.id === entry.id)) throw new Error('release_roster_mismatch');
    ids.add(entry.id);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(entry.definitionId || '') || !/^[a-f0-9]{64}$/.test(entry.definitionHash || '')) throw new Error('release_definition_missing');
    if (definitions.has(entry.definitionId)) throw new Error('release_definition_reused');
    definitions.add(entry.definitionId);
    for (const key of ['visualReview','alternateCopy','contentFit','saveReopen','export']) {
      if (!/^[a-f0-9]{64}$/.test(entry.evidence?.[key] || '')) throw new Error(`release_evidence_missing:${key}`);
    }
  }
  // This validates coverage and receipt shape only. It does not authenticate the
  // evidence or grant publication; those require the existing catalog gates.
  return true;
}
