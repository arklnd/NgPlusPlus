import { simpleGit } from 'simple-git';
import path from 'path';

async function main() {
    const gitDir = path.join(process.cwd(), 'test/assets/git-git');
    const git = simpleGit().env({ GIT_DIR: gitDir });

    // Equivalent to: git log --oneline
    const onelineOutput = await git.raw(['log', '--oneline', '--reverse']);
    console.log(onelineOutput.trim().split('\n').map((line,index) => `🚀 [Commit ${index + 1}]: ${line}`).join('\n'));

    // Equivalent to: git rev-list --reverse HEAD | tail -n +4 | xargs git log -p --no-walk --reverse
    let commitCount = 0;
    const revListOutput = await git.raw(['rev-list', '--reverse', 'HEAD']);
    const allHashes = revListOutput.trim().split('\n');
    const hashesToShow = allHashes.slice(commitCount); // Skip the first 3 commits

    const red = '\x1b[31m';
    const green = '\x1b[32m';
    const reset = '\x1b[0m';

    for (const hash of hashesToShow) {
        commitCount++;
        const patchOutput = await git.raw(['log', '-p', '--no-walk', '--reverse', hash]);
        const lines = patchOutput.split('\n');
        const initialFiltered = lines.filter(line => !line.startsWith('commit ') && !line.startsWith('Author: ') && !line.startsWith('Date: '));
        let finalFiltered = [];
        let skip = false;
        for (const line of initialFiltered) {
            if (line.startsWith('diff --git a/package-lock.json b/package-lock.json')) {
                skip = true;
                continue;
            } else if (line.startsWith('diff --git ')) {
                skip = false;
            }
            if (!skip) {
                finalFiltered.push(line);
            }
        }
        const coloredOutput = finalFiltered.map(line => {
            if (line.startsWith('-')) return red + line + reset;
            if (line.startsWith('+')) return green + line + reset;
            return line;
        }).join('\n');
        console.log(`::group::------[Commit ${commitCount}]: ${hash} -----------------------------------------------------------------------------------------------------`);
        console.log('🚀 ' + coloredOutput.trim());
        console.log('::endgroup::');
    }
}

main().catch(console.error);
