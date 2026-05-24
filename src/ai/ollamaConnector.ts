import { readFile, writeFile } from 'fs/promises';

interface OllamaResponse {
  response: string;
}

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const DEFAULT_MODEL = 'llama3'; // Can be changed to llama3.1, mistral, etc.

/**
 * Checks if the local Ollama service is running and responsive.
 */
export async function checkOllamaStatus(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/', { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Helper to query the local Ollama API.
 */
async function queryOllama(prompt: string, model: string = DEFAULT_MODEL): Promise<string> {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.2 // Lower temperature for more predictable code generation
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama responded with status ${response.status}`);
  }

  const data = (await response.json()) as OllamaResponse;
  
  // Strip markdown code fences if the model wraps its output in them
  return data.response.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/g, '$1').trim();
}

/**
 * Reads a file, hands the code over to Ollama to fix a lazy comment placeholder, 
 * and rewrites the file with actual production logic.
 */
export async function fixPlaceholderInFile(
  filePath: string,
  lineNumber: number,
  placeholderText: string
): Promise<void> {
  const fileContent = await readFile(filePath, 'utf-8');
  
  const prompt = `
You are an expert software engineer. I have a file with a lazy AI placeholder comment.
Your job is to replace that specific line with real, working, robust code implementation.

File Path: ${filePath}
Line with issue: ${lineNumber} -> ${placeholderText}

Here is the entire file content:
---
${fileContent}
---

Provide ONLY the full updated code for the file. 
Do not include explanations, do not include introduction text, and do not wrap your entire response in markdown code blocks. 
Just output the raw, completed source code.
`;

  const updatedCode = await queryOllama(prompt);
  if (updatedCode && updatedCode.length > 10) {
    await writeFile(filePath, updatedCode, 'utf-8');
  } else {
    throw new Error("Received empty or invalid code from Ollama.");
  }
}

/**
 * Merges structurally identical duplicate functions into a shared structure 
 * or notifies the user how to fix it.
 */
export async function fixDuplicateFunctions(
  file1: string,
  line1: number,
  name1: string,
  file2: string,
  line2: number,
  name2: string
): Promise<string> {
  const prompt = `
You are an expert architect. The following two functions are structurally identical duplicates found in different files:
1. Function "${name1}" in file "${file1}" at line ${line1}
2. Function "${name2}" in file "${file2}" at line ${line2}

Provide a clean, unified refactoring strategy. Show exactly how to extract this into a single reusable helper function, and how the original files should import it. 
Keep your response concise, clear, and focused entirely on the code refactor.
`;

  return await queryOllama(prompt);
}
