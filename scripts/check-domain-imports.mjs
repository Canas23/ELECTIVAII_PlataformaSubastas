import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const domainRoot = resolve('src/domain');
const importPattern = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [];
  });
}

const violations = [];
for (const file of files(domainRoot)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    const isRelative = specifier.startsWith('.');
    const target = isRelative ? resolve(dirname(file), specifier) : null;
    if (!isRelative || !target.startsWith(domainRoot)) {
      violations.push(`${relative(process.cwd(), file)} → importa "${specifier}"`);
    }
  }
}

if (violations.length > 0) {
  console.error('✗ La capa de dominio depende de elementos externos:\n  ' + violations.join('\n  '));
  process.exit(1);
}
console.log(`✓ Dominio independiente: ${files(domainRoot).length} archivos sin dependencias de infraestructura.`);
