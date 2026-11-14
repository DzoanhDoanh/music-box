import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const forbidden =
  /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|YOUTUBE_API_KEY|sb_secret_[\w-]{20,}|AIza[\w-]{35}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
let files = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (/\.(?:js|html|json|css|map)$/.test(path)) {
      files++;
      if (forbidden.test(await readFile(path, 'utf8')))
        throw new Error(`Server secret marker in client artifact: ${path}`);
    }
  }
}
await scan('dist/client');
console.log(
  `PASS ${files} client artifacts checked for server secret markers and known key formats. Heuristic check, not a complete secret audit.`,
);
