#!/usr/bin/env node

import process from 'process';
import { crawlDirectory } from './core/crawler.js';
import { scanComments, CommentIssue } from './core/scanners/commentScanner.js';
import { extractFunctions, findDuplicates, FunctionInfo } from './core/scanners/astScanner.js';
import { calculateAuditSummary } from './core/issueScorer.js';
import { checkOllamaStatus, fixPlaceholderInFile, fixDuplicateFunctions } from './ai/ollamaConnector.js';
import { renderIntro, createSpinner, renderReport, promptForFix, renderMessage, renderOutro } from './cli/interface.js';

async function main() {
  renderIntro();

  const targetDir = process.cwd();
  const s = createSpinner();

  // --- STEP 1 & 2: Crawl and Scan ---
  s.start('Crawling project files...');
  const files = await crawlDirectory(targetDir);
  
  if (files.length === 0) {
    s.stop('No valid JS/TS files found.');
    renderOutro('Exiting.');
    process.exit(0);
  }

  s.message(`Scanning ${files.length} files for bloat and AI placeholders...`);

  const allCommentIssues: CommentIssue[] = [];
  let allFunctions: FunctionInfo[] = [];

  // Process files in parallel for speed
  await Promise.all(
    files.map(async (file) => {
      const [comments, funcs] = await Promise.all([
        scanComments(file),
        extractFunctions(file)
      ]);
      
      allCommentIssues.push(...comments);
      allFunctions = allFunctions.concat(funcs);
    })
  );

  // --- STEP 3: Deep Audit (AST Duplicates) ---
  const duplicateClusters = findDuplicates(allFunctions);
  const summary = calculateAuditSummary(allCommentIssues, duplicateClusters);
  
  s.stop('Scan complete!');

  // --- STEP 4: Visual Report ---
  renderReport(allCommentIssues, duplicateClusters, summary);

  if (allCommentIssues.length === 0 && duplicateClusters.length === 0) {
    renderOutro('Zero bloat found. Your codebase is pristine!');
    process.exit(0);
  }

  // --- STEP 5: Zero-Cost Fix ---
  const wantsFix = await promptForFix();

  if (wantsFix) {
    s.start('Checking local Ollama connection...');
    const isOllamaOnline = await checkOllamaStatus();

    if (!isOllamaOnline) {
      s.stop('Ollama is unreachable.');
      renderMessage('Please ensure Ollama is installed and running locally on port 11434.', 'error');
      renderOutro('Fix aborted.');
      process.exit(1);
    }

    s.message('Ollama is analyzing and fixing your code. This may take a moment depending on your hardware...');

    try {
      // 1. Fix Placeholders by overwriting files
      for (const issue of allCommentIssues) {
        s.message(`Fixing placeholder in ${issue.filePath.split('/').pop()}...`);
        await fixPlaceholderInFile(issue.filePath, issue.line, issue.text);
        renderMessage(`✅ Fixed placeholder in ${issue.filePath}`, 'success');
      }

      // 2. Generate Merge Strategies for Duplicates
      // (We output the strategy rather than blindly overwriting multiple files to prevent destructive structural damage)
      for (let i = 0; i < duplicateClusters.length; i++) {
        const cluster = duplicateClusters[i];
        if (cluster.length >= 2) {
          s.message(`Analyzing duplicate cluster #${i + 1}...`);
          const fn1 = cluster[0];
          const fn2 = cluster[1];
          
          const strategy = await fixDuplicateFunctions(
            fn1.filePath, fn1.line, fn1.name,
            fn2.filePath, fn2.line, fn2.name
          );
          
          renderMessage(`\n💡 Refactor Strategy for Cluster #${i + 1}:\n${strategy}`, 'info');
        }
      }

      s.stop('AI Fix operations completed.');
    } catch (error) {
      s.stop('An error occurred during the AI fix process.');
      if (error instanceof Error) {
        renderMessage(error.message, 'error');
      } else {
        renderMessage(String(error), 'error');
      }
    }
  } else {
    renderMessage('No fixes applied.', 'info');
  }

  renderOutro('Keep your codebases lean and ghostly clean!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});