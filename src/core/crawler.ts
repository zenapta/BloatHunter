import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Directories that should always be skipped to keep the scan fast and relevant
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  'coverage'
]);

// Extensions we want to target for AI placeholders and duplicates
const TARGET_EXTENSIONS = /\.(js|ts|jsx|tsx)$/;

/**
 * Recursively crawls a target directory to find all JavaScript and TypeScript files.
 *
 * @param dir The starting absolute or relative directory path.
 * @returns A promise that resolves to an array of absolute file paths.
 */
export async function crawlDirectory(dir: string): Promise<string[]> {
  const fileList: string[] = [];

  async function walk(currentDir: string) {
    try {
      const dirents = await readdir(currentDir, { withFileTypes: true });

      for (const dirent of dirents) {
        const file = dirent.name;

        if (file.startsWith('.') || IGNORED_DIRECTORIES.has(file)) {
          continue;
        }

        const fullPath = join(currentDir, file);

        if (dirent.isDirectory()) {
          await walk(fullPath);
        } else if (dirent.isFile() && TARGET_EXTENSIONS.test(file)) {
          fileList.push(fullPath);
        }
      }
    } catch {
      // Quietly bypass directories that cannot be read due to permissions
    }
  }

  await walk(dir);
  return fileList;
}
