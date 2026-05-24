import * as p from '@clack/prompts';
import pc from 'picocolors';
import { CommentIssue } from '../core/scanners/commentScanner.js';
import { FunctionInfo } from '../core/scanners/astScanner.js';
import { AuditSummary } from '../core/issueScorer.js';

/**
 * Render the application welcome banner.
 */
export function renderIntro(): void {
  p.intro(pc.bgMagenta(pc.black(' BLOATHUNTER ')));
}

/**
 * Simple factory to manage the terminal UI loader spinner.
 */
export function createSpinner() {
  return p.spinner();
}

function colorizeType(type: 'placeholder' | 'todo'): string {
  return type === 'todo' ? pc.red('TODO') : pc.yellow('PLACEHOLDER');
}

/**
 * Prints the results of the placeholder and duplicate audit in a clean layout.
 */
export function renderReport(
  commentIssues: CommentIssue[],
  duplicateClusters: FunctionInfo[][],
  summary: AuditSummary
): void {
  const severityLabel = {
    low: pc.green('LOW'),
    medium: pc.yellow('MEDIUM'),
    high: pc.red('HIGH'),
    critical: pc.bgRed(pc.white(' CRITICAL '))
  }[summary.severity];

  p.note(
    `${pc.bold('Smart Audit Report:')}
• ${pc.yellow(commentIssues.length)} lazy/placeholder comments detected.
• ${pc.red(duplicateClusters.length)} duplicated logic clusters detected.
• ${pc.green(commentIssues.length + duplicateClusters.length)} total bloat flags found.
• ${pc.bold('Health Score:')} ${pc.bold(String(summary.healthScore))}/100 (${pc.bold(summary.grade)})
• ${pc.bold('Severity:')} ${severityLabel}`,
    'Analysis Complete'
  );

  if (commentIssues.length === 0 && duplicateClusters.length > 0) {
    p.log.warn(pc.yellow('No placeholder comments found, but duplicated logic may still be hiding bloat.'));
  }

  if (summary.strengths.length > 0) {
    p.log.success(pc.green('Strengths:'));
    summary.strengths.forEach((strength) => p.log.step(`  • ${strength}`));
  }

  if (summary.risks.length > 0) {
    p.log.error(pc.red('Recommended Actions:'));
    summary.risks.forEach((recommendation) => p.log.step(`  • ${recommendation}`));
  }

  // 1. Print Lazy Comment Placeholders
  if (commentIssues.length > 0) {
    p.log.warn(pc.yellow(pc.bold('⚠️ AI PLACEHOLDER COMMENT ISSUES:')));
    commentIssues.forEach((issue) => {
      const shortPath = issue.filePath.split('/').slice(-3).join('/');
      p.log.step(
        `${pc.cyan(shortPath)}:${pc.magenta(issue.line)} ${pc.gray('[' + colorizeType(issue.type) + ']')}\n` +
        `   ${pc.gray(issue.text)}`
      );
    });
  }

  // 2. Print Structural Duplicates
  if (duplicateClusters.length > 0) {
    p.log.error(pc.red(pc.bold('🚨 STRUCTURAL DUPLICATE LOGIC FOUND:')));
    duplicateClusters.forEach((cluster, index) => {
      p.log.step(`${pc.bold(`Cluster #${index + 1}`)} — ${pc.yellow(cluster.length)} matching functions:`);
      cluster.forEach((fn) => {
        const shortPath = fn.filePath.split('/').slice(-3).join('/');
        p.log.message(`   • ${pc.green(fn.name)}() in ${pc.cyan(shortPath)} at line ${pc.magenta(fn.line)}`);
      });
    });

    p.note(
      'Bloathunter normalized function bodies by structure and identifier use, so renamed variables do not hide duplicates.',
      'Duplicate Logic Detector'
    );
  }
}

/**
 * Prompt the user for confirmation to auto-fix the codebase using Ollama.
 */
export async function promptForFix(): Promise<boolean> {
  const choice = await p.confirm({
    message: 'Would you like to initiate a Zero-Cost Fix using local Ollama (Llama 3)?',
    initialValue: true,
  });

  return typeof choice === 'boolean' ? choice : false;
}

/**
 * Renders a clean terminal message block.
 */
export function renderMessage(msg: string, type: 'info' | 'success' | 'error' = 'info'): void {
  if (type === 'success') p.log.success(pc.green(msg));
  else if (type === 'error') p.log.error(pc.red(msg));
  else p.log.info(pc.blue(msg));
}

/**
 * Render the application exit banner.
 */
export function renderOutro(msg: string = 'Keep your codebases lean and ghostly clean!'): void {
  p.outro(pc.bgMagenta(pc.black(` ${msg} `)));
}
