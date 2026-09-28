import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteDirectory = path.resolve(scriptDirectory, '..');
// CUSTOMIZE: source and generated roots together; never point output at authored docs.
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
    .relative('.', filePath)
    .slice(0, -path.extname(filePath).length)
    .split(path.sep)
    .map((segment) => segment.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .join('/');
}

function removeLeadingHeading(content) {
  return content.replace(/^#\s+.+(?:\r?\n){1,2}/, '');
}

function rewriteLocalMarkdownLinks(content, sourceFile, slugByFilePath) {
  return content.replace(
    /\]\((?!https?:\/\/|mailto:|#)([^)\s]+)\)/g,
    (match, destination) => {
      const [fileName, fragment] = destination.split('#');
      if (!fileName.toLowerCase().endsWith('.md')) {
        return match;
      }

      const destinationPath = path.resolve(path.dirname(sourceFile), fileName);
      const slug = slugByFilePath.get(destinationPath);
      if (!slug) {
        return match;
      }

      const suffix = fragment ? `#${fragment}` : '';
      const relativeRoute = path.posix.relative(slugFromFilePath(sourceFile), slug) || '.';
      return `](${relativeRoute}/${suffix})`;
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

export async function syncDocs({
  logger = console,
  source = sourceDirectory,
  destination = generatedDirectory,
} = {}) {
  const relativeOutput = path.relative(source, destination);
  const relativeSource = path.relative(destination, source);
  const within = (relative) => !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  if (within(relativeOutput) || within(relativeSource)) {
    throw new Error('Authored and generated documentation roots must not overlap.');
  }
  const sourceFiles = await collectMarkdownFiles(source);
  const slugByFilePath = new Map(
    sourceFiles.map((filePath) => [
      path.resolve(filePath),
      slugFromFilePath(filePath),
    ]),
  );
  if (new Set(slugByFilePath.values()).size !== sourceFiles.length) {
    throw new Error('Documentation file paths produce duplicate page routes.');
  }

  await mkdir(destination, { recursive: true });

  const existingFiles = await collectMarkdownFiles(destination);
  const sourceFileSet = new Set(sourceFiles.map(relativeFileKey));

  for (const existingFile of existingFiles) {
    if (!sourceFileSet.has(relativeFileKey(existingFile))) {
      await rm(path.join(destination, existingFile));
    }
  }

  for (const sourceFile of sourceFiles) {
    const sourcePath = path.join(source, sourceFile);
    const targetPath = path.join(destination, sourceFile);
    const sourceContent = await readFile(sourcePath, 'utf8');
    const title = titleFromContent(sourceContent, sourceFile);
    const rewrittenContent = rewriteLocalMarkdownLinks(
      sourceContent,
      sourceFile,
      slugByFilePath,
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
                        })
                        .catch((error) => {
                          logger.error(`Documentation synchronization failed: ${error.message}`);
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
