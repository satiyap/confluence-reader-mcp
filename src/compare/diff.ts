/**
 * Generate a git-style unified diff between two texts
 * This is a simple line-based diff implementation
 */

type DiffLine = {
  type: 'context' | 'add' | 'remove';
  line: string;
  oldLineNum?: number;
  newLineNum?: number;
};

function longestCommonSubsequence(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  return dp;
}

function buildDiff(a: string[], b: string[], dp: number[][]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = a.length;
  let j = b.length;
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'context', line: a[i - 1], oldLineNum: i, newLineNum: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', line: b[j - 1], newLineNum: j });
      j--;
    } else if (i > 0) {
      result.unshift({ type: 'remove', line: a[i - 1], oldLineNum: i });
      i--;
    }
  }
  
  return result;
}

function formatUnifiedDiff(
  oldLabel: string,
  newLabel: string,
  diffLines: DiffLine[],
  contextLines: number = 3
): string {
  if (diffLines.length === 0) {
    return `--- ${oldLabel}\n+++ ${newLabel}\n(no differences)\n`;
  }
  
  const output: string[] = [];
  output.push(`--- ${oldLabel}`);
  output.push(`+++ ${newLabel}`);
  
  // Group changes into hunks
  const hunks: DiffLine[][] = [];
  let currentHunk: DiffLine[] = [];
  let lastChangeIndex = -1;
  
  diffLines.forEach((line, idx) => {
    const isChange = line.type !== 'context';
    
    if (isChange) {
      // Include context before and after
      const start = Math.max(0, lastChangeIndex + 1, idx - contextLines);
      const contextBefore = diffLines.slice(start, idx).filter(l => !currentHunk.includes(l));
      currentHunk.push(...contextBefore, line);
      lastChangeIndex = idx;
    } else if (lastChangeIndex >= 0 && idx - lastChangeIndex <= contextLines) {
      // Context after a change
      currentHunk.push(line);
    } else if (lastChangeIndex >= 0 && idx - lastChangeIndex > contextLines) {
      // End current hunk
      if (currentHunk.length > 0) {
        hunks.push(currentHunk);
        currentHunk = [];
      }
      lastChangeIndex = -1;
    }
  });
  
  if (currentHunk.length > 0) {
    hunks.push(currentHunk);
  }
  
  // Format each hunk
  hunks.forEach(hunk => {
    const firstLine = hunk[0];
    const lastLine = hunk[hunk.length - 1];
    
    const oldStart = firstLine.oldLineNum || 1;
    const newStart = firstLine.newLineNum || 1;
    const oldCount = hunk.filter(l => l.type !== 'add').length;
    const newCount = hunk.filter(l => l.type !== 'remove').length;
    
    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    
    hunk.forEach(line => {
      switch (line.type) {
        case 'context':
          output.push(` ${line.line}`);
          break;
        case 'add':
          output.push(`+${line.line}`);
          break;
        case 'remove':
          output.push(`-${line.line}`);
          break;
      }
    });
  });
  
  return output.join('\n');
}

export function generateUnifiedDiff(
  oldText: string,
  newText: string,
  oldLabel: string = 'a/original',
  newLabel: string = 'b/modified'
): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  
  const dp = longestCommonSubsequence(oldLines, newLines);
  const diffLines = buildDiff(oldLines, newLines, dp);
  
  return formatUnifiedDiff(oldLabel, newLabel, diffLines);
}

export function generateDiffStats(oldText: string, newText: string): {
  additions: number;
  deletions: number;
  changes: number;
} {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  
  const dp = longestCommonSubsequence(oldLines, newLines);
  const diffLines = buildDiff(oldLines, newLines, dp);
  
  const additions = diffLines.filter(l => l.type === 'add').length;
  const deletions = diffLines.filter(l => l.type === 'remove').length;
  
  return {
    additions,
    deletions,
    changes: additions + deletions
  };
}
