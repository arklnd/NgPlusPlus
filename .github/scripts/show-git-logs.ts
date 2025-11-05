import { simpleGit } from 'simple-git';
import path from 'path';

async function main() {
    const gitDir = path.join(process.cwd(), 'test/assets/git-git');
    const git = simpleGit().env({ GIT_DIR: gitDir });

    // Equivalent to: git log --oneline
    const onelineOutput = await git.raw(['log', '--oneline']);
    console.log(onelineOutput.trim());

    // Equivalent to: git rev-list --reverse HEAD | tail -n +4 | xargs git log -p --no-walk --reverse
    const revListOutput = await git.raw(['rev-list', '--reverse', 'HEAD']);
    const allHashes = revListOutput.trim().split('\n');
    const hashesToShow = allHashes//.slice(3); // Skip the first 3 commits

    const red = '\x1b[31m';
    const green = '\x1b[32m';
    const reset = '\x1b[0m';

    let commitCount = 1;
    for (const hash of hashesToShow) {
        const patchOutput = await git.raw(['log', '-p', '--no-walk', '--reverse', hash]);
        const lines = patchOutput.split('\n');
        const filteredLines = lines.filter(line => !line.startsWith('commit ') && !line.startsWith('Author: ') && !line.startsWith('Date: '));
        const coloredOutput = filteredLines.map(line => {
            if (line.startsWith('-')) return red + line + reset;
            if (line.startsWith('+')) return green + line + reset;
            return line;
        }).join('\n');
        console.log(`::group::Commit ${commitCount}: ${hash}`);
        console.log(coloredOutput.trim());
        console.log('::endgroup::');
        commitCount++;
    }
}

main().catch(console.error);
