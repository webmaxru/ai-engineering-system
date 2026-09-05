import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteDirectory = path.resolve(scriptDirectory, '..');
const sourceDirectory = path.resolve(siteDirectory, '..', 'docs');
const generatedDirectory = path.join(
  siteDirectory,
  'src',
  'content',
  'docs',
  'reference',
);

function isMarkdownFile(filePath) {
  return filePath.toLowerCase().endsWith('.md');
}

function isSourceFile(filePath) {
  const relativePath = path.relative(sourceDirectory, path.resolve(filePath));
  return (
    relativePath.length > 0 &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

async function collectMarkdownFiles(directory, relativeDirectory = '') {
  const entries = await readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(directory, relativePath)));
      continue;
    }

    if (entry.isFile() && isMarkdownFile(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

function titleFromContent(content, filePath) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading;
  }

  return path.basename(filePath, path.extname(filePath));
}

function slugFromFilePath(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function removeLeadingHeading(content) {
  return content.replace(/^#\s+.+(?:\r?\n){1,2}/, '');
}

function rewriteLocalMarkdownLinks(content, slugByFileName) {
  return content.replace(
    /\]\((?!https?:\/\/|mailto:|#)([^)\s]+)\)/g,
    (match, destination) => {
      const [fileName, fragment] = destination.split('#');
      if (!fileName.toLowerCase().endsWith('.md')) {
        return match;
      }

      const normalizedFileName = path.basename(fileName).toLowerCase();
      const slug = slugByFileName.get(normalizedFileName);
      if (!slug) {
        return match;
      }

      const suffix = fragment ? `#${fragment}` : '';
      return `](../${slug}/${suffix})`;
    },
  );
}

function addStarlightFrontmatter(content, title) {
  const body = removeLeadingHeading(content).trimStart();
  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${body.trimEnd()}\n`;
}

function relativeFileKey(filePath) {
  return path.normalize(filePath).replaceAll(path.sep, '/').toLowerCase();
}

export async function syncDocs({ logger = console } = {}) {
  const sourceFiles = await collectMarkdownFiles(sourceDirectory);
  const slugByFileName = new Map(
    sourceFiles.map((filePath) => [
      path.basename(filePath).toLowerCase(),
      slugFromFilePath(filePath),
    ]),
  );

  await mkdir(generatedDirectory, { recursive: true });

  const existingFiles = await collectMarkdownFiles(generatedDirectory);
  const sourceFileSet = new Set(sourceFiles.map(relativeFileKey));

  for (const existingFile of existingFiles) {
    if (!sourceFileSet.has(relativeFileKey(existingFile))) {
      await rm(path.join(generatedDirectory, existingFile));
    }
  }

  for (const sourceFile of sourceFiles) {
    const sourcePath = path.join(sourceDirectory, sourceFile);
    const targetPath = path.join(generatedDirectory, sourceFile);
    const sourceContent = await readFile(sourcePath, 'utf8');
    const title = titleFromContent(sourceContent, sourceFile);
    const rewrittenContent = rewriteLocalMarkdownLinks(
      sourceContent,
      slugByFileName,
    );

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(
      targetPath,
      addStarlightFrontmatter(rewrittenContent, title),
      'utf8',
    );
  }

  logger.info?.(`Synchronized ${sourceFiles.length} documentation source files.`);
}

export function repositoryDocsIntegration() {
  return {
    name: 'repository-docs-sync',
    hooks: {
      'astro:config:setup': async ({ command, logger, updateConfig }) => {
        await syncDocs({ logger });

        if (command !== 'dev') {
          return;
        }

        updateConfig({
          vite: {
            plugins: [
              {
                name: 'watch-repository-docs',
                configureServer(server) {
                  server.watcher.add(sourceDirectory);

                  let pendingSync = Promise.resolve();
                  let timer;

                  const queueSync = () => {
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                      pendingSync = pendingSync
                        .then(() => syncDocs({ logger }))
                        .then(() => {
                          server.ws.send({ type: 'full-reload', path: '*' });
                        });
                    }, 100);
                  };

                  server.watcher.on('all', (event, filePath) => {
                    if (
                      ['add', 'change', 'unlink'].includes(event) &&
                      isMarkdownFile(filePath) &&
                      isSourceFile(filePath)
                    ) {
                      queueSync();
                    }
                  });
                },
              },
            ],
          },
        });
      },
    },
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await syncDocs();
}
